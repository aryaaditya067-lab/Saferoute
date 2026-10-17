package com.saferoute.community;

import com.saferoute.geo.LatLng;
import java.time.Instant;

/** One report from one person. {@code reporterKey} is a salted hash of their device id, never the id itself. */
public record CommunityReport(long id, ReportCategory category, LatLng location, String note, String reporterKey,
                              String ipKey, Instant createdAt) {}
