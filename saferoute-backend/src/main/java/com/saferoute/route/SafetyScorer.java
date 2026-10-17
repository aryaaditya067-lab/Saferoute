package com.saferoute.route;

import com.saferoute.community.CommunityService;
import com.saferoute.community.ReportCategory;
import com.saferoute.config.SafeRouteProperties;
import com.saferoute.geo.BBox;
import com.saferoute.geo.Geo;
import com.saferoute.geo.LatLng;
import com.saferoute.incident.CrimeType;
import com.saferoute.incident.Incident;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Measures each candidate route and picks Fastest / Balanced / Safest.
 *
 * <p>Pure computation: no I/O, so it is fully unit-tested. Factors that have no
 * data are reported as unavailable and left out of the ranking rather than
 * treated as zero.
 */
public class SafetyScorer {

    public enum Label { FASTEST, BALANCED, SAFEST }

    public enum Factor { CRIME, COMMUNITY, NIGHT_LIGHT, DARKNESS, MAIN_ROADS, ACTIVITY, POLICE, HOSPITAL }

    /** Community spots count when the route passes within this distance. */
    static final double COMMUNITY_RADIUS_METERS = 150;

    public record Scored(RouteCandidate route, RouteSafety safety, Set<Label> labels) {}

    public record Outcome(List<Scored> routes, List<Factor> factorsUsed) {}

    static final double SAMPLE_STEP_METERS = 25;
    static final double ROAD_MATCH_METERS = 20;
    /** Lighting is ranked only if at least this share of every route has a known lit tag. */
    static final double MIN_LIGHTING_KNOWN = 0.2;
    /** Road type is ranked only if at least this share of every route was matched to an OSM road. */
    static final double MIN_ROADS_MATCHED = 0.5;
    /** Night lights are ranked only if satellite data covers at least this share of every route. */
    static final double MIN_NIGHT_LIGHT_COVERED = 0.5;

    private final SafeRouteProperties.Safety config;

    public SafetyScorer(SafeRouteProperties.Safety config) {
        this.config = config;
    }

    /**
     * @param incidents        reports inside the window (null = crime data unavailable)
     * @param osm              OpenStreetMap context (null = unavailable)
     */
    public Outcome score(List<RouteCandidate> candidates, List<Incident> incidents, OsmContext osm, LocalDate today) {
        return score(candidates, incidents, null, osm, today);
    }

    /**
     * @param spots confirmed community spots (null = unavailable)
     */
    public Outcome score(List<RouteCandidate> candidates, List<Incident> incidents, List<CommunityService.Spot> spots,
                         OsmContext osm, LocalDate today) {
        return score(candidates, incidents, spots, osm, null, today);
    }

