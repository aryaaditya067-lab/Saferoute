package com.saferoute.route;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.saferoute.geo.Geo;
import com.saferoute.geo.LatLng;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class MainRoadGraphTest {

    @Test
    void prefersTheBrighterMainRoad() {
        // Two main roads from A to C: west (lit) and east (dark), both 4 km; they meet at A and C.
        LatLng a = new LatLng(12.900, 77.500), c = new LatLng(12.936, 77.500);
        LatLng west = new LatLng(12.918, 77.490), east = new LatLng(12.918, 77.510);
        List<List<LatLng>> roads = List.of(List.of(a, west, c), List.of(a, east, c));
        List<String> csv = new ArrayList<>(List.of("lat,lng,radiance"));
        double step = 1 / NightLightGrid.CELLS_PER_DEGREE;
        for (double lat = 12.89 + step / 2; lat < 12.95; lat += step)
            for (double lng = 77.48 + step / 2; lng < 77.52; lng += step)
                csv.add(String.format(java.util.Locale.ROOT, "%.6f,%.6f,%.1f", lat, lng, lng < 77.5 ? 60.0 : 0.3));
        NightLightGrid lights = NightLightService.parse(csv);
        MainRoadGraph g = new MainRoadGraph(roads);
        assertEquals(4, g.size());
        List<LatLng> path = g.path(Geo.offset(a, 180, 300), Geo.offset(c, 0, 300), lights, 1000);
        assertEquals(List.of(a, west, c), path);
        // Without night-light data both are equal; a path is still found.
        assertTrue(g.path(a, c, null, 1000).size() == 3);
        // Too far from any main road.
        assertNull(g.path(new LatLng(13.2, 77.9), c, lights, 1000));
    }
}
