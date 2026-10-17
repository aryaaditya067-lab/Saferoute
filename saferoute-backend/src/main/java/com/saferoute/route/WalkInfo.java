package com.saferoute.route;

import com.saferoute.config.SafeRouteProperties;
import com.saferoute.geo.BBox;
import com.saferoute.geo.Geo;
import com.saferoute.geo.LatLng;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Walking extras: places open right now along a route, and metro stations near the start and end. */
final class WalkInfo {

    static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");
    static final String OSM = "OpenStreetMap";

    private WalkInfo() {}

    static RouteSafety.OpenNow openNow(List<LatLng> geometry, List<OsmContext.Poi> places, LocalDateTime now) {
        BBox near = BBox.around(geometry).expand(OverpassClient.ACTIVITY_RADIUS_METERS);
        int withHours = 0, open = 0;
        for (OsmContext.Poi p : places) {
            if (p.openingHours() == null || !near.contains(p.location())) continue;
            if (Geo.distanceToPolylineMeters(p.location(), geometry) > OverpassClient.ACTIVITY_RADIUS_METERS) continue;
            OpeningHours hours = OpeningHours.parse(p.openingHours());
            if (hours == null) continue;
            withHours++;
            if (hours.isOpen(now)) open++;
        }
        return new RouteSafety.OpenNow(true, withHours, open, now.format(HHMM));
    }

    static RouteDtos.Transit transit(LatLng pickup, LatLng destination, List<OsmContext.Station> found,
                                     LocalDateTime now, SafeRouteProperties.Transit config) {
        String time = now.format(HHMM);
        if (found == null) {
            return new RouteDtos.Transit(null, null, List.of(), time, false,
                    "Station data from OpenStreetMap isn't available right now.");
        }
        OpeningHours fallback = config == null || blank(config.operatorHoursSource()) ? null : OpeningHours.parse(config.operatorHours());
        int maxDistance = config == null || config.maxStationDistanceMeters() <= 0 ? 1200 : config.maxStationDistanceMeters();
        List<RouteDtos.Station> all = new ArrayList<>();
        for (OsmContext.Station s : found) all.add(dto(s, null, now, fallback, config));
        RouteDtos.Station start = nearest(pickup, found, maxDistance, now, fallback, config);
        RouteDtos.Station end = nearest(destination, found, maxDistance, now, fallback, config);
        String note = found.isEmpty()
                ? "No metro stations are mapped near this walk."
                : "Station hours come from " + (fallback == null ? OSM : OSM + " or " + config.operatorHoursSource())
                  + ". Services can end early on some days, so check before you rely on the last train.";
        return new RouteDtos.Transit(start, end, all, time, true, note);
    }

    private static RouteDtos.Station nearest(LatLng point, List<OsmContext.Station> stations, int maxDistance,
                                             LocalDateTime now, OpeningHours fallback, SafeRouteProperties.Transit config) {
        return stations.stream()
                .map(s -> new Object[] {s, Geo.distanceMeters(point, s.location())})
                .filter(o -> (double) o[1] <= maxDistance)
                .min(Comparator.comparingDouble(o -> (double) o[1]))
                .map(o -> dto((OsmContext.Station) o[0], (double) Math.round((double) o[1]), now, fallback, config))
                .orElse(null);
    }

    private static RouteDtos.Station dto(OsmContext.Station s, Double distance, LocalDateTime now,
                                         OpeningHours fallback, SafeRouteProperties.Transit config) {
        OpeningHours hours = OpeningHours.parse(s.openingHours());
        String source = hours != null ? OSM : null;
        if (hours == null && fallback != null) {
            hours = fallback;
            source = config.operatorHoursSource();
        }
        return new RouteDtos.Station(s.name(), s.location().lat(), s.location().lng(), distance,
                hours == null ? null : hours.describe(now.toLocalDate()),
                hours == null ? null : hours.isOpen(now), source, blank(s.network()) ? null : s.network());
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