    /**
     * @param lights NASA night-light grid (null = unavailable)
     */
    public Outcome score(List<RouteCandidate> candidates, List<Incident> incidents, List<CommunityService.Spot> spots,
                         OsmContext osm, NightLightGrid lights, LocalDate today) {
        List<RouteSafety> measured = new ArrayList<>();
        for (RouteCandidate route : candidates) {
            List<LatLng> samples = Geo.resample(route.geometry(), SAMPLE_STEP_METERS);
            RoadMatch match = osm == null ? null : matchRoads(samples, osm.roads());
            measured.add(new RouteSafety(
                    incidents == null ? RouteSafety.Crime.unavailable() : crime(route.geometry(), incidents, today),
                    spots == null ? RouteSafety.Community.unavailable() : community(route.geometry(), spots),
                    match == null ? RouteSafety.Lighting.unavailable() : match.lighting(),
                    match == null ? RouteSafety.Roads.unavailable() : match.roads(),
                    osm == null ? RouteSafety.Activity.unavailable() : activity(route, osm.activity()),
                    osm == null ? RouteSafety.Service.unavailable() : service(samples, osm.police()),
                    osm == null ? RouteSafety.Service.unavailable() : service(samples, osm.hospitals()),
                    lights == null ? RouteSafety.NightLight.unavailable() : lights.measure(samples),
                    RouteSafety.OpenNow.unavailable(),
                    null));
        }

        List<Factor> used = new ArrayList<>();
        if (incidents != null) used.add(Factor.CRIME);
        if (spots != null && !spots.isEmpty()) used.add(Factor.COMMUNITY);
        if (lights != null && measured.stream().allMatch(
                s -> s.nightLight().available() && s.nightLight().coveredFraction() >= MIN_NIGHT_LIGHT_COVERED)) {
            used.add(Factor.NIGHT_LIGHT);
        }
        if (osm != null && measured.stream().allMatch(s -> 1 - s.lighting().unknownFraction() >= MIN_LIGHTING_KNOWN)) {
            used.add(Factor.DARKNESS);
        }
        if (osm != null && measured.stream().allMatch(
                s -> s.roads().mainRoadFraction() + s.roads().minorRoadFraction() >= MIN_ROADS_MATCHED)) {
            used.add(Factor.MAIN_ROADS);
        }
        if (osm != null) used.add(Factor.ACTIVITY);
        if (osm != null && !osm.police().isEmpty()) used.add(Factor.POLICE);
        if (osm != null && !osm.hospitals().isEmpty()) used.add(Factor.HOSPITAL);

        double maxExposure = measured.stream().mapToDouble(s -> s.crime().exposure()).max().orElse(0);
        double maxCommunity = measured.stream().mapToDouble(s -> s.community().exposure()).max().orElse(0);
        double maxActivity = measured.stream().mapToDouble(s -> s.activity().placesPerKm()).max().orElse(0);
        SafeRouteProperties.Weights w = config.weights();
        List<RouteSafety> withRisk = new ArrayList<>();
        for (RouteSafety s : measured) {
            if (used.isEmpty()) {
                withRisk.add(s);
                continue;
            }
            double sum = 0, weights = 0;
            for (Factor f : used) {
                double weight = weight(w, f);
                double term = switch (f) {
                    case CRIME -> maxExposure > 0 ? s.crime().exposure() / maxExposure : 0;
                    case COMMUNITY -> maxCommunity > 0 ? s.community().exposure() / maxCommunity : 0;
                    // Share of the route in the darkest third, and how dark it is on average.
                    case NIGHT_LIGHT -> 0.5 * s.nightLight().darkFraction() + 0.5 * s.nightLight().meanDarkness();
                    case DARKNESS -> s.lighting().unlitFraction();
                    case MAIN_ROADS -> 1 - s.roads().mainRoadFraction();
                    case ACTIVITY -> maxActivity > 0 ? 1 - s.activity().placesPerKm() / maxActivity : 0;
                    case POLICE -> 1 - s.police().coverageFraction();
                    case HOSPITAL -> 1 - s.hospital().coverageFraction();
                };
                sum += weight * term;
                weights += weight;
            }
            withRisk.add(s.withRisk(weights > 0 ? round(sum / weights, 4) : null));
        }

        Map<Integer, Set<Label>> labels = label(candidates, withRisk);
        List<Scored> out = new ArrayList<>();
        for (int i = 0; i < candidates.size(); i++) {
            out.add(new Scored(candidates.get(i), withRisk.get(i), labels.getOrDefault(i, EnumSet.noneOf(Label.class))));
        }
        return new Outcome(out, used);
    }

    static Map<Integer, Set<Label>> label(List<RouteCandidate> routes, List<RouteSafety> safety) {
        Map<Integer, Set<Label>> labels = new LinkedHashMap<>();
        if (routes.isEmpty()) return labels;
        int fastest = argMin(routes.size(), i -> routes.get(i).durationSeconds(), i -> routes.get(i).distanceMeters());
        labels.computeIfAbsent(fastest, k -> EnumSet.noneOf(Label.class)).add(Label.FASTEST);
        boolean ranked = safety.stream().allMatch(s -> s.riskIndex() != null);
        if (!ranked) return labels;

        int n = routes.size();
        if (n == 1) {
            labels.get(fastest).addAll(EnumSet.of(Label.BALANCED, Label.SAFEST));
            return labels;
        }
        // Each label goes to a different route whenever there are enough routes.
        // Safest = lowest measured risk among the routes other than the fastest; if the
        // fastest route is itself lower-risk, the app says so on the "Safest" card.
        int safest = argMinExcept(n, fastest, -1, i -> safety.get(i).riskIndex(), i -> routes.get(i).durationSeconds());
        labels.computeIfAbsent(safest, k -> EnumSet.noneOf(Label.class)).add(Label.SAFEST);

        double minD = routes.stream().mapToDouble(RouteCandidate::durationSeconds).min().orElse(0);
        double maxD = routes.stream().mapToDouble(RouteCandidate::durationSeconds).max().orElse(0);
        double minR = safety.stream().mapToDouble(RouteSafety::riskIndex).min().orElse(0);
        double maxR = safety.stream().mapToDouble(RouteSafety::riskIndex).max().orElse(0);
        IndexValue combined = i -> 0.5 * norm(routes.get(i).durationSeconds(), minD, maxD) + 0.5 * norm(safety.get(i).riskIndex(), minR, maxR);

        int balanced;
        if (n == 2) {
            balanced = combined.at(fastest) <= combined.at(safest) ? fastest : safest;
        } else {
            balanced = argMinExcept(n, fastest, safest, combined, i -> routes.get(i).durationSeconds());
        }
        labels.computeIfAbsent(balanced, k -> EnumSet.noneOf(Label.class)).add(Label.BALANCED);
        return labels;
    }

