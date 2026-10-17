package com.saferoute.route;

import com.saferoute.common.ApiException;
import com.saferoute.community.CommunityService;
import com.saferoute.config.SafeRouteProperties;
import com.saferoute.geo.BBox;
import com.saferoute.geo.Geo;
import com.saferoute.geo.LatLng;
import com.saferoute.incident.Incident;
import com.saferoute.incident.IncidentController;
import com.saferoute.incident.IncidentStore;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Builds candidate routes, measures them and labels Fastest / Balanced / Safest.
 *
 * <p>Candidates are the routing provider's own alternatives plus, when the
 * fastest route crosses a reported-crime area, up to two detours that pass on
 * either side of that area.
 */
@Service
public class RouteSafetyService {

    private static final Logger log = LoggerFactory.getLogger(RouteSafetyService.class);
    private static final double MIN_SEPARATION_METERS = 15;
    private static final double MAX_OSM_AREA_KM2 = 1500;
    private static final int MAX_ROUTES = 3;
    private static final int MAX_CANDIDATES = 6;
    /** Straight-line limits; longer trips in these modes are refused with a clear message. */
    static final double MAX_WALK_KM = 15, MAX_BIKE_KM = 50;
    /** Seconds after which no extra alternative routes are requested. */
    private static final double EXTRA_ROUTES_BUDGET_S = 12;
    /** The whole request should answer within this many seconds (the app waits 45). */
    private static final double TOTAL_BUDGET_S = 38;

    private static double seconds(long since) {
        return (System.nanoTime() - since) / 1e9;
    }

    private final OsrmClient osrm;
    private final OverpassClient overpass;
    private final IncidentStore store;
    private final CommunityService community;
    private final NightLightService nightLights;
    private final SafeRouteProperties properties;
    private final BBox cityBox;
    private final Clock clock;

    public RouteSafetyService(OsrmClient osrm, OverpassClient overpass, IncidentStore store, CommunityService community,
                              NightLightService nightLights, SafeRouteProperties properties, Clock clock) {
        this.community = community;
        this.nightLights = nightLights;
        this.osrm = osrm;
        this.overpass = overpass;
        this.store = store;
        this.properties = properties;
        SafeRouteProperties.BBoxConfig b = properties.city().bbox();
        this.cityBox = new BBox(b.south(), b.west(), b.north(), b.east());
        this.clock = clock;
    }

