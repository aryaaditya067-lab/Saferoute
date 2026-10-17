package com.saferoute.incident;

import com.saferoute.geo.BBox;
import com.saferoute.geo.LatLng;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/** Persistence for incidents and ingest runs. */
public interface IncidentStore {

    record NewIncident(
            CrimeType type,
            String headline,
            String locality,
            String localityKey,
            String locationLabel,
            LatLng center,
            int radiusMeters,
            LocalDate occurredOn,
            String evidenceQuote) {}

    record RunStats(int candidates, int accepted, int merged, int rejected) {}

    record RunInfo(Instant startedAt, Instant finishedAt, boolean succeeded, RunStats stats, String error) {}

    boolean sourceExists(String url);

    /** True if this article URL was already read by an earlier run (whatever the outcome). */
    boolean wasProcessed(String url);

    void markProcessed(String url, String outcome, Instant at);

    /** Same crime type, same locality, within ±1 day: treated as the same incident. */
    Optional<Long> findDuplicate(CrimeType type, String localityKey, LocalDate occurredOn);

    long insert(NewIncident incident, Incident.Source source, Instant fetchedAt);

    void addSource(long incidentId, Incident.Source source, Instant fetchedAt);

    List<Incident> findInBox(BBox box, LocalDate since);

    List<Incident> findSince(LocalDate since);

    long startRun(Instant startedAt);

    void finishRun(long runId, Instant finishedAt, boolean succeeded, RunStats stats, String error);

    Optional<RunInfo> lastSuccessfulRun();

    Optional<RunInfo> lastRun();
}
