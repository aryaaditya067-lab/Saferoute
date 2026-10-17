package com.saferoute.geocode;

import com.fasterxml.jackson.databind.JsonNode;
import com.saferoute.common.ApiException;
import com.saferoute.common.HttpFetcher;
import com.saferoute.common.Json;
import com.saferoute.common.RequestGate;
import com.saferoute.common.TtlCache;
import com.saferoute.config.SafeRouteProperties;
import com.saferoute.geo.LatLng;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Place search and reverse geocoding through Photon (OpenStreetMap data). */
@Component
public class PhotonGeocoder {

    private final HttpFetcher http;
    private final String baseUrl;
    private final RequestGate gate = new RequestGate(350);
    private final TtlCache<List<PlaceDto>> cache = new TtlCache<>(200, Duration.ofHours(1));

    public PhotonGeocoder(HttpFetcher http, SafeRouteProperties properties) {
        this.http = http;
        this.baseUrl = properties.providers().geocoderUrl();
    }

    public List<PlaceDto> search(String query, int limit, LatLng near) {
        String q = query == null ? "" : query.trim().replaceAll("\\s+", " ");
        if (q.length() < 3) return List.of();
        int safeLimit = Math.max(1, Math.min(10, limit));
        StringBuilder url = new StringBuilder(baseUrl).append("/api/?q=").append(URLEncoder.encode(q, StandardCharsets.UTF_8))
                .append("&limit=").append(safeLimit).append("&lang=en");
        if (near != null) url.append(String.format(Locale.ROOT, "&lat=%.4f&lon=%.4f", near.lat(), near.lng()));
        return cachedFetch(url.toString());
    }

    public PlaceDto reverse(LatLng point) {
        String url = baseUrl + String.format(Locale.ROOT, "/reverse?lat=%.6f&lon=%.6f&lang=en&limit=1", point.lat(), point.lng());
        List<PlaceDto> results = cachedFetch(url);
        return results.isEmpty() ? null : results.get(0);
    }

    private List<PlaceDto> cachedFetch(String url) {
        List<PlaceDto> cached = cache.get(url);
        if (cached != null) return cached;
        gate.acquire();
        HttpFetcher.Response response = http.get(url, Map.of("Accept", "application/json"), Duration.ofSeconds(10), 2 * 1024 * 1024);
        if (response.status() == 429) throw new ApiException(ApiException.Code.RATE_LIMITED, "Search is busy. Please wait a moment.");
        if (!response.ok()) throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE, "The search service is having trouble right now.");
        List<PlaceDto> results = parse(response.body());
        cache.put(url, results);
        return results;
    }

    /** Package-private for tests. Mirrors the frontend's photonFeatureToLocation. */
    static List<PlaceDto> parse(String body) {
        JsonNode root = Json.parse(body, "the search service");
        List<PlaceDto> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (JsonNode f : root.path("features")) {
            JsonNode c = f.path("geometry").path("coordinates");
            if (!c.isArray() || c.size() < 2) continue;
            double lng = c.get(0).asDouble(), lat = c.get(1).asDouble();
            try {
                new LatLng(lat, lng);
            } catch (IllegalArgumentException e) {
                continue;
            }
            JsonNode p = f.path("properties");
            String street = text(p, "street");
            String streetLine = street.isEmpty() ? "" : (text(p, "housenumber").isEmpty() ? street : text(p, "housenumber") + " " + street);
            String name = firstNonBlank(text(p, "name"), streetLine, text(p, "locality"), text(p, "district"), text(p, "city"),
                    text(p, "county"), text(p, "state"), text(p, "country"),
                    String.format(Locale.ROOT, "%.5f, %.5f", lat, lng));
            List<String> parts = new ArrayList<>();
            Set<String> used = new LinkedHashSet<>();
            used.add(name.toLowerCase(Locale.ROOT));
            for (String part : List.of(text(p, "name").isEmpty() ? "" : streetLine, text(p, "locality"), text(p, "district"),
                    text(p, "city"), text(p, "state"), text(p, "postcode"), text(p, "country"))) {
                if (!part.isEmpty() && used.add(part.toLowerCase(Locale.ROOT))) parts.add(part);
            }
            String id = p.has("osm_type") && p.has("osm_id")
                    ? "osm:" + text(p, "osm_type") + p.path("osm_id").asLong()
                    : String.format(Locale.ROOT, "geo:%.6f,%.6f", lat, lng);
            if (!seen.add(id)) continue;
            out.add(new PlaceDto(id, name, parts.isEmpty() ? null : String.join(", ", parts), lat, lng, "search"));
        }
        return out;
    }

    private static String text(JsonNode node, String field) {
        return node.path(field).asText("").trim();
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) if (v != null && !v.isBlank()) return v;
        return "";
    }
}
