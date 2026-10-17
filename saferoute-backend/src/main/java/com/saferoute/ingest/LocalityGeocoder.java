package com.saferoute.ingest;

import com.fasterxml.jackson.databind.JsonNode;
import com.saferoute.common.HttpFetcher;
import com.saferoute.common.Json;
import com.saferoute.common.RequestGate;
import com.saferoute.config.SafeRouteProperties;
import com.saferoute.geo.BBox;
import com.saferoute.geo.Geo;
import com.saferoute.geo.LatLng;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Turns a news locality ("Jayanagar 4th Block") into a point + radius inside the configured city. */
@Component
public class LocalityGeocoder {

    public record Place(LatLng center, int radiusMeters, String label) {}

    private static final Set<String> TOO_BROAD = Set.of("city", "state", "county", "country", "region", "state_district");

    private final HttpFetcher http;
    private final String geocoderUrl;
    private final SafeRouteProperties.City city;
    private final BBox cityBox;
    private final int minRadius;
    private final int maxRadius;
    private final RequestGate gate = new RequestGate(1_000);

    public LocalityGeocoder(HttpFetcher http, SafeRouteProperties properties) {
        this.http = http;
        this.geocoderUrl = properties.providers().geocoderUrl();
        this.city = properties.city();
        SafeRouteProperties.BBoxConfig b = city.bbox();
        this.cityBox = new BBox(b.south(), b.west(), b.north(), b.east());
        this.minRadius = properties.safety().minIncidentRadiusMeters();
        this.maxRadius = properties.safety().maxIncidentRadiusMeters();
    }

    public Optional<Place> locate(String locality) {
        String query = locality.trim() + ", " + city.name();
        String url = geocoderUrl + "/api/?q=" + URLEncoder.encode(query, StandardCharsets.UTF_8)
                + "&limit=5&lang=en&bbox=" + cityBox.west() + "," + cityBox.south() + "," + cityBox.east() + "," + cityBox.north();
        gate.acquire();
        HttpFetcher.Response response = http.get(url, Map.of("Accept", "application/json"), Duration.ofSeconds(15), 2 * 1024 * 1024);
        if (!response.ok()) return Optional.empty();
        return pick(Json.parse(response.body(), "the geocoder"));
    }

    Optional<Place> pick(JsonNode root) {
        for (JsonNode feature : root.path("features")) {
            JsonNode coords = feature.path("geometry").path("coordinates");
            if (!coords.isArray() || coords.size() < 2) continue;
            LatLng point;
            try {
                point = new LatLng(coords.get(1).asDouble(), coords.get(0).asDouble());
            } catch (IllegalArgumentException e) {
                continue;
            }
            if (!cityBox.contains(point)) continue;
            JsonNode props = feature.path("properties");
            String type = props.path("type").asText("").toLowerCase(Locale.ROOT);
            String osmValue = props.path("osm_value").asText("").toLowerCase(Locale.ROOT);
            if (TOO_BROAD.contains(type) || TOO_BROAD.contains(osmValue)) continue;

            int radius = minRadius;
            JsonNode extent = props.path("extent");
            if (extent.isArray() && extent.size() == 4) {
                try {
                    LatLng nw = new LatLng(extent.get(1).asDouble(), extent.get(0).asDouble());
                    LatLng se = new LatLng(extent.get(3).asDouble(), extent.get(2).asDouble());
                    radius = (int) Math.round(Geo.distanceMeters(nw, se) / 2);
                } catch (IllegalArgumentException ignored) {
                    radius = minRadius;
                }
            } else if (Set.of("suburb", "neighbourhood", "quarter", "district", "locality").contains(type)
                    || Set.of("suburb", "neighbourhood", "quarter").contains(osmValue)) {
                radius = 800;
            }
            radius = Math.max(minRadius, Math.min(maxRadius, radius));
            String label = String.join(", ", java.util.stream.Stream.of(
                            props.path("name").asText(""), props.path("district").asText(""), props.path("city").asText(""))
                    .filter(s -> !s.isBlank()).distinct().toList());
            return Optional.of(new Place(point, radius, label));
        }
        return Optional.empty();
    }
}
