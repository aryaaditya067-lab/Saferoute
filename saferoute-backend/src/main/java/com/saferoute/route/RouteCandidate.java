package com.saferoute.route;

import com.saferoute.geo.LatLng;
import java.util.List;

/** A route returned by the routing provider, before safety analysis. */
public record RouteCandidate(List<LatLng> geometry, double distanceMeters, double durationSeconds, String summary) {}
