package com.saferoute.incident;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

/**
 * Street-level crime types SafeRoute maps. Reports outside this list (cyber
 * crime, fraud, domestic disputes, …) are not about the safety of a street
 * and are not stored.
 */
public enum CrimeType {
    MURDER("Murder", Category.VIOLENT),
    ASSAULT("Assault", Category.VIOLENT),
    ROBBERY("Robbery", Category.VIOLENT),
    CHAIN_SNATCHING("Chain snatching", Category.VIOLENT),
    SEXUAL_OFFENCE("Sexual offence", Category.VIOLENT),
    KIDNAPPING("Kidnapping", Category.VIOLENT),
    STABBING("Stabbing", Category.VIOLENT),
    THEFT("Theft", Category.PROPERTY),
    PHONE_SNATCHING("Phone snatching", Category.PROPERTY),
    VEHICLE_THEFT("Vehicle theft", Category.PROPERTY),
    BURGLARY("Burglary", Category.PROPERTY);

    public enum Category { VIOLENT, PROPERTY }

    public final String label;
    public final Category category;

    CrimeType(String label, Category category) {
        this.label = label;
        this.category = category;
    }

    public String id() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static Optional<CrimeType> fromId(String value) {
        if (value == null) return Optional.empty();
        String normalized = value.trim().toUpperCase(Locale.ROOT).replace(' ', '_').replace('-', '_');
        return Arrays.stream(values()).filter(t -> t.name().equals(normalized)).findFirst();
    }

    public static String allowedIds() {
        return String.join(", ", Arrays.stream(values()).map(CrimeType::id).toList());
    }
}