    public RouteDtos.RouteResponse plan(RouteDtos.RouteRequest request) {
        LatLng pickup = toLatLng(request.pickup(), "pickup");
        LatLng destination = toLatLng(request.destination(), "destination");
        if (Geo.distanceMeters(pickup, destination) < MIN_SEPARATION_METERS) {
            throw new IllegalArgumentException("Pickup and destination are the same place.");
        }
        TravelMode mode = TravelMode.parse(request.mode());
        double straightKm = Geo.distanceMeters(pickup, destination) / 1000;
        if (mode == TravelMode.WALKING && straightKm > MAX_WALK_KM) {
            throw new IllegalArgumentException(String.format(Locale.ROOT,
                    "That's about %.0f km away, too far to walk. Choose Bike or Drive, or pick a closer place.", straightKm));
        }
        if (mode == TravelMode.CYCLING && straightKm > MAX_BIKE_KM) {
            throw new IllegalArgumentException(String.format(Locale.ROOT,
                    "That's about %.0f km away, too far to cycle. Choose Drive instead.", straightKm));
        }
        long started = System.nanoTime();
        LocalDate today = LocalDate.now(clock);
        SafeRouteProperties.Safety safety = forMode(properties.safety(), mode);
        log.info("Plan {} {} -> {} ({} km straight)", mode.id(), pickup, destination, String.format(Locale.ROOT, "%.1f", straightKm));

        // On foot or by bike, fetch the main-road network in the background while the first routes come in.
        BBox roadArea = BBox.around(List.of(pickup, destination)).expand(2500);
        java.util.concurrent.CompletableFuture<List<List<LatLng>>> mainRoadsFuture =
                mode != TravelMode.DRIVING && roadArea.areaSquareKm() < 900
                        ? java.util.concurrent.CompletableFuture.supplyAsync(() -> overpass.mainRoads(roadArea, java.time.Duration.ofSeconds(14)))
                        : java.util.concurrent.CompletableFuture.completedFuture(List.of());

        List<RouteCandidate> candidates = new ArrayList<>(osrm.route(List.of(pickup, destination), mode, true));
        RouteCandidate fastest = candidates.stream().min(Comparator.comparingDouble(RouteCandidate::durationSeconds)).orElseThrow();

        // Crime data counts as available only if an ingest has succeeded and the trip is inside the covered city.
        var lastIngest = store.lastSuccessfulRun();
        boolean crimeAvailable = lastIngest.isPresent() && cityBox.contains(pickup) && cityBox.contains(destination);
        List<Incident> incidents = crimeAvailable ? store.findSince(today.minusDays(safety.incidentWindowDays())) : null;

        // On foot, a longer but better-lit walk is worth more than in a car.
        double maxDuration = fastest.durationSeconds() * (mode == TravelMode.WALKING ? Math.max(2.0, safety.maxDetourFactor()) : safety.maxDetourFactor());
        if (incidents != null && !incidents.isEmpty()) {
            Incident worst = SafetyScorer.worstIncident(fastest.geometry(), incidents, safety, today);
            if (worst != null && seconds(started) < EXTRA_ROUTES_BUDGET_S) candidates.addAll(detoursAround(worst, fastest, pickup, destination, mode));
        }
        candidates = distinct(candidates, maxDuration);

        // Routes through the brightest areas between the two ends (NASA night lights), so a
        // lit alternative is among the candidates when one exists.
        NightLightGrid lights = nightLights.grid();
        java.util.Set<RouteCandidate> bright = java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        List<List<LatLng>> mainRoads = List.of();
        if (mode != TravelMode.DRIVING) {
            try {
                mainRoads = mainRoadsFuture.get((long) Math.max(1, Math.min(14, 18 - seconds(started))), java.util.concurrent.TimeUnit.SECONDS);
            } catch (Exception e) {
                log.info("Main roads not available in time: {}", e.toString());
            }
            log.info("Main roads: {} ways ({} s)", mainRoads.size(), String.format(Locale.ROOT, "%.1f", seconds(started)));
            RouteCandidate onMain = mainRoadRoute(mainRoads, lights, pickup, destination, mode);
            if (onMain != null) {
                bright.add(onMain);
                List<RouteCandidate> more = new ArrayList<>(candidates);
                more.add(onMain);
                candidates = distinct(more, maxDuration);
            }
        }
        if (lights != null && seconds(started) < EXTRA_ROUTES_BUDGET_S + 4) {
            List<RouteCandidate> found = brightRoutes(lights, mainRoads, pickup, destination, mode);
            bright.addAll(found);
            List<RouteCandidate> more = new ArrayList<>(candidates);
            more.addAll(found);
            candidates = distinct(more, maxDuration);
        }

        // Make sure there are real alternatives to compare: route via points on either
        // side of the fastest route until three distinct candidates exist.
        for (double share : new double[] {0.15, 0.3, 0.45}) {
            if (candidates.size() >= MAX_ROUTES || seconds(started) > EXTRA_ROUTES_BUDGET_S) break;
            List<RouteCandidate> more = new ArrayList<>(candidates);
            more.addAll(sideRoutes(fastest, pickup, destination, mode, share));
            candidates = distinct(more, maxDuration);
        }

        // Keep the street-data lookup small: the fastest route, the lit-corridor routes, then the rest.
        if (candidates.size() > MAX_CANDIDATES) {
            List<RouteCandidate> ordered = new ArrayList<>();
            RouteCandidate quickest = candidates.stream().min(Comparator.comparingDouble(RouteCandidate::durationSeconds)).orElseThrow();
            ordered.add(quickest);
            for (RouteCandidate c : candidates) if (bright.contains(c) && c != quickest) ordered.add(c);
            for (RouteCandidate c : candidates) if (!ordered.contains(c)) ordered.add(c);
            candidates = new ArrayList<>(ordered.subList(0, MAX_CANDIDATES));
        }

        OsmContext osm = null;
        List<LatLng> all = candidates.stream().flatMap(c -> c.geometry().stream()).toList();
        BBox area = BBox.around(all).expand(safety.serviceRadiusMeters());
        double left = TOTAL_BUDGET_S - seconds(started);
        if (area.areaSquareKm() <= MAX_OSM_AREA_KM2 && left >= 6) {
            try {
                osm = overpass.fetch(candidates.stream().map(RouteCandidate::geometry).toList(), area,
                        java.time.Duration.ofSeconds((long) Math.min(25, left)));
            } catch (ApiException e) {
                log.warn("OpenStreetMap context unavailable: {}", e.getMessage());
            }
        }

        List<CommunityService.Spot> spots = null;
        if (cityBox.contains(pickup) && cityBox.contains(destination)) {
            try {
                spots = community.confirmedSpots();
            } catch (RuntimeException e) {
                log.warn("Community reports unavailable: {}", e.getMessage());
            }
        }
        SafetyScorer.Outcome outcome = new SafetyScorer(safety).score(candidates, incidents, spots, osm, lights, today);
        List<SafetyScorer.Scored> chosen = outcome.routes().stream()
                .sorted(Comparator.comparing((SafetyScorer.Scored s) -> s.labels().isEmpty())
                        .thenComparingDouble(s -> s.route().durationSeconds()))
                .limit(MAX_ROUTES)
                .toList();

        for (SafetyScorer.Scored sc : chosen) {
            RouteSafety.NightLight nl = sc.safety().nightLight();
            log.info("Route {} m {}: risk {}, dark {}%, longest dark {} m, main roads {}%", Math.round(sc.route().distanceMeters()),
                    sc.labels(), sc.safety().riskIndex(), Math.round(nl.darkFraction() * 100), Math.round(nl.longestDarkMeters()),
                    Math.round(sc.safety().roads().mainRoadFraction() * 100));
        }
        LocalDateTime localNow = LocalDateTime.now(clock.withZone(cityZone()));
        List<RouteDtos.RouteDto> routes = new ArrayList<>();
        for (int i = 0; i < chosen.size(); i++) {
            SafetyScorer.Scored s = chosen.get(i);
            RouteSafety facts = osm == null ? s.safety()
                    : s.safety().withOpenNow(WalkInfo.openNow(s.route().geometry(), osm.activity(), localNow));
            routes.add(new RouteDtos.RouteDto(
                    "route-" + i, i,
                    s.route().geometry().stream().map(p -> new RouteDtos.Coordinates(p.lat(), p.lng())).toList(),
                    Math.round(s.route().distanceMeters() * 10) / 10.0,
                    Math.round(s.route().durationSeconds() * 10) / 10.0,
                    s.route().summary(),
                    s.labels().stream().map(l -> l.name().toLowerCase(Locale.ROOT)).toList(),
                    facts));
        }

        Map<String, Double> weights = new LinkedHashMap<>();
        for (SafetyScorer.Factor f : outcome.factorsUsed()) {
            weights.put(factorId(f), SafetyScorer.weight(safety.weights(), f));
        }
        String crimeNote = crimeAvailable
                ? IncidentController.SOURCE_NOTE
                : (lastIngest.isEmpty()
                        ? "No crime reports have been collected yet."
                        : "Crime reports are only collected for " + properties.city().name() + ".");

        return new RouteDtos.RouteResponse(
                routes,
                mode.id(),
                new RouteDtos.Coordinates(pickup.lat(), pickup.lng()),
                new RouteDtos.Coordinates(destination.lat(), destination.lng()),
                "OSRM · FOSSGIS (OpenStreetMap data)",
                clock.instant().toString(),
                new RouteDtos.SafetyMethod(
                        crimeAvailable, crimeNote, osm != null,
                        outcome.factorsUsed().stream().map(RouteSafetyService::factorId).toList(),
                        weights,
                        safety.incidentWindowDays(),
                        safety.serviceRadiusMeters(),
                        lastIngest.map(r -> r.finishedAt() == null ? null : r.finishedAt().toString()).orElse(null)),
                mode == TravelMode.WALKING
                        ? WalkInfo.transit(pickup, destination, osm == null ? null : osm.stations(), localNow, properties.transit())
                        : null);
    }

