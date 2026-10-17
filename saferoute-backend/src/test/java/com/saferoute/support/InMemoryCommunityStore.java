package com.saferoute.support;

import com.saferoute.community.CommunityReport;
import com.saferoute.community.CommunityStore;
import com.saferoute.geo.BBox;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class InMemoryCommunityStore implements CommunityStore {

    private final List<CommunityReport> reports = new ArrayList<>();
    private final Map<String, String> secrets = new HashMap<>();

    @Override
    public long insert(CommunityReport r) {
        long id = reports.size() + 1;
        reports.add(new CommunityReport(id, r.category(), r.location(), r.note(), r.reporterKey(), r.ipKey(), r.createdAt()));
        return id;
    }

    @Override
    public int countByReporterSince(String reporterKey, Instant since) {
        return (int) reports.stream().filter(r -> r.reporterKey().equals(reporterKey) && !r.createdAt().isBefore(since)).count();
    }

    @Override
    public int countByIpSince(String ipKey, Instant since) {
        return (int) reports.stream().filter(r -> r.ipKey().equals(ipKey) && !r.createdAt().isBefore(since)).count();
    }

    @Override
    public List<CommunityReport> findByReporterSince(String reporterKey, Instant since) {
        return reports.stream().filter(r -> r.reporterKey().equals(reporterKey) && !r.createdAt().isBefore(since)).toList();
    }

    @Override
    public List<CommunityReport> findInBox(BBox box, Instant since) {
        return reports.stream().filter(r -> box.contains(r.location()) && !r.createdAt().isBefore(since)).toList();
    }

    @Override
    public List<CommunityReport> findSince(Instant since) {
        return reports.stream().filter(r -> !r.createdAt().isBefore(since)).toList();
    }

    @Override
    public String secret(String name) {
        return secrets.computeIfAbsent(name, k -> "test-salt");
    }
}