    private static int argMinExcept(int size, int skipA, int skipB, IndexValue primary, IndexValue tieBreak) {
        Integer best = null;
        for (int i = 0; i < size; i++) {
            if (i == skipA || i == skipB) continue;
            if (best == null) {
                best = i;
                continue;
            }
            double a = primary.at(i), b = primary.at(best);
            if (a < b - 1e-9 || (Math.abs(a - b) <= 1e-9 && tieBreak.at(i) < tieBreak.at(best))) best = i;
        }
        return best == null ? skipA : best;
    }

    /**
     * Distance weighting: an incident counts fully when the route passes within a third of its
     * area radius, falling linearly to a quarter at the edge of the area, and not at all beyond it.
     */
    static double distanceWeight(double distance, double radius) {
        double inner = radius / 3;
        if (distance <= inner) return 1;
        if (distance > radius) return 0;
        return 1 - 0.75 * (distance - inner) / (radius - inner);
    }

    RouteSafety.Crime crime(List<LatLng> geometry, List<Incident> incidents, LocalDate today) {
        BBox near = BBox.around(geometry).expand(config.maxIncidentRadiusMeters());
        double exposure = 0;
        int violent = 0, property = 0;
        Double nearest = null;
        List<Long> ids = new ArrayList<>();
        for (Incident incident : incidents) {
            if (!near.contains(incident.center())) continue;
            int radius = Math.max(config.minIncidentRadiusMeters(), Math.min(config.maxIncidentRadiusMeters(), incident.radiusMeters()));
            double d = Geo.distanceToPolylineMeters(incident.center(), geometry);
            if (d > radius) continue;
            long ageDays = Math.max(0, ChronoUnit.DAYS.between(incident.occurredOn(), today));
            double recency = Math.pow(0.5, ageDays / Math.max(1, config.recencyHalfLifeDays()));
            boolean isViolent = incident.type().category == CrimeType.Category.VIOLENT;
            double categoryWeight = isViolent ? config.categoryWeights().violent() : config.categoryWeights().property();
            exposure += categoryWeight * recency * distanceWeight(d, radius);
            if (isViolent) violent++; else property++;
            ids.add(incident.id());
            if (nearest == null || d < nearest) nearest = d;
        }
        return new RouteSafety.Crime(true, ids.size(), violent, property, round(exposure, 4), ids,
                nearest == null ? null : (double) Math.round(nearest));
    }

    static RouteSafety.Community community(List<LatLng> geometry, List<CommunityService.Spot> spots) {
        BBox near = BBox.around(geometry).expand(COMMUNITY_RADIUS_METERS);
        double exposure = 0;
        Double nearest = null;
        java.util.LinkedHashSet<String> categories = new java.util.LinkedHashSet<>();
        int count = 0;
        for (CommunityService.Spot spot : spots) {
            LatLng p = new LatLng(spot.lat(), spot.lng());
            if (!near.contains(p)) continue;
            double d = Geo.distanceToPolylineMeters(p, geometry);
            if (d > COMMUNITY_RADIUS_METERS) continue;
            double w = ReportCategory.fromId(spot.category()).map(c -> c.weight).orElse(0.5);
            exposure += w * distanceWeight(d, COMMUNITY_RADIUS_METERS);
            categories.add(spot.categoryLabel());
            count++;
            if (nearest == null || d < nearest) nearest = d;
        }
        return new RouteSafety.Community(true, count, List.copyOf(categories), round(exposure, 4),
                nearest == null ? null : (double) Math.round(nearest));
    }

    record RoadMatch(RouteSafety.Lighting lighting, RouteSafety.Roads roads) {}

