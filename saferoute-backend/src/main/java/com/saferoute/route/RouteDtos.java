package com.saferoute.route;

import java.util.List;
import java.util.Map;

/** JSON shapes of the routes API (mirrored in the frontend's types/index.ts). */
public final class RouteDtos {

    private RouteDtos() {}

    public record Coordinates(Double lat, Double lng) {}

    public record RouteRequest(Coordinates pickup, Coordinates destination, String mode, Boolean alternatives) {}

    public record RouteDto(
            String id,
            int index,
            List<Coordinates> geometry,
            double distanceMeters,
            double durationSeconds,
            String summary,
            List<String> labels,
            RouteSafety safety) {}

    public record SafetyMethod(
            boolean crimeDataAvailable,
            String crimeDataNote,
            boolean osmDataAvailable,
            List<String> factorsUsed,
            Map<String, Double> weights,
            int incidentWindowDays,
            int serviceRadiusMeters,
            String lastCrimeUpdateAt) {}

    public record RouteResponse(
            List<RouteDto> routes,
            String mode,
            Coordinates pickup,
            Coordinates destination,
            String provider,
            String computedAt,
            SafetyMethod safety,
            /** Walking only: metro stations near the start and end. Null for other modes. */
            Transit transit) {}

    /**
     * A metro station. {@code hoursToday}/{@code openNow} are null when no readable hours exist;
     * {@code hoursSource} says where the hours came from ("OpenStreetMap" or the configured operator source).
     */
    public record Station(String name, double lat, double lng, Double distanceMeters, String hoursToday,
                          Boolean openNow, String hoursSource, String network) {}

    public record Transit(Station nearStart, Station nearEnd, List<Station> stations, String localTime,
                          boolean dataAvailable, String note) {}
}
