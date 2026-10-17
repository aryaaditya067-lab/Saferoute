package com.saferoute.route;

import com.fasterxml.jackson.databind.JsonNode;
import com.saferoute.common.ApiException;
import com.saferoute.common.HttpFetcher;
import com.saferoute.common.Json;
import com.saferoute.common.RequestGate;
import com.saferoute.config.SafeRouteProperties;
import com.saferoute.geo.LatLng;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** OSRM route service on OpenStreetMap data (FOSSGIS instances: car, bike, foot). */
@Component
public class OsrmClient {

    private final HttpFetcher http;
    private final String baseUrl;
    // FOSSGIS asks for at most one request per second.
    private final RequestGate gate = new RequestGate(1_000);

    public OsrmClient(HttpFetcher http, SafeRouteProperties properties) {
        this.http = http;
        this.baseUrl = properties.providers().routerUrl();
    }

    public List<RouteCandidate> route(List<LatLng> waypoints, TravelMode mode, boolean alternatives) {
        String coordinates = waypoints.stream()
                .map(p -> String.format(Locale.ROOT, "%.6f,%.6f", p.lng(), p.lat()))
                .collect(Collectors.joining(";"));
        String url = baseUrl + "/" + mode.osrmPath + "/route/v1/driving/" + coordinates
                + "?overview=full&geometries=geojson&steps=true&alternatives=" + (alternatives ? "3" : "false");
        gate.acquire();
        HttpFetcher.Response response = http.get(url, Map.of("Accept", "application/json"), Duration.ofSeconds(20), 16 * 1024 * 1024);
        if (response.status() == 429) {
            throw new ApiException(ApiException.Code.RATE_LIMITED, "The routing service is busy. Please try again shortly.");
        }
        if (response.status() >= 500) {
            throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE, "The routing service is having trouble right now.");
        }
        return parse(response.body());
    }

    /** Package-private for tests. */
    static List<RouteCandidate> parse(String body) {
        JsonNode root = Json.parse(body, "the routing service");
        String code = root.path("code").asText("");
        if (!"Ok".equals(code)) throw noRoute(code);
        List<RouteCandidate> out = new ArrayList<>();
        for (JsonNode route : root.path("routes")) {
            List<LatLng> geometry = new ArrayList<>();
            for (JsonNode c : route.path("geometry").path("coordinates")) {
                geometry.add(new LatLng(c.get(1).asDouble(), c.get(0).asDouble()));
            }
            if (geometry.size() < 2) continue;
            List<String> summaries = new ArrayList<>();
            for (JsonNode leg : route.path("legs")) {
                String s = leg.path("summary").asText("").trim();
                if (!s.isEmpty()) summaries.add(s);
            }
            out.add(new RouteCandidate(geometry, route.path("distance").asDouble(), route.path("duration").asDouble(),
                    String.join(", ", summaries)));
        }
        if (out.isEmpty()) throw noRoute("NoRoute");
        return out;
    }

    private static ApiException noRoute(String code) {
        String message = switch (code) {
            case "NoSegment" -> "One of the locations isn't close enough to a road or path. Try a nearby point.";
            case "TooBig" -> "These locations are too far apart to route between.";
            case "InvalidValue", "InvalidQuery" -> "One of the locations isn't valid.";
            default -> "No route found between these locations for this travel mode.";
        };
        return new ApiException(ApiException.Code.NO_ROUTE, message);
    }
}
