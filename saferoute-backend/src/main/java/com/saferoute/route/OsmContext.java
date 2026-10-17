package com.saferoute.route;

import com.saferoute.geo.BBox;
import com.saferoute.geo.LatLng;
import java.util.List;

/** OpenStreetMap features along a set of candidate routes. */
public record OsmContext(List<Road> roads, List<Poi> police, List<Poi> hospitals, List<Poi> activity, List<Station> stations) {

    public OsmContext(List<Road> roads, List<Poi> police, List<Poi> hospitals, List<Poi> activity) {
        this(roads, police, hospitals, activity, List.of());
    }

    /**
     * A road near the routes. {@code lit} is null when OpenStreetMap has no lit tag.
     * {@code major} = trunk / primary / secondary / tertiary (and their links).
     */
    public record Road(List<LatLng> geometry, String highway, boolean major, Boolean lit, BBox bounds) {}

    /** {@code openingHours}: the raw OSM opening_hours value, or null when not mapped. */
    public record Poi(long osmId, String name, LatLng location, String openingHours) {
        public Poi(long osmId, String name, LatLng location) {
            this(osmId, name, location, null);
        }
    }

    /** A metro / light-rail station from OpenStreetMap. */
    public record Station(long osmId, String name, LatLng location, String openingHours, String network) {}
}
