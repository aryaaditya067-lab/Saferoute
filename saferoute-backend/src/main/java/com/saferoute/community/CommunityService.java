package com.saferoute.community;

import com.saferoute.common.ApiException;
import com.saferoute.config.SafeRouteProperties;
import com.saferoute.geo.BBox;
import com.saferoute.geo.Geo;
import com.saferoute.geo.LatLng;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Community safety reports: submission with abuse limits, and grouping of nearby
 * reports into spots. A spot is "confirmed" (and used for routing) only when enough
 * different people reported the same thing in the same place.
 */
@Service
public class CommunityService {

    public record Submission(String category, Double lat, Double lng, String note, String deviceId) {}

    public record Spot(
            long id,
            String category,
            String categoryLabel,
            double lat,
            double lng,
            int reportCount,
            int reporters,
            boolean confirmed,
            String latestAt,
            List<String> notes) {}

    public record SpotsResponse(List<Spot> spots, int confirmThreshold, int expiryDays, String note) {}

    public static final String NOTE =
            "Reported by SafeRoute users. Not verified. A spot is used for routing only after "
                    + "several different people report it.";

    private static final Pattern DEVICE_ID = Pattern.compile("^[A-Za-z0-9-]{8,64}$");
    private static final Pattern CONTROL = Pattern.compile("[\\p{Cntrl}&&[^\\n]]");

    private final CommunityStore store;
    private final SafeRouteProperties.Community config;
    private final BBox cityBox;
    private final Clock clock;

    public CommunityService(CommunityStore store, SafeRouteProperties properties, Clock clock) {
        this.store = store;
        this.config = properties.community();
        SafeRouteProperties.BBoxConfig b = properties.city().bbox();
        this.cityBox = new BBox(b.south(), b.west(), b.north(), b.east());
        this.clock = clock;
    }

    public Spot submit(Submission s, String remoteAddress) {
        ReportCategory category = ReportCategory.fromId(s.category())
                .orElseThrow(() -> new IllegalArgumentException("Choose what you want to report."));
        if (s.lat() == null || s.lng() == null) throw new IllegalArgumentException("Choose a place on the map.");
        LatLng point;
        try {
            point = new LatLng(s.lat(), s.lng());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("That location isn't valid.");
        }
        if (!cityBox.contains(point)) {
            throw new IllegalArgumentException("Community reports are collected for the covered city only.");
        }
        if (s.deviceId() == null || !DEVICE_ID.matcher(s.deviceId()).matches()) {
            throw new IllegalArgumentException("Missing device id. Reload the page and try again.");
        }
        String note = s.note() == null ? null : CONTROL.matcher(s.note()).replaceAll("").trim();
        if (note != null && note.isEmpty()) note = null;
        if (note != null && note.length() > 200) throw new IllegalArgumentException("Keep the note under 200 characters.");

        Instant now = clock.instant();
        Instant dayAgo = now.minus(Duration.ofDays(1));
        String reporter = hash("device:" + s.deviceId());
        String ip = hash("ip:" + (remoteAddress == null ? "" : remoteAddress));
        if (store.countByReporterSince(reporter, dayAgo) >= config.maxPerDevicePerDay()
                || store.countByIpSince(ip, dayAgo) >= config.maxPerIpPerDay()) {
            throw new ApiException(ApiException.Code.RATE_LIMITED, "You've reached today's report limit. Thank you for helping.");
        }
        for (CommunityReport mine : store.findByReporterSince(reporter, dayAgo)) {
            if (mine.category() == category && Geo.distanceMeters(mine.location(), point) <= config.clusterRadiusMeters()) {
                throw new ApiException(ApiException.Code.RATE_LIMITED, "You already reported this spot today.");
            }
        }
        long id = store.insert(new CommunityReport(0, category, point, note, reporter, ip, now));
        return spots(store.findInBox(BBox.around(List.of(point)).expand(config.clusterRadiusMeters() * 2.0), since()))
                .stream()
                .filter(spot -> spot.category().equals(category.id())
                        && Geo.distanceMeters(new LatLng(spot.lat(), spot.lng()), point) <= config.clusterRadiusMeters())
                .findFirst()
                .orElse(new Spot(id, category.id(), category.label, point.lat(), point.lng(), 1, 1,
                        config.confirmThreshold() <= 1, now.toString(), note == null ? List.of() : List.of(note)));
    }

    public SpotsResponse spotsIn(BBox box) {
        return new SpotsResponse(spots(store.findInBox(box, since())), config.confirmThreshold(), config.expiryDays(), NOTE);
    }

    /** Confirmed spots city-wide, for routing. */
    public List<Spot> confirmedSpots() {
        return spots(store.findSince(since())).stream().filter(Spot::confirmed).toList();
    }

    private Instant since() {
        return clock.instant().minus(Duration.ofDays(config.expiryDays()));
    }

    /** Groups reports of the same category within the cluster radius (newest first). */
    List<Spot> spots(List<CommunityReport> reports) {
        record Group(ReportCategory category, List<CommunityReport> members) {
            LatLng center() {
                double lat = members.stream().mapToDouble(r -> r.location().lat()).average().orElse(0);
                double lng = members.stream().mapToDouble(r -> r.location().lng()).average().orElse(0);
                return new LatLng(lat, lng);
            }
        }
        List<CommunityReport> sorted = new ArrayList<>(reports);
        sorted.sort(Comparator.comparing(CommunityReport::createdAt).reversed());
        List<Group> groups = new ArrayList<>();
        for (CommunityReport r : sorted) {
            Group target = null;
            for (Group g : groups) {
                if (g.category() == r.category() && Geo.distanceMeters(g.center(), r.location()) <= config.clusterRadiusMeters()) {
                    target = g;
                    break;
                }
            }
            if (target == null) groups.add(new Group(r.category(), new ArrayList<>(List.of(r))));
            else target.members().add(r);
        }
        List<Spot> out = new ArrayList<>();
        for (Group g : groups) {
            Set<String> reporters = new HashSet<>();
            g.members().forEach(r -> reporters.add(r.reporterKey()));
            LatLng c = g.center();
            List<String> notes = g.members().stream().map(CommunityReport::note).filter(n -> n != null && !n.isBlank()).distinct().limit(3).toList();
            long id = g.members().stream().mapToLong(CommunityReport::id).min().orElse(0);
            out.add(new Spot(id, g.category().id(), g.category().label, round(c.lat()), round(c.lng()),
                    g.members().size(), reporters.size(), reporters.size() >= config.confirmThreshold(),
                    g.members().get(0).createdAt().toString(), notes));
        }
        return out;
    }

    private String hash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] out = digest.digest((store.secret("report-salt") + "|" + value).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(out);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static double round(double v) {
        return Math.round(v * 1e6) / 1e6;
    }
}
