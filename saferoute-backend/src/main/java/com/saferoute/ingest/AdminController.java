package com.saferoute.ingest;

import com.saferoute.common.ApiException;
import com.saferoute.config.SafeRouteProperties;
import com.saferoute.incident.IncidentStore;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AdminController {

    private final IncidentIngestService ingest;
    private final BackfillService backfill;
    private final IncidentStore store;
    private final MimoClient mimo;
    private final SafeRouteProperties properties;
    private final Clock clock;

    public AdminController(IncidentIngestService ingest, BackfillService backfill, IncidentStore store, MimoClient mimo,
                           SafeRouteProperties properties, Clock clock) {
        this.ingest = ingest;
        this.backfill = backfill;
        this.store = store;
        this.mimo = mimo;
        this.properties = properties;
        this.clock = clock;
    }

    /** Public, read-only health of the crime data pipeline. */
    @GetMapping("/api/v1/status")
    public Map<String, Object> status() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("city", properties.city().name());
        out.put("mimoConfigured", mimo.configured());
        out.put("ingestEnabled", properties.ingest().enabled());
        out.put("ingestInterval", properties.ingest().interval().toString());
        LocalDate since = LocalDate.now(clock).minusDays(properties.safety().incidentWindowDays());
        out.put("incidentsInWindow", store.findSince(since).size());
        out.put("lastSuccessfulIngestAt", store.lastSuccessfulRun()
                .map(r -> r.finishedAt() == null ? null : r.finishedAt().toString()).orElse(null));
        store.lastRun().ifPresent(r -> {
            Map<String, Object> run = new LinkedHashMap<>();
            run.put("startedAt", r.startedAt().toString());
            run.put("succeeded", r.succeeded());
            run.put("candidates", r.stats().candidates());
            run.put("accepted", r.stats().accepted());
            run.put("merged", r.stats().merged());
            run.put("rejected", r.stats().rejected());
            run.put("error", r.error());
            out.put("lastRun", run);
        });
        return out;
    }

    /** Starts loading the last N months of crime news in the background (no AI). Requires X-Admin-Token. */
    @PostMapping("/api/v1/admin/backfill")
    public BackfillService.Progress startBackfill(
            @RequestHeader(value = "X-Admin-Token", required = false) String token,
            @RequestParam(value = "months", required = false) Integer months) {
        checkToken(token);
        return backfill.start(months == null ? properties.backfill().months() : months);
    }

    /** Progress of the background history load. */
    @GetMapping("/api/v1/admin/backfill")
    public BackfillService.Progress backfillStatus() {
        return backfill.status();
    }

    /** Runs one ingest now. Requires the X-Admin-Token header. */
    @PostMapping("/api/v1/admin/ingest")
    public Object runIngest(@RequestHeader(value = "X-Admin-Token", required = false) String token) {
        checkToken(token);
        if (!properties.ingest().useMimo()) {
            if ("running".equals(backfill.status().state())) return backfill.status();
            return backfill.runRecent(14);
        }
        return ingest.runOnce();
    }

    private void checkToken(String token) {
        String expected = properties.admin().token();
        if (expected == null || expected.isBlank()) {
            throw new ApiException(ApiException.Code.NOT_CONFIGURED, "Set SAFEROUTE_ADMIN_TOKEN to enable admin actions.");
        }
        if (token == null || !MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8))) {
            throw new ApiException(ApiException.Code.UNAUTHORIZED, "Invalid admin token.");
        }
    }
}
