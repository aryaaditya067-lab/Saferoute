package com.saferoute.community;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

/** What a community member can report. {@code weight} is its relative importance in routing. */
public enum ReportCategory {
    HARASSMENT("Harassment", 1.0),
    SUSPICIOUS("Suspicious activity", 0.7),
    DARK_SPOT("Poorly lit", 0.6),
    DESERTED("Deserted stretch", 0.6),
    POOR_ROAD("Bad road / potholes", 0.4);

    public final String label;
    public final double weight;

    ReportCategory(String label, double weight) {
        this.label = label;
        this.weight = weight;
    }

    public String id() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static Optional<ReportCategory> fromId(String value) {
        if (value == null) return Optional.empty();
        String n = value.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return Arrays.stream(values()).filter(c -> c.name().equals(n)).findFirst();
    }
}