    private ZoneId cityZone() {
        SafeRouteProperties.Transit t = properties.transit();
        try {
            return t == null || t.timeZone() == null || t.timeZone().isBlank() ? ZoneId.of("Asia/Kolkata") : ZoneId.of(t.timeZone());
        } catch (RuntimeException e) {
            return ZoneId.of("Asia/Kolkata");
        }
    }

    /** JSON id of a factor: "crime", "nightLight", "darkness", "mainRoads", "activity", "police", "hospital". */
    static String factorId(SafetyScorer.Factor f) {
        return switch (f) {
            case MAIN_ROADS -> "mainRoads";
            case NIGHT_LIGHT -> "nightLight";
            default -> f.name().toLowerCase(Locale.ROOT);
        };
    }

    /**
     * Routes that follow the best-lit corridor between the two ends: the corridor is found on the
     * NASA night-light grid, preferring main roads, and the router is asked to pass points on the
     * main road nearest to the corridor every ~1.8 km. Falls back to the brightest spots near
     * one and two thirds of the way.
     */
    private List<RouteCandidate> brightRoutes(NightLightGrid lights, List<List<LatLng>> mainRoads, LatLng pickup, LatLng destination, TravelMode mode) {
        List<List<LatLng>> plans = new ArrayList<>();
        List<LatLng> corridor = lights.brightestPath(pickup, destination, 3000, mainRoads);
        if (corridor != null && corridor.size() >= 4) {
            double len = length(corridor);
            int n = (int) Math.max(2, Math.min(8, Math.round(len / 1800)));
            List<LatLng> points = new ArrayList<>();
            List<LatLng> roadPoints = new ArrayList<>();
            for (List<LatLng> r : mainRoads) roadPoints.addAll(Geo.resample(r, 60));
            for (int i = 1; i <= n; i++) points.add(snap(along(corridor, i / (n + 1.0)), roadPoints, 400));
            List<LatLng> all = new ArrayList<>(List.of(pickup));
            all.addAll(points);
            all.add(destination);
            plans.add(all);
            List<LatLng> half = new ArrayList<>(List.of(pickup));
            for (int i = 0; i < points.size(); i += 2) half.add(points.get(i));
            half.add(destination);
            if (half.size() < all.size()) plans.add(half);
            plans.add(List.of(pickup, points.get(points.size() / 2), destination));
        } else {
            double dist = Geo.distanceMeters(pickup, destination);
            double radius = Math.max(600, Math.min(2500, dist * 0.3));
            LatLng a = lights.brightestNear(lerp(pickup, destination, 1 / 3.0), radius);
            LatLng b = lights.brightestNear(lerp(pickup, destination, 2 / 3.0), radius);
            if (a != null) plans.add(List.of(pickup, a, destination));
            if (b != null) plans.add(List.of(pickup, b, destination));
            if (a != null && b != null && Geo.distanceMeters(a, b) > 300) plans.add(List.of(pickup, a, b, destination));
        }
        log.info("Lit corridor: {} cells, {} main roads nearby, {} route plans", corridor == null ? 0 : corridor.size(), mainRoads.size(), plans.size());
        List<RouteCandidate> out = new ArrayList<>();
        for (List<LatLng> plan : plans) {
            try {
                for (RouteCandidate c : osrm.route(plan, mode, false)) {
                    RouteCandidate clean = removeLoops(c);
                    RouteSafety.NightLight nl = lights.measure(Geo.resample(clean.geometry(), SafetyScorer.SAMPLE_STEP_METERS));
                    log.info("  lit-corridor route via {} points: {} m, {}% dark, longest dark {} m", plan.size() - 2,
                            Math.round(clean.distanceMeters()), Math.round(nl.darkFraction() * 100), Math.round(nl.longestDarkMeters()));
                    out.add(clean);
                }
            } catch (ApiException e) {
                log.info("Lit-corridor route not routable: {}", e.getMessage());
            }
        }
        return out;
    }

