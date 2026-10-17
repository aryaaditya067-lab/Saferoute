package com.saferoute.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Everything under {@code saferoute.*} in application.yml. */
@ConfigurationProperties(prefix = "saferoute")
public record SafeRouteProperties(
        Cors cors,
        City city,
        Providers providers,
        Mimo mimo,
        Ingest ingest,
        Safety safety,
        Community community,
        Backfill backfill,
        NightLights nightLights,
        Transit transit,
        Admin admin) {

    public record Cors(List<String> allowedOrigins) {}

    public record City(String name, List<String> aliases, String country, String region, BBoxConfig bbox) {}

    public record BBoxConfig(double south, double west, double north, double east) {}

    public record Providers(String routerUrl, String geocoderUrl, String overpassUrl, String userAgent) {}

    /** {@code searchLimit}: results per search keyword (MiMo {@code limit}); null = MiMo default. */
    public record Mimo(String baseUrl, String apiKey, String model, int maxKeywords, Integer searchLimit) {
        public boolean configured() {
            return apiKey != null && !apiKey.isBlank();
        }
    }

    public record Ingest(
            boolean enabled,
            Duration interval,
            Duration initialDelay,
            int lookbackDays,
            int maxArticlesPerRun,
            boolean gdeltEnabled,
            String gdeltUrl,
            /** Use MiMo to read articles (slower, needs a key). Off = fast keyword rules. */
            boolean useMimo) {}

    /** {@code file}: CSV written by tools/nightlights.py (lat,lng,radiance). */
    public record NightLights(String file) {}

    /**
     * Walking extras. {@code timeZone}: the city's zone for "open now". {@code operatorHours}: optional
     * network-wide metro hours in OSM opening_hours syntax, used only for stations that have no hours in
     * OpenStreetMap, and only with {@code operatorHoursSource} naming where they were copied from.
     */
    public record Transit(String timeZone, String operatorHours, String operatorHoursSource, int maxStationDistanceMeters) {}

    public record Backfill(int months, int windowDays, boolean fetchArticles) {}

    public record Safety(
            int incidentWindowDays,
            double recencyHalfLifeDays,
            int minIncidentRadiusMeters,
            int maxIncidentRadiusMeters,
            int serviceRadiusMeters,
            double maxDetourFactor,
            Weights weights,
            CategoryWeights categoryWeights) {}

    public record Weights(double crime, double community, double nightLight, double darkness, double mainRoads,
                          double activity, double police, double hospital) {}

    public record Community(
            int expiryDays,
            int confirmThreshold,
            int clusterRadiusMeters,
            int maxPerDevicePerDay,
            int maxPerIpPerDay) {}

    public record CategoryWeights(double violent, double property) {}

    public record Admin(String token) {}
}
