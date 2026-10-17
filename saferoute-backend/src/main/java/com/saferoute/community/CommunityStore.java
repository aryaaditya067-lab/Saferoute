package com.saferoute.community;

import com.saferoute.geo.BBox;
import java.time.Instant;
import java.util.List;

public interface CommunityStore {

    long insert(CommunityReport report);

    int countByReporterSince(String reporterKey, Instant since);

    int countByIpSince(String ipKey, Instant since);

    List<CommunityReport> findByReporterSince(String reporterKey, Instant since);

    List<CommunityReport> findInBox(BBox box, Instant since);

    List<CommunityReport> findSince(Instant since);

    /** A secret stored once in the database (used to salt hashes so they survive restarts). */
    String secret(String name);
}
