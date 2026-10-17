package com.saferoute.ingest;

import com.fasterxml.jackson.databind.JsonNode;
import com.saferoute.common.ApiException;
import com.saferoute.common.HttpFetcher;
import com.saferoute.common.Json;
import com.saferoute.config.SafeRouteProperties;
import com.saferoute.geo.BBox;
import com.saferoute.geo.LatLng;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Names and positions of the city's neighbourhoods from OpenStreetMap
 * (place=suburb/neighbourhood/quarter/locality), used to find which locality a
 * news headline or article is about without an AI model.
 */
@Component
public class LocalityGazetteer {

    public record Place(String name, String key, LatLng center, int radiusMeters) {}

    private static final Set<String> STOP_NAMES = Set.of(
            "market", "colony", "layout", "nagar", "extension", "stage", "phase", "block", "city", "town", "station",
            "main road", "cross", "circle", "east", "west", "north", "south", "central", "new", "old");

    private final HttpFetcher http;
    private final SafeRouteProperties properties;
    private volatile List<Place> places;

    public LocalityGazetteer(HttpFetcher http, SafeRouteProperties properties) {
        this.http = http;
        this.properties = properties;
    }

    /** Loads the gazetteer once (Overpass), then serves it from memory. */
    public synchronized List<Place> places() {
        if (places != null) return places;
        SafeRouteProperties.BBoxConfig b = properties.city().bbox();
        String box = String.format(Locale.ROOT, "%.4f,%.4f,%.4f,%.4f", b.south(), b.west(), b.north(), b.east());
        String query = "[out:json][timeout:90];nwr[\"place\"~\"^(suburb|neighbourhood|quarter|locality|village)$\"](" + box + ");out center tags;";
        HttpFetcher.Response r = http.postForm(properties.providers().overpassUrl(), Map.of("Accept", "application/json"),
                "data=" + URLEncoder.encode(query, StandardCharsets.UTF_8), Duration.ofSeconds(120), 32 * 1024 * 1024);
        if (!r.ok()) throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE, "Couldn't load locality names (HTTP " + r.status() + ").");
        places = parse(r.body(), properties.city().aliases(), properties.safety());
        return places;
    }

    static List<Place> parse(String body, List<String> cityAliases, SafeRouteProperties.Safety safety) {
        JsonNode root = Json.parse(body, "OpenStreetMap");
        Set<String> cityKeys = new HashSet<>();
        for (String a : cityAliases) cityKeys.add(normalize(a));
        List<Place> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode e : root.path("elements")) {
            JsonNode point = "node".equals(e.path("type").asText()) ? e : e.path("center");
            if (!point.has("lat")) continue;
            LatLng center;
            try {
                center = new LatLng(point.path("lat").asDouble(), point.path("lon").asDouble());
            } catch (IllegalArgumentException ex) {
                continue;
            }
            JsonNode tags = e.path("tags");
            String type = tags.path("place").asText("");
            int radius = switch (type) {
                case "suburb" -> 1200;
                case "village" -> 900;
                default -> 600;
            };
            radius = Math.max(safety.minIncidentRadiusMeters(), Math.min(safety.maxIncidentRadiusMeters(), radius));
            for (String field : List.of("name:en", "name", "alt_name", "old_name")) {
                for (String name : tags.path(field).asText("").split(";")) {
                    String clean = name.trim();
                    String key = normalize(clean);
                    if (key.length() < 4 || STOP_NAMES.contains(key) || cityKeys.contains(key) || !key.matches(".*[a-z].*")) continue;
                    if (!seen.add(key)) continue;
                    out.add(new Place(clean, key, center, radius));
                }
            }
        }
        // Longest names first, so "JP Nagar 6th Phase" wins over "JP Nagar".
        out.sort(Comparator.comparingInt((Place p) -> p.key().length()).reversed());
        return List.copyOf(out);
    }

    /** Finds the most specific locality named in the text. */
    public static Optional<Place> find(String text, List<Place> places) {
        String padded = " " + normalize(text) + " ";
        for (Place p : places) {
            if (padded.contains(" " + p.key() + " ")) return Optional.of(p);
        }
        return Optional.empty();
    }

    /**
     * Lower-case, letters/digits only, and initials joined: "J. P. Nagar" and "JP Nagar" both become "jp nagar".
     */
    public static String normalize(String text) {
        if (text == null) return "";
        String s = text.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
        // join runs of single letters: "j p nagar" -> "jp nagar"
        String prev;
        do {
            prev = s;
            s = s.replaceAll("(^|\\s)(\\p{L})\\s(?=\\p{L}(\\s|$))", "$1$2");
        } while (!s.equals(prev));
        return s.replaceAll("\\s+", " ");
    }

    /** For tests. */
    void setPlaces(List<Place> places) {
        this.places = places;
    }

    public static BBox around(Place p) {
        return BBox.around(List.of(p.center())).expand(p.radiusMeters());
    }
}