    /**
     * A walk that keeps to main roads (and, with NASA data, the brighter ones): the path is found
     * on the main-road graph, then the router is asked to pass a point on it every ~600 m so the
     * route can't cut through side streets. Null without main-road data nearby.
     */
    private RouteCandidate mainRoadRoute(List<List<LatLng>> mainRoads, NightLightGrid lights, LatLng pickup, LatLng destination, TravelMode mode) {
        if (mainRoads.isEmpty()) return null;
        MainRoadGraph graph = new MainRoadGraph(mainRoads);
        List<LatLng> path = graph.path(pickup, destination, lights, 1500);
        if (path == null || path.size() < 2) {
            log.info("No connected main-road path ({} graph nodes)", graph.size());
            return null;
        }
        List<LatLng> points = Geo.resample(path, 600);
        List<LatLng> via = new ArrayList<>(List.of(pickup));
        // Skip the very first/last sample when it sits on top of the start or end.
        for (LatLng p : points) {
            if (Geo.distanceMeters(p, pickup) > 150 && Geo.distanceMeters(p, destination) > 150) via.add(p);
        }
        if (via.size() > 24) {
            List<LatLng> thinned = new ArrayList<>(List.of(pickup));
            int stride = (int) Math.ceil((via.size() - 1) / 22.0);
            for (int i = 1; i < via.size(); i += stride) thinned.add(via.get(i));
            via = thinned;
        }
        via.add(destination);
        try {
            List<RouteCandidate> routes = osrm.route(via, mode, false);
            if (routes.isEmpty()) return null;
            RouteCandidate r = removeLoops(routes.get(0));
            r = new RouteCandidate(r.geometry(), r.distanceMeters(), r.durationSeconds(),
                    r.summary() == null || r.summary().isBlank() ? "Main roads" : r.summary());
            if (lights != null) {
                RouteSafety.NightLight nl = lights.measure(Geo.resample(r.geometry(), SafetyScorer.SAMPLE_STEP_METERS));
                log.info("Main-road route: {} m via {} points, {}% dark, longest dark {} m", Math.round(r.distanceMeters()),
                        via.size() - 2, Math.round(nl.darkFraction() * 100), Math.round(nl.longestDarkMeters()));
            }
            return r;
        } catch (ApiException e) {
            log.info("Main-road route not routable: {}", e.getMessage());
            return null;
        }
    }

