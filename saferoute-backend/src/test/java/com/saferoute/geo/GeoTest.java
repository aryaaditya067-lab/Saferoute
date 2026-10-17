package com.saferoute.geo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class GeoTest {

    @Test
    void distanceBetweenKnownPoints() {
        // One degree of latitude is ~111.2 km.
        assertEquals(111_195, Geo.distanceMeters(new LatLng(12, 77), new LatLng(13, 77)), 50);
    }

    @Test
    void distanceToSegmentIsPerpendicularDistance() {
        LatLng a = new LatLng(12.97, 77.59), b = new LatLng(12.97, 77.61);
        LatLng p = Geo.offset(new LatLng(12.97, 77.60), 0, 100);
        assertEquals(100, Geo.distanceToSegmentMeters(p, a, b), 1.5);
        // Beyond the segment end, distance is to the endpoint.
        LatLng q = Geo.offset(b, 90, 200);
        assertEquals(200, Geo.distanceToSegmentMeters(q, a, b), 2);
    }

    @Test
    void resampleKeepsEndsAndSpacing() {
        LatLng a = new LatLng(12.97, 77.59);
        LatLng b = Geo.offset(a, 90, 1000);
        List<LatLng> samples = Geo.resample(List.of(a, b), 100);
        assertEquals(11, samples.size());
        assertEquals(a, samples.get(0));
        assertEquals(b, samples.get(samples.size() - 1));
        assertEquals(100, Geo.distanceMeters(samples.get(1), samples.get(2)), 1);
    }

    @Test
    void resampleAcrossVertices() {
        LatLng a = new LatLng(12.97, 77.59);
        LatLng b = Geo.offset(a, 90, 130);
        LatLng c = Geo.offset(b, 0, 130);
        List<LatLng> samples = Geo.resample(List.of(a, b, c), 50);
        // 260 m long -> points at 0,50,...,250 plus the end point
        assertEquals(7, samples.size());
    }

    @Test
    void bboxExpandAndContains() {
        BBox box = new BBox(12.9, 77.5, 13.0, 77.6);
        assertTrue(box.contains(new LatLng(12.95, 77.55)));
        assertTrue(box.expand(1000).contains(Geo.offset(new LatLng(13.0, 77.55), 0, 900)));
    }

    @Test
    void invalidCoordinatesRejected() {
        assertThrows(IllegalArgumentException.class, () -> new LatLng(91, 0));
        assertThrows(IllegalArgumentException.class, () -> new LatLng(Double.NaN, 0));
    }
}
