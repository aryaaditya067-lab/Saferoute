package com.saferoute.route;

/** Test helper exposing package-private scorer functions to other test packages. */
public final class SafetyScorerAccess {
    private SafetyScorerAccess() {}

    public static double distanceWeight(double d, double radius) {
        return SafetyScorer.distanceWeight(d, radius);
    }
}
