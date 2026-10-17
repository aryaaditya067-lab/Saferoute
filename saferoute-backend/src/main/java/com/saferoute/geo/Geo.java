package com.saferoute.geo;

import java.util.ArrayList;
import java.util.List;

/** Small geometry helpers on WGS84 coordinates (accurate enough at city scale). */
public final class Geo {

    private static final double EARTH_RADIUS_M = 6_371_000d;

    private Geo() {}

    public static double distanceMeters(LatLng a, LatLng b) {
        double dLat = Math.toRadians(b.lat() - a.lat());
        double dLng = Math.toRadians(b.lng() - a.lng());
        double h = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(a.lat())) * Math.cos(Math.toRadians(b.lat())) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    /** Shortest distance from {@code p} to segment a–b, in metres (local flat projection). */
    public static double distanceToSegmentMeters(LatLng p, LatLng a, LatLng b) {
        double cosLat = Math.cos(Math.toRadians(p.lat()));
        double ax = (a.lng() - p.lng()) * cosLat, ay = a.lat() - p.lat();
        double bx = (b.lng() - p.lng()) * cosLat, by = b.lat() - p.lat();
        double dx = bx - ax, dy = by - ay;
        double lengthSq = dx * dx + dy * dy;
        double t = lengthSq == 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
        double cx = ax + t * dx, cy = ay + t * dy;
        return Math.sqrt(cx * cx + cy * cy) * (Math.PI / 180) * EARTH_RADIUS_M;
    }

    public static double distanceToPolylineMeters(LatLng p, List<LatLng> line) {
        if (line.isEmpty()) return Double.POSITIVE_INFINITY;
        if (line.size() == 1) return distanceMeters(p, line.get(0));
        double best = Double.POSITIVE_INFINITY;
        for (int i = 1; i < line.size(); i++) {
            best = Math.min(best, distanceToSegmentMeters(p, line.get(i - 1), line.get(i)));
        }
        return best;
    }

    public static double lengthMeters(List<LatLng> line) {
        double total = 0;
        for (int i = 1; i < line.size(); i++) total += distanceMeters(line.get(i - 1), line.get(i));
        return total;
    }

    /** Points every {@code stepMeters} along the line, including both ends. */
    public static List<LatLng> resample(List<LatLng> line, double stepMeters) {
        List<LatLng> out = new ArrayList<>();
        if (line.isEmpty()) return out;
        out.add(line.get(0));
        double carry = 0;
        for (int i = 1; i < line.size(); i++) {
            LatLng a = line.get(i - 1), b = line.get(i);
            double seg = distanceMeters(a, b);
            double pos = stepMeters - carry;
            while (pos <= seg) {
                double t = pos / seg;
                out.add(new LatLng(a.lat() + (b.lat() - a.lat()) * t, a.lng() + (b.lng() - a.lng()) * t));
                pos += stepMeters;
            }
            carry = seg - (pos - stepMeters);
        }
        LatLng last = line.get(line.size() - 1);
        if (!out.get(out.size() - 1).equals(last)) out.add(last);
        return out;
    }

    /** Point {@code meters} away from {@code origin} along {@code bearingDegrees}. */
    public static LatLng offset(LatLng origin, double bearingDegrees, double meters) {
        double bearing = Math.toRadians(bearingDegrees);
        double dLat = meters * Math.cos(bearing) / 111_320d;
        double dLng = meters * Math.sin(bearing) / (111_320d * Math.max(0.01, Math.cos(Math.toRadians(origin.lat()))));
        return new LatLng(origin.lat() + dLat, origin.lng() + dLng);
    }

    /** Initial bearing from a to b in degrees (0 = north, clockwise). */
    public static double bearing(LatLng a, LatLng b) {
        double phi1 = Math.toRadians(a.lat()), phi2 = Math.toRadians(b.lat());
        double dLambda = Math.toRadians(b.lng() - a.lng());
        double y = Math.sin(dLambda) * Math.cos(phi2);
        double x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
        return (Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
    }

    /** Index of the polyline vertex closest to {@code p}. */
    public static int nearestVertex(LatLng p, List<LatLng> line) {
        int best = 0;
        double bestDistance = Double.POSITIVE_INFINITY;
        for (int i = 0; i < line.size(); i++) {
            double d = distanceMeters(p, line.get(i));
            if (d < bestDistance) {
                bestDistance = d;
                best = i;
            }
        }
        return best;
    }
}
