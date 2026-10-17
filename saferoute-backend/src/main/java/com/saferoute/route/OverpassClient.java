package com.saferoute.route;

import com.fasterxml.jackson.databind.JsonNode;
import com.saferoute.common.ApiException;
import com.saferoute.common.HttpFetcher;
import com.saferoute.common.Json;
import com.saferoute.common.RequestGate;
import com.saferoute.common.TtlCache;
import com.saferoute.config.SafeRouteProperties;
import com.saferoute.geo.BBox;
import com.saferoute.geo.Geo;
import com.saferoute.geo.LatLng;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * OpenStreetMap data along candidate routes via the Overpass API: the roads the
 * routes use (class + lit tag), shops/amenities within 100 m (street activity),
 * police stations / hospitals and metro stations in the surrounding area.
 */
@Component
public class OverpassClient {

    static final Set<String> MAJOR = Set.of("motorway", "trunk", "primary", "secondary", "tertiary",
            "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link");
    static final int ROAD_MATCH_METERS = 20;
    static final int ACTIVITY_RADIUS_METERS = 100;
    private static final Set<String> LIT = Set.of("yes", "24/7", "automatic", "sunset-sunrise", "interval", "limited");
    private static final Set<String> UNLIT = Set.of("no", "disused");
    private static final String ACTIVITY_AMENITIES =
            "restaurant|cafe|fast_food|bar|pub|bank|atm|pharmacy|fuel|bus_station|marketplace|cinema|food_court|ice_cream";

    private static final Set<String> ACTIVITY_SET = Set.of(ACTIVITY_AMENITIES.split("\\|"));

    private final HttpFetcher http;
    /** The configured Overpass server(s): a comma-separated list is tried in order. */
    private final List<String> urls;
    private final RequestGate gate = new RequestGate(2_000);
    private final TtlCache<OsmContext> cache = new TtlCache<>(50, Duration.ofHours(6));

    public OverpassClient(HttpFetcher http, SafeRouteProperties properties) {
        this.http = http;
        this.urls = java.util.Arrays.stream(properties.providers().overpassUrl().split(","))
                .map(String::trim).filter(u -> !u.isEmpty()).toList();
    }

    public OsmContext fetch(List<List<LatLng>> routes, BBox serviceArea) {
        return fetch(routes, serviceArea, Duration.ofSeconds(25));
    }

