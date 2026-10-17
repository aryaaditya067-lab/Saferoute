package com.saferoute.community;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.saferoute.common.ApiException;
import com.saferoute.geo.BBox;
import com.saferoute.support.InMemoryCommunityStore;
import com.saferoute.support.TestProps;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class CommunityServiceTest {

    static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-09T10:00:00Z"), ZoneOffset.UTC);
    static final BBox CITY = new BBox(12.73, 77.37, 13.23, 77.88);

    static CommunityService service(InMemoryCommunityStore store) {
        return new CommunityService(store, TestProps.properties("key"), CLOCK);
    }

    static CommunityService.Submission report(String category, double lat, String device) {
        return new CommunityService.Submission(category, lat, 77.5946, "  note\u0007 here ", device);
    }

    @Test
    void spotIsConfirmedOnlyAfterThreeDifferentPeople() {
        InMemoryCommunityStore store = new InMemoryCommunityStore();
        CommunityService service = service(store);
        CommunityService.Spot first = service.submit(report("harassment", 12.9716, "device-0001"), "1.1.1.1");
        assertEquals(1, first.reporters());
        assertFalse(first.confirmed());
        assertEquals("note here", first.notes().get(0));
        service.submit(report("harassment", 12.9718, "device-0002"), "1.1.1.2");
        CommunityService.Spot third = service.submit(report("harassment", 12.9714, "device-0003"), "1.1.1.3");
        assertEquals(3, third.reporters());
        assertTrue(third.confirmed());
        // A different category in the same place is a separate spot.
        service.submit(report("poor_road", 12.9716, "device-0004"), "1.1.1.4");
        assertEquals(2, service.spotsIn(CITY).spots().size());
        assertEquals(1, service.confirmedSpots().size());
    }

    @Test
    void abuseLimitsAndValidation() {
        InMemoryCommunityStore store = new InMemoryCommunityStore();
        CommunityService service = service(store);
        service.submit(report("dark_spot", 12.9716, "device-0001"), "2.2.2.2");
        ApiException again = assertThrows(ApiException.class, () -> service.submit(report("dark_spot", 12.9717, "device-0001"), "2.2.2.2"));
        assertEquals("You already reported this spot today.", again.getMessage());
        for (int i = 1; i < 5; i++) service.submit(report("dark_spot", 12.90 + i * 0.01, "device-0001"), "2.2.2.2");
        ApiException limit = assertThrows(ApiException.class, () -> service.submit(report("dark_spot", 13.1, "device-0001"), "2.2.2.2"));
        assertEquals(ApiException.Code.RATE_LIMITED, limit.code());

        assertThrows(IllegalArgumentException.class, () -> service.submit(report("aliens", 12.97, "device-0009"), "3.3.3.3"));
        assertThrows(IllegalArgumentException.class, () -> service.submit(report("dark_spot", 28.61, "device-0009"), "3.3.3.3"));
        assertThrows(IllegalArgumentException.class, () -> service.submit(report("dark_spot", 12.97, "x"), "3.3.3.3"));
        assertThrows(IllegalArgumentException.class, () -> service.submit(
                new CommunityService.Submission("dark_spot", 12.97, 77.59, "x".repeat(201), "device-0009"), "3.3.3.3"));
    }

    @Test
    void distanceWeightFallsOffWithDistance() {
        assertEquals(1.0, com.saferoute.route.SafetyScorerAccess.distanceWeight(50, 300), 1e-9);
        assertEquals(0.25, com.saferoute.route.SafetyScorerAccess.distanceWeight(300, 300), 1e-9);
        assertEquals(0.0, com.saferoute.route.SafetyScorerAccess.distanceWeight(301, 300), 1e-9);
        double mid = com.saferoute.route.SafetyScorerAccess.distanceWeight(200, 300);
        assertTrue(mid > 0.25 && mid < 1);
    }
}
