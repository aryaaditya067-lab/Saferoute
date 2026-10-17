package com.saferoute.incident;

import com.saferoute.config.SafeRouteProperties;
import com.saferoute.geo.BBox;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/incidents")
public class IncidentController {

    public static final String SOURCE_NOTE =
            "News reports found through the GDELT news index, each placed by the locality named in the "
                    + "article and linked to it. These are not official police records.";

    private final IncidentStore store;
    private final SafeRouteProperties properties;
    private final Clock clock;

    public IncidentController(IncidentStore store, SafeRouteProperties properties, Clock clock) {
        this.store = store;
        this.properties = properties;
        this.clock = clock;
    }

    @GetMapping
    public IncidentDtos.IncidentsResponse list(
            @RequestParam double south,
            @RequestParam double west,
            @RequestParam double north,
            @RequestParam double east) {
        BBox box = new BBox(south, west, north, east);
        int window = properties.safety().incidentWindowDays();
        LocalDate since = LocalDate.now(clock).minusDays(window);
        List<IncidentDtos.IncidentDto> incidents =
                store.findInBox(box, since).stream().map(IncidentDtos.IncidentDto::from).toList();
        var lastRun = store.lastSuccessfulRun();
        return new IncidentDtos.IncidentsResponse(
                incidents,
                lastRun.isPresent(),
                window,
                lastRun.map(r -> r.finishedAt() == null ? null : r.finishedAt().toString()).orElse(null),
                properties.city().name(),
                SOURCE_NOTE);
    }
}