    /** The nearest point among {@code candidates} within {@code maxMeters}, else the point itself. */
    static LatLng snap(LatLng p, List<LatLng> candidates, double maxMeters) {
        LatLng best = p;
        double bestD = maxMeters;
        for (LatLng c : candidates) {
            if (Math.abs(c.lat() - p.lat()) > 0.005 || Math.abs(c.lng() - p.lng()) > 0.005) continue;
            double d = Geo.distanceMeters(p, c);
            if (d < bestD) {
                bestD = d;
                best = c;
            }
        }
        return best;
    }

    /** The point a given share of the way along a polyline. */
    static LatLng along(List<LatLng> line, double share) {
        double total = 0;
        for (int i = 1; i < line.size(); i++) total += Geo.distanceMeters(line.get(i - 1), line.get(i));
        double target = total * share, run = 0;
        for (int i = 1; i < line.size(); i++) {
            double seg = Geo.distanceMeters(line.get(i - 1), line.get(i));
            if (run + seg >= target) return seg == 0 ? line.get(i) : lerp(line.get(i - 1), line.get(i), (target - run) / seg);
            run += seg;
        }
        return line.get(line.size() - 1);
    }

    /**
     * Cuts out-and-back spurs and small loops (where the route returns within 20 m of a point it
     * passed at least 200 m earlier) that a via point can cause. Distance and time shrink in
     * proportion to the length removed.
     */
    static RouteCandidate removeLoops(RouteCandidate c) {
        List<LatLng> s = Geo.resample(c.geometry(), BACKTRACK_STEP_METERS);
        int gap = (int) Math.ceil(200 / BACKTRACK_STEP_METERS);
        List<LatLng> kept = new ArrayList<>();
        int i = 0;
        while (i < s.size()) {
            kept.add(s.get(i));
            int jump = -1;
            for (int j = s.size() - 1; j > i + gap; j--) {
                if (Geo.distanceMeters(s.get(i), s.get(j)) < 20) {
                    jump = j;
                    break;
                }
            }
            i = jump > 0 ? jump + 1 : i + 1;
        }
        if (kept.size() == s.size() || kept.size() < 2) return c;
        double before = length(s), after = length(kept);
        double k = before > 0 ? after / before : 1;
        return new RouteCandidate(kept, c.distanceMeters() * k, c.durationSeconds() * k, c.summary());
    }

