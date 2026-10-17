package com.saferoute.community;

import com.saferoute.geo.BBox;
import com.saferoute.geo.LatLng;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcCommunityStore implements CommunityStore {

    private final JdbcTemplate jdbc;

    public JdbcCommunityStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public long insert(CommunityReport r) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            var st = connection.prepareStatement(
                    "INSERT INTO community_report (category, lat, lng, note, reporter_key, ip_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            st.setString(1, r.category().name());
            st.setDouble(2, r.location().lat());
            st.setDouble(3, r.location().lng());
            st.setString(4, r.note());
            st.setString(5, r.reporterKey());
            st.setString(6, r.ipKey());
            st.setTimestamp(7, Timestamp.from(r.createdAt()));
            return st;
        }, keys);
        Number key = keys.getKey();
        if (key == null) throw new IllegalStateException("No id generated for community report.");
        return key.longValue();
    }

    @Override
    public int countByReporterSince(String reporterKey, Instant since) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM community_report WHERE reporter_key = ? AND created_at >= ?",
                Integer.class, reporterKey, Timestamp.from(since));
        return n == null ? 0 : n;
    }

    @Override
    public int countByIpSince(String ipKey, Instant since) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM community_report WHERE ip_key = ? AND created_at >= ?",
                Integer.class, ipKey, Timestamp.from(since));
        return n == null ? 0 : n;
    }

    @Override
    public List<CommunityReport> findByReporterSince(String reporterKey, Instant since) {
        return jdbc.query("SELECT * FROM community_report WHERE reporter_key = ? AND created_at >= ? ORDER BY id DESC",
                JdbcCommunityStore::row, reporterKey, Timestamp.from(since));
    }

    @Override
    public List<CommunityReport> findInBox(BBox box, Instant since) {
        return jdbc.query("SELECT * FROM community_report WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? AND created_at >= ? ORDER BY id DESC LIMIT 5000",
                JdbcCommunityStore::row, box.south(), box.north(), box.west(), box.east(), Timestamp.from(since));
    }

    @Override
    public List<CommunityReport> findSince(Instant since) {
        return jdbc.query("SELECT * FROM community_report WHERE created_at >= ? ORDER BY id DESC LIMIT 20000",
                JdbcCommunityStore::row, Timestamp.from(since));
    }

    @Override
    public synchronized String secret(String name) {
        List<String> found = jdbc.queryForList("SELECT val FROM app_setting WHERE name = ?", String.class, name);
        if (!found.isEmpty()) return found.get(0);
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        String value = HexFormat.of().formatHex(bytes);
        jdbc.update("INSERT INTO app_setting (name, val) VALUES (?, ?)", name, value);
        return value;
    }

    private static CommunityReport row(ResultSet rs, int n) throws SQLException {
        return new CommunityReport(rs.getLong("id"),
                ReportCategory.fromId(rs.getString("category")).orElse(ReportCategory.SUSPICIOUS),
                new LatLng(rs.getDouble("lat"), rs.getDouble("lng")), rs.getString("note"),
                rs.getString("reporter_key"), rs.getString("ip_key"), rs.getTimestamp("created_at").toInstant());
    }
}
