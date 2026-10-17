package com.saferoute.support;

import com.saferoute.config.SafeRouteProperties;
import java.time.Duration;
import java.util.List;

public final class TestProps {

    private TestProps() {}

    public static SafeRouteProperties properties(String mimoKey) {
        return new SafeRouteProperties(
                new SafeRouteProperties.Cors(List.of("http://localhost:3000")),
                new SafeRouteProperties.City("Bengaluru", List.of("Bengaluru", "Bangalore"), "India", "Karnataka",
                        new SafeRouteProperties.BBoxConfig(12.73, 77.37, 13.23, 77.88)),
                new SafeRouteProperties.Providers("https://router.test", "https://photon.test", "https://overpass.test/api/interpreter", "test"),
                new SafeRouteProperties.Mimo("https://mimo.test/v1", mimoKey, "mimo-v2.6-flash", 3, 5),
                new SafeRouteProperties.Ingest(true, Duration.ofHours(3), Duration.ofSeconds(30), 3, 15, true, "https://gdelt.test/api", true),
                safety(),
                new SafeRouteProperties.Community(60, 3, 150, 5, 20),
                new SafeRouteProperties.Backfill(12, 15, true),
                new SafeRouteProperties.NightLights("./build/no-such-nightlights.csv"),
                new SafeRouteProperties.Transit("Asia/Kolkata", "", "", 1200),
                new SafeRouteProperties.Admin("secret"));
    }

    public static SafeRouteProperties.Safety safety() {
        return new SafeRouteProperties.Safety(90, 30, 250, 1500, 1000, 1.5,
                new SafeRouteProperties.Weights(0.35, 0.15, 0.10, 0.12, 0.12, 0.08, 0.10, 0.08),
                new SafeRouteProperties.CategoryWeights(1.0, 0.5));
    }
}