    private static double length(List<LatLng> line) {
        double sum = 0;
        for (int i = 1; i < line.size(); i++) sum += Geo.distanceMeters(line.get(i - 1), line.get(i));
        return sum;
    }

    private static LatLng lerp(LatLng a, LatLng b, double t) {
        return new LatLng(a.lat() + (b.lat() - a.lat()) * t, a.lng() + (b.lng() - a.lng()) * t);
    }

    /**
     * On foot or by bike, darkness and quiet streets matter more than in a car: lighting
     * factors and street activity get more weight. The response reports the weights used.
     */
    static SafeRouteProperties.Safety forMode(SafeRouteProperties.Safety s, TravelMode mode) {
        SafeRouteProperties.Weights w = s.weights();
        double night, dark, act, main;
        switch (mode) {
            case WALKING -> { night = 2.5; dark = 2.0; act = 1.5; main = 2.0; }
            case CYCLING -> { night = 1.6; dark = 1.5; act = 1.2; main = 1.3; }
            default -> { return s; }
        }
        SafeRouteProperties.Weights adjusted = new SafeRouteProperties.Weights(w.crime(), w.community(), w.nightLight() * night,
                w.darkness() * dark, w.mainRoads() * main, w.activity() * act, w.police(), w.hospital());
        return new SafeRouteProperties.Safety(s.incidentWindowDays(), s.recencyHalfLifeDays(), s.minIncidentRadiusMeters(),
                s.maxIncidentRadiusMeters(), s.serviceRadiusMeters(), s.maxDetourFactor(), adjusted, s.categoryWeights());
    }

    /** Routes through points left and right of the fastest route's midpoint. */
    private List<RouteCandidate> sideRoutes(RouteCandidate fastest, LatLng pickup, LatLng destination, TravelMode mode, double share) {
        List<LatLng> g = fastest.geometry();
        int mid = g.size() / 2;
        LatLng center = g.get(mid);
        double heading = Geo.bearing(pickup, destination);
        double offset = Math.max(500, Math.min(5000, Geo.distanceMeters(pickup, destination) * share));
        List<RouteCandidate> out = new ArrayList<>();
        for (double side : new double[] {90, -90}) {
            LatLng via = Geo.offset(center, heading + side, offset);
            try {
                for (RouteCandidate rc : osrm.route(List.of(pickup, via, destination), mode, false)) out.add(removeLoops(rc));
            } catch (ApiException e) {
                log.debug("Alternative via {} not routable: {}", via, e.getMessage());
            }
        }
        return out;
    }

    private List<RouteCandidate> detoursAround(Incident incident, RouteCandidate route, LatLng pickup, LatLng destination, TravelMode mode) {
        List<LatLng> g = route.geometry();
        int i = Geo.nearestVertex(incident.center(), g);
        LatLng before = g.get(Math.max(0, i - 5));
        LatLng after = g.get(Math.min(g.size() - 1, i + 5));
        double heading = Geo.bearing(before, after);
        int radius = Math.max(properties.safety().minIncidentRadiusMeters(),
                Math.min(properties.safety().maxIncidentRadiusMeters(), incident.radiusMeters()));
        double offset = radius + 400;
        List<RouteCandidate> out = new ArrayList<>();
        for (double side : new double[] {90, -90}) {
            LatLng via = Geo.offset(incident.center(), heading + side, offset);
            try {
                for (RouteCandidate rc : osrm.route(List.of(pickup, via, destination), mode, false)) out.add(removeLoops(rc));
            } catch (ApiException e) {
                log.debug("Detour via {} not routable: {}", via, e.getMessage());
            }
        }
        return out;
    }