    /** Matches each route sample to the nearest OSM road within 20 m (lit tag + road class). */
    static RoadMatch matchRoads(List<LatLng> samples, List<OsmContext.Road> roads) {
        if (samples.isEmpty()) return new RoadMatch(RouteSafety.Lighting.unavailable(), RouteSafety.Roads.unavailable());
        int lit = 0, unlit = 0, major = 0, minor = 0;
        for (LatLng p : samples) {
            double best = ROAD_MATCH_METERS;
            OsmContext.Road nearest = null;
            for (OsmContext.Road road : roads) {
                if (!road.bounds().expand(ROAD_MATCH_METERS).contains(p)) continue;
                double d = Geo.distanceToPolylineMeters(p, road.geometry());
                if (d <= best) {
                    best = d;
                    nearest = road;
                }
            }
            if (nearest == null) continue;
            if (nearest.major()) major++; else minor++;
            if (Boolean.TRUE.equals(nearest.lit())) lit++;
            else if (Boolean.FALSE.equals(nearest.lit())) unlit++;
        }
        double n = samples.size();
        return new RoadMatch(
                new RouteSafety.Lighting(true, round(lit / n, 3), round(unlit / n, 3), round((n - lit - unlit) / n, 3)),
                new RouteSafety.Roads(true, round(major / n, 3), round(minor / n, 3)));
    }

    static RouteSafety.Activity activity(RouteCandidate route, List<OsmContext.Poi> places) {
        BBox near = BBox.around(route.geometry()).expand(OverpassClient.ACTIVITY_RADIUS_METERS);
        int count = 0;
        for (OsmContext.Poi poi : places) {
            if (!near.contains(poi.location())) continue;
            if (Geo.distanceToPolylineMeters(poi.location(), route.geometry()) <= OverpassClient.ACTIVITY_RADIUS_METERS) count++;
        }
        double km = Math.max(0.1, route.distanceMeters() / 1000);
        return new RouteSafety.Activity(true, count, round(count / km, 2));
    }

    static double weight(SafeRouteProperties.Weights w, Factor f) {
        return switch (f) {
            case CRIME -> w.crime();
            case COMMUNITY -> w.community();
            case NIGHT_LIGHT -> w.nightLight();
            case DARKNESS -> w.darkness();
            case MAIN_ROADS -> w.mainRoads();
            case ACTIVITY -> w.activity();
            case POLICE -> w.police();
            case HOSPITAL -> w.hospital();
        };
    }

    RouteSafety.Service service(List<LatLng> samples, List<OsmContext.Poi> pois) {
        if (samples.isEmpty()) return RouteSafety.Service.unavailable();
        double radius = config.serviceRadiusMeters();
        int covered = 0;
        Set<Long> nearby = new HashSet<>();
        for (LatLng p : samples) {
            boolean hit = false;
            for (OsmContext.Poi poi : pois) {
                if (Geo.distanceMeters(p, poi.location()) <= radius) {
                    hit = true;
                    nearby.add(poi.osmId());
                }
            }
            if (hit) covered++;
        }
        return new RouteSafety.Service(true, round(covered / (double) samples.size(), 3), nearby.size());
    }

    private interface IndexValue {
        double at(int index);
    }

    private static int argMin(int size, IndexValue primary, IndexValue tieBreak) {
        Integer best = null;
        for (int i = 0; i < size; i++) {
            if (best == null) {
                best = i;
                continue;
            }
            double a = primary.at(i), b = primary.at(best);
            if (a < b - 1e-9 || (Math.abs(a - b) <= 1e-9 && tieBreak.at(i) < tieBreak.at(best))) best = i;
        }
        return best == null ? 0 : best;
    }

    private static double norm(double value, double min, double max) {
        return max - min < 1e-9 ? 0 : (value - min) / (max - min);
    }

    static double round(double value, int places) {
        double f = Math.pow(10, places);
        return Math.round(value * f) / f;
    }

    /** Most heavily weighted incident area on a route, used to look for a detour around it. */
    static Incident worstIncident(List<LatLng> geometry, List<Incident> incidents, SafeRouteProperties.Safety config, LocalDate today) {
        return incidents.stream()
                .filter(i -> Geo.distanceToPolylineMeters(i.center(), geometry)
                        <= Math.max(config.minIncidentRadiusMeters(), Math.min(config.maxIncidentRadiusMeters(), i.radiusMeters())))
                .max(Comparator.comparingDouble(i -> {
                    double w = i.type().category == CrimeType.Category.VIOLENT ? config.categoryWeights().violent() : config.categoryWeights().property();
                    long age = Math.max(0, ChronoUnit.DAYS.between(i.occurredOn(), today));
                    return w * Math.pow(0.5, age / Math.max(1, config.recencyHalfLifeDays()));
                }))
                .orElse(null);
    }
}
