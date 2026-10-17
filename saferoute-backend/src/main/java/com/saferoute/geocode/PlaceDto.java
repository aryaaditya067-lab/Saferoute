package com.saferoute.geocode;

/** Same shape as the frontend's Location type. */
public record PlaceDto(String id, String name, String address, double lat, double lng, String source) {}
