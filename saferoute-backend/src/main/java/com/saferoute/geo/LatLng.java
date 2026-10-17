package com.saferoute.geo;

public record LatLng(double lat, double lng) {

    public LatLng {
        if (!Double.isFinite(lat) || !Double.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new IllegalArgumentException("Invalid coordinates: " + lat + ", " + lng);
        }
    }
}
