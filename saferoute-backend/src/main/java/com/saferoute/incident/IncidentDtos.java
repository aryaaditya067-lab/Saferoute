package com.saferoute.incident;

import java.util.List;

/** JSON shapes returned by the incidents API (mirrored in the frontend's types). */
public final class IncidentDtos {

    private IncidentDtos() {}

    public record SourceDto(String url, String title, String site, String publishedOn) {}

    public record IncidentDto(
            long id,
            String crimeType,
            String crimeLabel,
            String category,
            String headline,
            String locality,
            double lat,
            double lng,
            int radiusMeters,
            String occurredOn,
            String evidenceQuote,
            List<SourceDto> sources) {

        public static IncidentDto from(Incident i) {
            return new IncidentDto(
                    i.id(), i.type().id(), i.type().label, i.type().category.name().toLowerCase(),
                    i.headline(), i.locality(), i.center().lat(), i.center().lng(), i.radiusMeters(),
                    i.occurredOn().toString(), i.evidenceQuote(),
                    i.sources().stream().map(s -> new SourceDto(s.url(), s.title(), s.site(),
                            s.publishedOn() == null ? null : s.publishedOn().toString())).toList());
        }
    }

    public record IncidentsResponse(
            List<IncidentDto> incidents,
            boolean dataAvailable,
            int windowDays,
            String lastUpdatedAt,
            String city,
            String sourceNote) {}
}
