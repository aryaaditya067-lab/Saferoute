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
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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

    private static final Logger log = LoggerFactory.getLogger(OverpassClient.class);
    private static final String ROADS_FILE = "roads.json";
    private static final String PLACES_FILE = "places.tsv";

    private final HttpFetcher http;
    /** The configured Overpass server(s): a comma-separated list is tried in order. */
    private final List<String> urls;
    private final RequestGate gate = new RequestGate(2_000);
    private final TtlCache<OsmContext> cache = new TtlCache<>(50, Duration.ofHours(6));
    /**
     * Saved city snapshot (main roads, lit-tagged streets, places). The public Overpass servers are
     * often overloaded, and a failed live query silently dropped five route factors. Null = live only.
     */
    private final Path snapshotDir;
    private final BBox snapshotBox;
    private volatile OsmContext city;
    private volatile boolean snapshotChecked;

    public OverpassClient(HttpFetcher http, SafeRouteProperties properties) {
        this(http, properties, null);
    }

    @Autowired
    public OverpassClient(HttpFetcher http, SafeRouteProperties properties,
                          @Value("${saferoute.osm.snapshot-dir:./data/osm}") String snapshotDir) {
        this.http = http;
        this.urls = java.util.Arrays.stream(properties.providers().overpassUrl().split(","))
                .map(String::trim).filter(u -> !u.isEmpty()).toList();
        this.snapshotDir = snapshotDir == null || snapshotDir.isBlank() ? null : Path.of(snapshotDir);
        SafeRouteProperties.BBoxConfig b = properties.city().bbox();
        this.snapshotBox = new BBox(b.south(), b.west(), b.north(), b.east());
    }

    public record SnapshotInfo(int roads, int police, int hospitals, int places, int metroStations) {}

    /** OSM context for these routes from the saved city snapshot, if one covers them. No network. */
    public Optional<OsmContext> fromSnapshot(List<List<LatLng>> routes, BBox serviceArea) {
        OsmContext c = city();
        List<LatLng> all = routes.stream().flatMap(List::stream).toList();
        if (c == null || all.isEmpty() || !snapshotBox.containsAll(all)) return Optional.empty();
        BBox span = BBox.around(all);
        BBox activityArea = span.expand(ACTIVITY_RADIUS_METERS);
        // Probes every 50 m: a road within 20 m of a route has a probe within 45 m of it.
        List<LatLng> probes = routes.stream().flatMap(r -> Geo.resample(r, 50).stream()).toList();
        BBox corridor = span.expand(ROAD_MATCH_METERS + 50);
        List<OsmContext.Road> roads = c.roads().stream()
                .filter(r -> r.bounds().intersects(corridor))
                .filter(r -> {
                    BBox near = r.bounds().expand(ROAD_MATCH_METERS + 30);
                    return probes.stream().anyMatch(near::contains);
                })
                .toList();
        return Optional.of(new OsmContext(roads,
                within(c.police(), serviceArea), within(c.hospitals(), serviceArea), within(c.activity(), activityArea),
                c.stations().stream().filter(s -> serviceArea.contains(s.location())).toList(), true));
    }

    private static List<OsmContext.Poi> within(List<OsmContext.Poi> pois, BBox box) {
        return pois.stream().filter(p -> box.contains(p.location())).toList();
    }

    /** Downloads the city snapshot and replaces the saved one (only once the new one has parsed). */
    public synchronized SnapshotInfo refreshSnapshot() {
        if (snapshotDir == null) throw new ApiException(ApiException.Code.NOT_CONFIGURED, "No OpenStreetMap snapshot folder is set.");
        String b = String.format(Locale.ROOT, "%.4f,%.4f,%.4f,%.4f", snapshotBox.south(), snapshotBox.west(), snapshotBox.north(), snapshotBox.east());
        String roadsQuery = "[out:json][timeout:300];(way[\"highway\"~\"^(motorway|trunk|primary|secondary|tertiary)(_link)?$\"](" + b
                + ");way[\"highway\"][\"lit\"](" + b + "););out geom;";
        String placesQuery = "[out:csv(::type,::id,::lat,::lon,amenity,shop,healthcare,railway,station,public_transport,subway,"
                + "name,\"name:en\",network,operator,opening_hours;true;\"\\t\")][timeout:300];("
                + "nwr[\"amenity\"~\"^(police|hospital|" + ACTIVITY_AMENITIES + ")$\"](" + b + ");"
                + "nwr[\"healthcare\"=\"hospital\"](" + b + ");nwr[\"shop\"](" + b + ");"
                + "nwr[\"railway\"=\"station\"][\"station\"~\"^(subway|light_rail|monorail)$\"](" + b + ");"
                + "nwr[\"public_transport\"=\"station\"][\"subway\"=\"yes\"](" + b + "););out center;";
        HttpFetcher.Response roads = post(roadsQuery, Duration.ofMinutes(8), Duration.ofMinutes(3), 128 * 1024 * 1024);
        HttpFetcher.Response places = roads.ok() ? post(placesQuery, Duration.ofMinutes(8), Duration.ofMinutes(3), 64 * 1024 * 1024) : roads;
        if (!roads.ok() || !places.ok()) {
            throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE,
                    "OpenStreetMap data service returned HTTP " + (roads.ok() ? places.status() : roads.status()) + ".");
        }
        OsmContext fresh = snapshot(roads.body(), places.body());
        if (fresh.roads().isEmpty()) throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE, "OpenStreetMap returned no roads.");
        try {
            Files.createDirectories(snapshotDir);
            replace(snapshotDir.resolve(ROADS_FILE), roads.body());
            replace(snapshotDir.resolve(PLACES_FILE), places.body());
        } catch (IOException e) {
            throw new UncheckedIOException("Couldn't save the OpenStreetMap snapshot", e);
        }
        city = fresh;
        snapshotChecked = true;
        SnapshotInfo info = info(fresh);
        log.info("OpenStreetMap snapshot saved: {}", info);
        return info;
    }

    private static void replace(Path target, String body) throws IOException {
        Path tmp = target.resolveSibling(target.getFileName() + ".tmp");
        Files.writeString(tmp, body);
        Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
    }

    private static SnapshotInfo info(OsmContext c) {
        return new SnapshotInfo(c.roads().size(), c.police().size(), c.hospitals().size(), c.activity().size(), c.stations().size());
    }

    private OsmContext city() {
        if (snapshotDir == null) return null;
        if (!snapshotChecked) loadSnapshot();
        return city;
    }

    private synchronized void loadSnapshot() {
        if (snapshotChecked) return;
        Path roads = snapshotDir.resolve(ROADS_FILE);
        Path places = snapshotDir.resolve(PLACES_FILE);
        if (Files.isRegularFile(roads) && Files.isRegularFile(places)) {
            try {
                city = snapshot(Files.readString(roads), Files.readString(places));
                log.info("OpenStreetMap snapshot loaded from {}: {}", snapshotDir, info(city));
            } catch (IOException | RuntimeException e) {
                log.warn("Ignoring unreadable OpenStreetMap snapshot in {}: {}", snapshotDir, e.getMessage());
            }
        } else {
            log.info("No OpenStreetMap snapshot in {}; route factors use live Overpass queries", snapshotDir);
        }
        snapshotChecked = true;
    }

    /** Package-private for tests. */
    static OsmContext snapshot(String roadsJson, String placesTsv) {
        List<OsmContext.Poi> police = new ArrayList<>(), hospitals = new ArrayList<>(), activity = new ArrayList<>();
        List<OsmContext.Station> stations = new ArrayList<>();
        parsePlaces(placesTsv, police, hospitals, activity, stations);
        return new OsmContext(parse(roadsJson).roads(), police, hospitals, activity, stations, true);
    }

    /** Overpass CSV (tab-separated, header row) of places with their centre points. */
    static void parsePlaces(String tsv, List<OsmContext.Poi> police, List<OsmContext.Poi> hospitals,
                            List<OsmContext.Poi> activity, List<OsmContext.Station> stations) {
        String[] lines = tsv.split("\r?\n");
        if (lines.length == 0) return;
        List<String> header = List.of(lines[0].split("\t", -1));
        int type = header.indexOf("@type"), id = header.indexOf("@id"), lat = header.indexOf("@lat"), lon = header.indexOf("@lon");
        int amenity = header.indexOf("amenity"), shop = header.indexOf("shop"), healthcare = header.indexOf("healthcare");
        int railway = header.indexOf("railway"), station = header.indexOf("station"), pt = header.indexOf("public_transport");
        int subway = header.indexOf("subway"), name = header.indexOf("name"), nameEn = header.indexOf("name:en");
        int network = header.indexOf("network"), operator = header.indexOf("operator"), hours = header.indexOf("opening_hours");
        if (Math.min(Math.min(type, id), Math.min(lat, lon)) < 0) throw new IllegalArgumentException("Unexpected places header.");
        Set<String> seen = new HashSet<>();
        for (int i = 1; i < lines.length; i++) {
            String[] c = lines[i].split("\t", -1);
            if (c.length < header.size() || c[lat].isBlank() || c[lon].isBlank() || !seen.add(c[type] + c[id])) continue;
            LatLng at;
            long osmId;
            try {
                at = new LatLng(Double.parseDouble(c[lat]), Double.parseDouble(c[lon]));
                osmId = Long.parseLong(c[id]);
            } catch (IllegalArgumentException e) {
                continue;
            }
            String open = c[hours].trim().isEmpty() ? null : c[hours].trim();
            if (isMetroStation(c[railway], c[station], c[pt], c[subway])) {
                String label = !c[nameEn].isBlank() ? c[nameEn] : !c[name].isBlank() ? c[name] : "Metro station";
                addStation(stations, new OsmContext.Station(osmId, label, at, open, c[network].isBlank() ? c[operator] : c[network]));
                continue;
            }
            OsmContext.Poi poi = new OsmContext.Poi(osmId, c[name], at, open);
            if ("police".equals(c[amenity])) police.add(poi);
            if ("hospital".equals(c[amenity]) || "hospital".equals(c[healthcare])) hospitals.add(poi);
            if (!c[shop].isBlank() || ACTIVITY_SET.contains(c[amenity])) activity.add(poi);
        }
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

    private HttpFetcher.Response post(String query, Duration timeout, int maxBytes) {
        return post(query, timeout, timeout, maxBytes);
    }

    /** Posts to each configured server in turn until one answers with HTTP 200 (busy public servers often refuse). */
    private HttpFetcher.Response post(String query, Duration timeout, Duration perServer, int maxBytes) {
        HttpFetcher.Response last = null;
        RuntimeException error = null;
        long deadline = System.nanoTime() + timeout.toNanos();
        for (String url : urls) {
            long leftMs = Math.min(perServer.toMillis(), (deadline - System.nanoTime()) / 1_000_000);
            if (leftMs < 2000) break;
            try {
                gate.acquire();
                last = http.postForm(url, Map.of("Accept", "application/json"),
                        "data=" + URLEncoder.encode(query, StandardCharsets.UTF_8), Duration.ofMillis(leftMs), maxBytes);
                if (last.ok()) return last;
                log.info("Overpass {} answered HTTP {}", url, last.status());
            } catch (RuntimeException e) {
                log.info("Overpass {} failed: {}", url, e.getMessage());
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
        OsmContext c = city();
        if (c != null && snapshotBox.contains(new LatLng(area.south(), area.west())) && snapshotBox.contains(new LatLng(area.north(), area.east()))) {
            return c.roads().stream().filter(r -> r.major() && r.bounds().intersects(area)).map(OsmContext.Road::geometry).toList();
        }
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
        return isMetroStation(tags.path("railway").asText(""), tags.path("station").asText(""),
                tags.path("public_transport").asText(""), tags.path("subway").asText(""));
    }

    private static boolean isMetroStation(String railway, String station, String publicTransport, String subway) {
        if ("station".equals(railway) && Set.of("subway", "light_rail", "monorail").contains(station)) return true;
        return "station".equals(publicTransport) && "yes".equals(subway);
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
