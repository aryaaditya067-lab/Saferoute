package com.saferoute.route;

import java.util.List;

/** Measured safety facts for one route. Every number is computed from stored or fetched data. */
public record RouteSafety(
        Crime crime,
        Community community,
        Lighting lighting,
        Roads roads,
        Activity activity,
        Service police,
        Service hospital,
        NightLight nightLight,
        OpenNow openNow,
        Double riskIndex) {

    /**
     * Reported incidents whose area the route passes through. Closer incidents weigh more.
     * {@code nearestMeters}: distance from the route to the closest reported incident (null if none nearby).
     */
    public record Crime(boolean available, int incidentCount, int violentCount, int propertyCount,
                        double exposure, List<Long> incidentIds, Double nearestMeters) {
        public static Crime unavailable() {
            return new Crime(false, 0, 0, 0, 0, List.of(), null);
        }
    }

    /** Community-reported spots (confirmed by several people) near the route. */
    public record Community(boolean available, int spotCount, List<String> categories, double exposure, Double nearestMeters) {
        public static Community unavailable() {
            return new Community(false, 0, List.of(), 0, null);
        }
    }

    /** Share of the route length on roads tagged lit / unlit / not tagged in OpenStreetMap. */
    public record Lighting(boolean available, double litFraction, double unlitFraction, double unknownFraction) {
        public static Lighting unavailable() {
            return new Lighting(false, 0, 0, 1);
        }
    }

    /** Share of the route on main roads (trunk/primary/secondary/tertiary) vs smaller streets. */
    public record Roads(boolean available, double mainRoadFraction, double minorRoadFraction) {
        public static Roads unavailable() {
            return new Roads(false, 0, 0);
        }
    }

    /** Shops, eateries, banks/ATMs etc. within 100 m of the route (OpenStreetMap). */
    public record Activity(boolean available, int placeCount, double placesPerKm) {
        public static Activity unavailable() {
            return new Activity(false, 0, 0);
        }
    }

    /** Share of the route within the service radius of a police station / hospital. */
    public record Service(boolean available, double coverageFraction, int nearbyCount) {
        public static Service unavailable() {
            return new Service(false, 0, 0);
        }
    }

    /**
     * NASA Black Marble night-time brightness along the route. {@code darkFraction}: share of the
     * route in the city's darkest third; {@code coveredFraction}: share that had satellite data.
     */
    public record NightLight(boolean available, double darkFraction, double coveredFraction, double meanRadiance,
                             /** 0 = as bright as the city's brightest areas, 1 = no light at all (average along the route). */
                             double meanDarkness,
                             /** Longest continuous stretch through the city's darkest third, in metres. */
                             double longestDarkMeters,
                             /** The dark stretches of 150 m or more, as [lat, lng] polylines, for drawing on the map. */
                             List<List<double[]>> darkStretches) {
        public NightLight(boolean available, double darkFraction, double coveredFraction, double meanRadiance) {
            this(available, darkFraction, coveredFraction, meanRadiance, darkFraction, 0, List.of());
        }

        public static NightLight unavailable() {
            return new NightLight(false, 0, 0, 0, 0, 0, List.of());
        }
    }

    /**
     * Shops and amenities within 100 m whose OpenStreetMap opening hours say they are open
     * at the city's current local time ({@code checkedAt}, "HH:mm"). Places without
     * readable hours are not counted either way.
     */
    public record OpenNow(boolean available, int withHours, int openNow, String checkedAt) {
        public static OpenNow unavailable() {
            return new OpenNow(false, 0, 0, null);
        }
    }

    public RouteSafety withRisk(Double risk) {
        return new RouteSafety(crime, community, lighting, roads, activity, police, hospital, nightLight, openNow, risk);
    }

    public RouteSafety withOpenNow(OpenNow value) {
        return new RouteSafety(crime, community, lighting, roads, activity, police, hospital, nightLight, value, riskIndex);
    }
}
