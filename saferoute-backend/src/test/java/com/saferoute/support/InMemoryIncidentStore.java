package com.saferoute.support;

import com.saferoute.geo.BBox;
import com.saferoute.incident.CrimeType;
import com.saferoute.incident.Incident;
import com.saferoute.incident.IncidentStore;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class InMemoryIncidentStore implements IncidentStore {

    private record Stored(long id, NewIncident data, List<Incident.Source> sources) {}

    private final List<Stored> incidents = new ArrayList<>();
    private final List<RunInfo> runs = new ArrayList<>();
    private long nextId = 1;

    @Override
    public boolean sourceExists(String url) {
        return incidents.stream().anyMatch(s -> s.sources().stream().anyMatch(src -> src.url().equals(url)));
    }

    private final java.util.Map<String, String> processed = new java.util.HashMap<>();

    @Override
    public boolean wasProcessed(String url) {
        return processed.containsKey(url);
    }

    @Override
    public void markProcessed(String url, String outcome, Instant at) {
        processed.put(url, outcome);
    }

    @Override
    public Optional<Long> findDuplicate(CrimeType type, String localityKey, LocalDate occurredOn) {
        return incidents.stream()
                .filter(s -> s.data().type() == type && s.data().localityKey().equals(localityKey)
                        && Math.abs(s.data().occurredOn().toEpochDay() - occurredOn.toEpochDay()) <= 1)
                .map(Stored::id).findFirst();
    }

    @Override
    public long insert(NewIncident incident, Incident.Source source, Instant fetchedAt) {
        long id = nextId++;
        incidents.add(new Stored(id, incident, new ArrayList<>(List.of(source))));
        return id;
    }

    @Override
    public void addSource(long incidentId, Incident.Source source, Instant fetchedAt) {
        incidents.stream().filter(s -> s.id() == incidentId).findFirst().orElseThrow().sources().add(source);
    }

    @Override
    public List<Incident> findInBox(BBox box, LocalDate since) {
        return findSince(since).stream().filter(i -> box.contains(i.center())).toList();
    }

    @Override
    public List<Incident> findSince(LocalDate since) {
        return incidents.stream().filter(s -> !s.data().occurredOn().isBefore(since)).map(s -> new Incident(
                s.id(), s.data().type(), s.data().headline(), s.data().locality(), s.data().locationLabel(),
                s.data().center(), s.data().radiusMeters(), s.data().occurredOn(), s.data().evidenceQuote(),
                List.copyOf(s.sources()))).toList();
    }

    @Override
    public long startRun(Instant startedAt) {
        runs.add(new RunInfo(startedAt, null, false, new RunStats(0, 0, 0, 0), null));
        return runs.size();
    }

    @Override
    public void finishRun(long runId, Instant finishedAt, boolean succeeded, RunStats stats, String error) {
        RunInfo old = runs.get((int) runId - 1);
        runs.set((int) runId - 1, new RunInfo(old.startedAt(), finishedAt, succeeded, stats, error));
    }

    @Override
    public Optional<RunInfo> lastSuccessfulRun() {
        return runs.stream().filter(RunInfo::succeeded).reduce((a, b) -> b);
    }

    @Override
    public Optional<RunInfo> lastRun() {
        return runs.isEmpty() ? Optional.empty() : Optional.of(runs.get(runs.size() - 1));
    }
}