    /**
     * Drops near-duplicates (≥90% shared path), unreasonable detours and routes that go down a
     * street and come back along it (a spur caused by a via point); keeps the faster of duplicates.
     * The fastest route is never dropped for backtracking.
     */
    static List<RouteCandidate> distinct(List<RouteCandidate> candidates, double maxDuration) {
        RouteCandidate quickest = candidates.stream().min(Comparator.comparingDouble(RouteCandidate::durationSeconds)).orElse(null);
        List<RouteCandidate> sorted = candidates.stream()
                .filter(c -> c.durationSeconds() <= maxDuration + 1e-6)
                .filter(c -> c == quickest || !backtracks(c.geometry()))
                .sorted(Comparator.comparingDouble(RouteCandidate::durationSeconds))
                .toList();
        List<RouteCandidate> kept = new ArrayList<>();
        for (RouteCandidate c : sorted) {
            List<LatLng> samples = Geo.resample(c.geometry(), 50);
            boolean duplicate = kept.stream().anyMatch(k -> sharedFraction(samples, k.geometry()) >= 0.9
                    && sharedFraction(Geo.resample(k.geometry(), 50), c.geometry()) >= 0.9);
            if (!duplicate) kept.add(c);
        }
        return kept;
    }

    static final double BACKTRACK_STEP_METERS = 20;
    static final double BACKTRACK_MIN_METERS = 160;

    /**
     * True when at least {@link #BACKTRACK_MIN_METERS} of the route are travelled twice: a sample
     * lies within 15 m of another sample more than 300 m further along the route.
     */
    static boolean backtracks(List<LatLng> geometry) {
        List<LatLng> s = Geo.resample(geometry, BACKTRACK_STEP_METERS);
        int gap = (int) Math.ceil(300 / BACKTRACK_STEP_METERS);
        double cell = 0.0003; // ~33 m
        java.util.Map<Long, List<Integer>> grid = new java.util.HashMap<>();
        for (int i = 0; i < s.size(); i++) grid.computeIfAbsent(cellKey(s.get(i), cell, 0, 0), k -> new ArrayList<>()).add(i);
        int twice = 0;
        for (int i = 0; i < s.size(); i++) {
            boolean hit = false;
            for (int dx = -1; dx <= 1 && !hit; dx++) for (int dy = -1; dy <= 1 && !hit; dy++) {
                for (int j : grid.getOrDefault(cellKey(s.get(i), cell, dx, dy), List.of())) {
                    if (Math.abs(i - j) > gap && Geo.distanceMeters(s.get(i), s.get(j)) < 15) { hit = true; break; }
                }
            }
            if (hit) twice++;
        }
        // Each doubled stretch is counted from both passes.
        return twice * BACKTRACK_STEP_METERS / 2 >= BACKTRACK_MIN_METERS;
    }

    private static long cellKey(LatLng p, double cell, int dx, int dy) {
        long r = (long) Math.floor(p.lat() / cell) + dx, c = (long) Math.floor(p.lng() / cell) + dy;
        return r * 10_000_000L + c;
    }

    private static double sharedFraction(List<LatLng> samples, List<LatLng> other) {
        if (samples.isEmpty()) return 1;
        long near = samples.stream().filter(p -> Geo.distanceToPolylineMeters(p, other) <= 30).count();
        return near / (double) samples.size();
    }

    private static LatLng toLatLng(RouteDtos.Coordinates c, String name) {
        if (c == null || c.lat() == null || c.lng() == null) {
            throw new IllegalArgumentException("Missing " + name + " coordinates.");
        }
        try {
            return new LatLng(c.lat(), c.lng());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("The " + name + " location isn't valid.");
        }
    }
}
