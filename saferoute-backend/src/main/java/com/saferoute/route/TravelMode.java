package com.saferoute.route;

import java.util.Locale;

public enum TravelMode {
    DRIVING("routed-car"),
    CYCLING("routed-bike"),
    WALKING("routed-foot");

    /** Path of the FOSSGIS OSRM instance for this profile. */
    public final String osrmPath;

    TravelMode(String osrmPath) {
        this.osrmPath = osrmPath;
    }

    public String id() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static TravelMode parse(String value) {
        if (value == null) return DRIVING;
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown travel mode: " + value);
        }
    }
}