    public OsmContext fetch(List<List<LatLng>> routes, BBox serviceArea, Duration timeout) {
        String query = query(routes, serviceArea);
        OsmContext cached = cache.get(query);
        if (cached != null) return cached;
        HttpFetcher.Response response = post(query, timeout, 48 * 1024 * 1024);
        if (!response.ok()) {
            throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE,
                    "OpenStreetMap data service returned HTTP " + response.status() + ".");
        }
        OsmContext context = parse(response.body());
        cache.put(query, context);
        return context;
    }

    /** Posts to each configured server in turn until one answers with HTTP 200 (busy public servers often refuse). */
    private HttpFetcher.Response post(String query, Duration timeout, int maxBytes) {
        HttpFetcher.Response last = null;
        RuntimeException error = null;
        long deadline = System.nanoTime() + timeout.toNanos();
        for (String url : urls) {
            long leftMs = (deadline - System.nanoTime()) / 1_000_000;
            if (leftMs < 2000) break;
            try {
                gate.acquire();
                last = http.postForm(url, Map.of("Accept", "application/json"),
                        "data=" + URLEncoder.encode(query, StandardCharsets.UTF_8), Duration.ofMillis(leftMs), maxBytes);
                if (last.ok()) return last;
            } catch (RuntimeException e) {
                error = e;
            }
        }
        if (last != null) return last;
        if (error != null) throw error;
        throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE, "OpenStreetMap data service didn't answer in time.");
    }

    private final TtlCache<List<List<LatLng>>> mainCache = new TtlCache<>(50, Duration.ofHours(12));

    /** Trunk, primary, secondary and tertiary roads in an area (geometry only), or an empty list on failure. */
    public List<List<LatLng>> mainRoads(BBox area, Duration timeout) {
        String b = String.format(Locale.ROOT, "%.4f,%.4f,%.4f,%.4f", area.south(), area.west(), area.north(), area.east());
        String query = "[out:json][timeout:15];way[\"highway\"~\"^(trunk|primary|secondary|tertiary)(_link)?$\"](" + b + ");out geom;";
        List<List<LatLng>> cached = mainCache.get(query);
        if (cached != null) return cached;
        try {
            HttpFetcher.Response response = post(query, timeout, 16 * 1024 * 1024);
            if (!response.ok()) return List.of();
            List<List<LatLng>> roads = new ArrayList<>();
            for (OsmContext.Road r : parse(response.body()).roads()) roads.add(r.geometry());
            mainCache.put(query, roads);
            return roads;
        } catch (RuntimeException e) {
            return List.of();
        }
    }

    static String query(List<List<LatLng>> routes, BBox area) {
        List<String> lines = routes.stream()
                .map(r -> Geo.resample(r, 250).stream()
                        .map(p -> String.format(Locale.ROOT, "%.5f,%.5f", p.lat(), p.lng()))
                        .collect(Collectors.joining(",")))
                .toList();
        String b = String.format(Locale.ROOT, "%.5f,%.5f,%.5f,%.5f", area.south(), area.west(), area.north(), area.east());
        StringBuilder q = new StringBuilder("[out:json][timeout:25];(");
        for (String line : lines) q.append("way[\"highway\"](around:").append(ROAD_MATCH_METERS).append(',').append(line).append(");");
        q.append(")->.roads;(");
        for (String line : lines) {
            q.append("nwr[\"shop\"](around:").append(ACTIVITY_RADIUS_METERS).append(',').append(line).append(");");
            q.append("nwr[\"amenity\"~\"^(").append(ACTIVITY_AMENITIES).append(")$\"](around:")
                    .append(ACTIVITY_RADIUS_METERS).append(',').append(line).append(");");
        }
        q.append(")->.act;(");
        q.append("nwr[\"amenity\"=\"police\"](").append(b).append(");");
        q.append("nwr[\"amenity\"=\"hospital\"](").append(b).append(");");
        q.append("nwr[\"healthcare\"=\"hospital\"](").append(b).append(");");
        q.append(")->.svc;(");
        q.append("nwr[\"railway\"=\"station\"][\"station\"~\"^(subway|light_rail|monorail)$\"](").append(b).append(");");
        q.append("nwr[\"public_transport\"=\"station\"][\"subway\"=\"yes\"](").append(b).append(");");
        q.append(")->.mt;.roads out geom;.act out center;.svc out center;.mt out center;");
        return q.toString();
    }

    /** Package-private for tests. */
    static OsmContext parse(String body) {
        JsonNode root = Json.parse(body, "the OpenStreetMap data service");
        List<OsmContext.Road> roads = new ArrayList<>();
        List<OsmContext.Poi> police = new ArrayList<>();
        List<OsmContext.Poi> hospitals = new ArrayList<>();
        List<OsmContext.Poi> activity = new ArrayList<>();
        List<OsmContext.Station> stations = new ArrayList<>();
        Set<String> seenRoads = new HashSet<>(), seenPolice = new HashSet<>(), seenHospitals = new HashSet<>(), seenActivity = new HashSet<>();
        for (JsonNode element : root.path("elements")) {
            String type = element.path("type").asText("");
            long id = element.path("id").asLong();
            String key = type + id;
            JsonNode tags = element.path("tags");
            String highway = tags.path("highway").asText("");
            if ("way".equals(type) && !highway.isEmpty() && element.has("geometry")) {
                if (!seenRoads.add(key)) continue;
                List<LatLng> geometry = new ArrayList<>();
                for (JsonNode p : element.path("geometry")) {
                    geometry.add(new LatLng(p.path("lat").asDouble(), p.path("lon").asDouble()));
                }
                if (geometry.size() < 2) continue;
                String litValue = tags.path("lit").asText("").toLowerCase(Locale.ROOT);
                Boolean lit = LIT.contains(litValue) ? Boolean.TRUE : UNLIT.contains(litValue) ? Boolean.FALSE : null;
                roads.add(new OsmContext.Road(geometry, highway, MAJOR.contains(highway), lit, BBox.around(geometry)));
                continue;
            }
            JsonNode point = "node".equals(type) ? element : element.path("center");
            if (!point.has("lat") || !point.has("lon")) continue;
            LatLng at = new LatLng(point.path("lat").asDouble(), point.path("lon").asDouble());
            String hours = tags.path("opening_hours").asText("").trim();
            OsmContext.Poi poi = new OsmContext.Poi(id, tags.path("name").asText(""), at, hours.isEmpty() ? null : hours);
            if (isMetroStation(tags)) {
                addStation(stations, new OsmContext.Station(id, stationName(tags), at, hours.isEmpty() ? null : hours,
                        tags.path("network").asText(tags.path("operator").asText(""))));
                continue;
            }
            String amenity = tags.path("amenity").asText("");
            if ("police".equals(amenity) && seenPolice.add(key)) police.add(poi);
            if (("hospital".equals(amenity) || "hospital".equals(tags.path("healthcare").asText(""))) && seenHospitals.add(key)) {
                hospitals.add(poi);
            }
            boolean active = tags.has("shop") || ACTIVITY_SET.contains(amenity);
            if (active && seenActivity.add(key)) activity.add(poi);
        }
        return new OsmContext(roads, police, hospitals, activity, stations);
    }

    static boolean isMetroStation(JsonNode tags) {
        String railway = tags.path("railway").asText(""), station = tags.path("station").asText("");
        if ("station".equals(railway) && Set.of("subway", "light_rail", "monorail").contains(station)) return true;
        return "station".equals(tags.path("public_transport").asText("")) && "yes".equals(tags.path("subway").asText(""));
    }

    private static String stationName(JsonNode tags) {
        String en = tags.path("name:en").asText("");
        return en.isEmpty() ? tags.path("name").asText("Metro station") : en;
    }

    /** OSM often maps a station twice (node + building); keep one per name, preferring the one with hours. */
    private static void addStation(List<OsmContext.Station> stations, OsmContext.Station s) {
        for (int i = 0; i < stations.size(); i++) {
            OsmContext.Station o = stations.get(i);
            if (o.name().equalsIgnoreCase(s.name()) && Geo.distanceMeters(o.location(), s.location()) < 400) {
                if (o.openingHours() == null && s.openingHours() != null) stations.set(i, s);
                return;
            }
        }
        stations.add(s);
    }
}
