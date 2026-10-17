package com.saferoute.geo;

import java.util.Collection;

public record BBox(double south, double west, double north, double east) {

    public BBox {
        if (!(south <= north) || !(west <= east)) {
            throw new IllegalArgumentException("Invalid bounding box.");
        }
    }

    public static BBox around(Collection<LatLng> points) {
        double s = 90, w = 180, n = -90, e = -180;
        for (LatLng p : points) {
            s = Math.min(s, p.lat());
            n = Math.max(n, p.lat());
            w = Math.min(w, p.lng());
            e = Math.max(e, p.lng());
        }
        return new BBox(s, w, n, e);
    }

    public boolean contains(LatLng p) {
        return p.lat() >= south && p.lat() <= north && p.lng() >= west && p.lng() <= east;
    }

    public boolean containsAll(Collection<LatLng> points) {
        return points.stream().allMatch(this::contains);
    }

    /** Grows the box by roughly {@code meters} on every side. */
    public BBox expand(double meters) {
        double dLat = meters / 111_320d;
        double midLat = Math.toRadians((south + north) / 2);
        double dLng = meters / (111_320d * Math.max(0.01, Math.cos(midLat)));
        return new BBox(
                Math.max(-90, south - dLat), Math.max(-180, west - dLng),
                Math.min(90, north + dLat), Math.min(180, east + dLng));
    }

    public double areaSquareKm() {
        double midLat = Math.toRadians((south + north) / 2);
        double heightKm = (north - south) * 111.32;
        double widthKm = (east - west) * 111.32 * Math.cos(midLat);
        return heightKm * widthKm;
    }
}
