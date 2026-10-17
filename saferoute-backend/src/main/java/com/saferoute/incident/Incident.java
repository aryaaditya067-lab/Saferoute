package com.saferoute.incident;

import com.saferoute.geo.LatLng;
import java.time.LocalDate;
import java.util.List;

/** A crime reported in the news, located at locality level and checked against its source article. */
public record Incident(
        long id,
        CrimeType type,
        String headline,
        String locality,
        String locationLabel,
        LatLng center,
        int radiusMeters,
        LocalDate occurredOn,
        String evidenceQuote,
        List<Source> sources) {

    public record Source(String url, String title, String site, LocalDate publishedOn) {}
}
