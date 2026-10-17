package com.saferoute.incident;

import com.saferoute.geo.BBox;
import com.saferoute.geo.LatLng;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcIncidentStore implements IncidentStore {

    private final JdbcTemplate jdbc;

    public JdbcIncidentStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean sourceExists(String url) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM incident_source WHERE url = ?", Integer.class, url);
        return count != null && count > 0;
    }

    @Override
    public boolean wasProcessed(String url) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM processed_url WHERE url = ?", Integer.class, truncate(url, 2000));
        return count != null && count > 0;
    }

    @Override
    public void markProcessed(String url, String outcome, Instant at) {
        jdbc.update("MERGE INTO processed_url (url, outcome, processed_at) KEY (url) VALUES (?, ?, ?)",
                truncate(url, 2000), truncate(outcome, 40), Timestamp.from(at));
    }

    @Override
    public Optional<Long> findDuplicate(CrimeType type, String localityKey, LocalDate occurredOn) {
        List<Long> ids = jdbc.queryForList(
                "SELECT id FROM incident WHERE crime_type = ? AND locality_key = ? AND occurred_on BETWEEN ? AND ? ORDER BY id LIMIT 1",
                Long.class, type.name(), localityKey, occurredOn.minusDays(1), occurredOn.plusDays(1));
        return ids.stream().findFirst();
    }

    @Override
    @Transactional
    public long insert(NewIncident incident, Incident.Source source, Instant fetchedAt) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            var statement = connection.prepareStatement(
                    "INSERT INTO incident (crime_type, category, headline, locality, locality_key, location_label, lat, lng, radius_m, occurred_on, evidence_quote, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, incident.type().name());
            statement.setString(2, incident.type().category.name());
            statement.setString(3, truncate(incident.headline(), 500));
            statement.setString(4, truncate(incident.locality(), 200));
            statement.setString(5, truncate(incident.localityKey(), 200));
            statement.setString(6, truncate(incident.locationLabel(), 500));
            statement.setDouble(7, incident.center().lat());
            statement.setDouble(8, incident.center().lng());
            statement.setInt(9, incident.radiusMeters());
            statement.setObject(10, incident.occurredOn());
            statement.setString(11, truncate(incident.evidenceQuote(), 1000));
            statement.setTimestamp(12, Timestamp.from(fetchedAt));
            return statement;
        }, keys);
        Number key = keys.getKey();
        if (key == null) throw new IllegalStateException("No id generated for incident.");
        long id = key.longValue();
        addSource(id, source, fetchedAt);
        return id;
    }

    @Override
    public void addSource(long incidentId, Incident.Source source, Instant fetchedAt) {
        jdbc.update(
                "INSERT INTO incident_source (incident_id, url, title, site, published_on, fetched_at) VALUES (?, ?, ?, ?, ?, ?)",
                incidentId, truncate(source.url(), 2000), truncate(source.title(), 500), truncate(source.site(), 200),
                source.publishedOn(), Timestamp.from(fetchedAt));
    }

    @Override
    public List<Incident> findInBox(BBox box, LocalDate since) {
        return load(
                "SELECT * FROM incident WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? AND occurred_on >= ? ORDER BY occurred_on DESC, id DESC LIMIT 2000",
                box.south(), box.north(), box.west(), box.east(), since);
    }

    @Override
    public List<Incident> findSince(LocalDate since) {
        return load("SELECT * FROM incident WHERE occurred_on >= ? ORDER BY occurred_on DESC, id DESC LIMIT 5000", since);
    }

    private List<Incident> load(String sql, Object... args) {
        Map<Long, Row> rows = new LinkedHashMap<>();
        jdbc.query(sql, (ResultSet rs) -> {
            Row row = Row.from(rs);
            rows.put(row.id, row);
        }, args);
        if (rows.isEmpty()) return List.of();

        Map<Long, List<Incident.Source>> sources = new LinkedHashMap<>();
        String placeholders = String.join(",", rows.keySet().stream().map(id -> "?").toList());
        jdbc.query(
                "SELECT incident_id, url, title, site, published_on FROM incident_source WHERE incident_id IN (" + placeholders + ") ORDER BY id",
                (ResultSet rs) -> {
                    LocalDate published = rs.getObject("published_on", LocalDate.class);
                    sources.computeIfAbsent(rs.getLong("incident_id"), k -> new ArrayList<>())
                            .add(new Incident.Source(rs.getString("url"), rs.getString("title"), rs.getString("site"), published));
                },
                rows.keySet().toArray());

        List<Incident> result = new ArrayList<>();
        for (Row row : rows.values()) {
            CrimeType type = CrimeType.fromId(row.crimeType).orElse(null);
            if (type == null) continue;
            result.add(new Incident(row.id, type, row.headline, row.locality, row.locationLabel,
                    new LatLng(row.lat, row.lng), row.radius, row.occurredOn, row.evidenceQuote,
                    List.copyOf(sources.getOrDefault(row.id, List.of()))));
        }
        return result;
    }

    @Override
    public long startRun(Instant startedAt) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            var statement = connection.prepareStatement("INSERT INTO ingest_run (started_at) VALUES (?)", Statement.RETURN_GENERATED_KEYS);
            statement.setTimestamp(1, Timestamp.from(startedAt));
            return statement;
        }, keys);
        Number key = keys.getKey();
        if (key == null) throw new IllegalStateException("No id generated for ingest run.");
        return key.longValue();
    }

    @Override
    public void finishRun(long runId, Instant finishedAt, boolean succeeded, RunStats stats, String error) {
        jdbc.update(
                "UPDATE ingest_run SET finished_at = ?, succeeded = ?, candidates = ?, accepted = ?, merged = ?, rejected = ?, error = ? WHERE id = ?",
                Timestamp.from(finishedAt), succeeded, stats.candidates(), stats.accepted(), stats.merged(), stats.rejected(),
                truncate(error, 2000), runId);
    }

    @Override
    public Optional<RunInfo> lastSuccessfulRun() {
        return jdbc.query("SELECT * FROM ingest_run WHERE succeeded = TRUE ORDER BY id DESC LIMIT 1", JdbcIncidentStore::runInfo)
                .stream().findFirst();
    }

    @Override
    public Optional<RunInfo> lastRun() {
        return jdbc.query("SELECT * FROM ingest_run ORDER BY id DESC LIMIT 1", JdbcIncidentStore::runInfo).stream().findFirst();
    }

    private static RunInfo runInfo(ResultSet rs, int rowNum) throws SQLException {
        Timestamp finished = rs.getTimestamp("finished_at");
        return new RunInfo(
                rs.getTimestamp("started_at").toInstant(),
                finished == null ? null : finished.toInstant(),
                rs.getBoolean("succeeded"),
                new RunStats(rs.getInt("candidates"), rs.getInt("accepted"), rs.getInt("merged"), rs.getInt("rejected")),
                rs.getString("error"));
    }

    private static String truncate(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }

    private record Row(long id, String crimeType, String headline, String locality, String locationLabel,
                       double lat, double lng, int radius, LocalDate occurredOn, String evidenceQuote) {
        static Row from(ResultSet rs) throws SQLException {
            return new Row(rs.getLong("id"), rs.getString("crime_type"), rs.getString("headline"), rs.getString("locality"),
                    rs.getString("location_label"), rs.getDouble("lat"), rs.getDouble("lng"), rs.getInt("radius_m"),
                    rs.getObject("occurred_on", LocalDate.class), rs.getString("evidence_quote"));
        }
    }
}
