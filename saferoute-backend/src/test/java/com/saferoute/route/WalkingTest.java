package com.saferoute.route;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.saferoute.config.SafeRouteProperties;
import com.saferoute.geo.Geo;
import com.saferoute.geo.LatLng;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;

class WalkingTest {

    // 2026-10-05 is a Monday.
    static final LocalDateTime MON_22_30 = LocalDateTime.of(2026, 10, 5, 22, 30);
    static final LocalDateTime TUE_00_30 = LocalDateTime.of(2026, 10, 6, 0, 30);
    static final LocalDateTime SUN_12_00 = LocalDateTime.of(2026, 10, 11, 12, 0);

    @Test
    void readsCommonOpeningHours() {
        OpeningHours h = OpeningHours.parse("Mo-Sa 05:00-23:00; Su 07:00-23:00");
        assertNotNull(h);
        assertTrue(h.isOpen(MON_22_30));
        assertFalse(h.isOpen(TUE_00_30));
        assertEquals("05:00–23:00", h.describe(MON_22_30.toLocalDate()));
        assertEquals("07:00–23:00", h.describe(SUN_12_00.toLocalDate()));

        OpeningHours late = OpeningHours.parse("18:00-02:00");
        assertTrue(late.isOpen(TUE_00_30));
        assertTrue(OpeningHours.parse("24/7").isOpen(TUE_00_30));
        assertEquals("Open 24 hours", OpeningHours.parse("24/7").describe(SUN_12_00.toLocalDate()));

        OpeningHours offSunday = OpeningHours.parse("Mo-Su 09:00-21:00; Su off; PH off");
        assertFalse(offSunday.isOpen(SUN_12_00));
        assertEquals("Closed today", offSunday.describe(SUN_12_00.toLocalDate()));

        OpeningHours split = OpeningHours.parse("Mo-Fr 08:00-12:00,16:00-22:00");
        assertFalse(split.isOpen(LocalDateTime.of(2026, 10, 5, 14, 0)));
        assertTrue(split.isOpen(LocalDateTime.of(2026, 10, 5, 21, 0)));

        // Syntax we don't read is "unknown", never a guess.
        assertNull(OpeningHours.parse("sunrise-sunset"));
        assertNull(OpeningHours.parse("Jan-Mar 09:00-17:00"));
        assertNull(OpeningHours.parse("10:00+"));
        assertNull(OpeningHours.parse(""));
    }

    @Test
    void parsesMetroStationsFromOverpass() {
        String body = "{\"elements\":["
                + node(1, 12.9716, 77.6070, "\"railway\":\"station\",\"station\":\"subway\",\"name\":\"MG Road\",\"opening_hours\":\"Mo-Su 05:00-23:00\",\"network\":\"Namma Metro\"")
                + "," + node(2, 12.9717, 77.6071, "\"public_transport\":\"station\",\"subway\":\"yes\",\"name\":\"MG Road\"")
                + "," + node(3, 12.9784, 77.6408, "\"railway\":\"station\",\"station\":\"subway\",\"name\":\"Indiranagar\"")
                + "," + node(4, 12.9700, 77.6000, "\"railway\":\"station\",\"name\":\"Bengaluru Cantonment\"")
                + "," + node(5, 12.9720, 77.6080, "\"shop\":\"bakery\",\"opening_hours\":\"Mo-Su 07:00-22:00\"")
                + "]}";
        OsmContext ctx = OverpassClient.parse(body);
        assertEquals(2, ctx.stations().size(), "duplicate MG Road merged, mainline station ignored");
        assertEquals("Mo-Su 05:00-23:00", ctx.stations().get(0).openingHours());
        assertEquals(1, ctx.activity().size());
        assertEquals("Mo-Su 07:00-22:00", ctx.activity().get(0).openingHours());
        assertTrue(OverpassClient.query(List.of(RouteScenario.ROUTE_A), new com.saferoute.geo.BBox(12.9, 77.5, 13.0, 77.7)).contains("station"));
    }

    @Test
    void transitInfoNearStartAndEnd() {
        LatLng start = new LatLng(12.9716, 77.6050);
        List<OsmContext.Station> stations = List.of(
                new OsmContext.Station(1, "MG Road", new LatLng(12.9716, 77.6070), "Mo-Su 05:00-23:00", "Namma Metro"),
                new OsmContext.Station(2, "Far Away", new LatLng(13.05, 77.70), null, ""));
        var cfg = new SafeRouteProperties.Transit("Asia/Kolkata", "", "", 1200);
        RouteDtos.Transit t = WalkInfo.transit(start, new LatLng(12.99, 77.66), stations, MON_22_30, cfg);
        assertNotNull(t.nearStart());
        assertEquals("MG Road", t.nearStart().name());
        assertTrue(t.nearStart().distanceMeters() > 150 && t.nearStart().distanceMeters() < 300);
        assertEquals(Boolean.TRUE, t.nearStart().openNow());
        assertEquals("05:00–23:00", t.nearStart().hoursToday());
        assertEquals("OpenStreetMap", t.nearStart().hoursSource());
        assertTrue(t.nearEnd() == null, "nothing within 1.2 km of the destination");
        assertEquals(2, t.stations().size());
        RouteDtos.Station unknown = t.stations().get(1);
        assertNull(unknown.openNow());
        assertNull(unknown.hoursSource());

        // Operator hours are used only for stations without OSM hours, and only with a named source.
        var withSource = new SafeRouteProperties.Transit("Asia/Kolkata", "Mo-Su 05:00-23:00", "BMRCL website", 1200);
        RouteDtos.Station filled = WalkInfo.transit(start, start, stations, TUE_00_30, withSource).stations().get(1);
        assertEquals(Boolean.FALSE, filled.openNow());
        assertEquals("BMRCL website", filled.hoursSource());
        var noSource = new SafeRouteProperties.Transit("Asia/Kolkata", "Mo-Su 05:00-23:00", "", 1200);
        assertNull(WalkInfo.transit(start, start, stations, TUE_00_30, noSource).stations().get(1).openNow());

        RouteDtos.Transit missing = WalkInfo.transit(start, start, null, MON_22_30, cfg);
        assertFalse(missing.dataAvailable());
    }

    @Test
    void countsPlacesOpenNowAlongTheRoute() {
        List<LatLng> route = RouteScenario.ROUTE_A;
        LatLng near = Geo.offset(route.get(route.size() / 2), 0, 40);
        LatLng far = Geo.offset(route.get(route.size() / 2), 0, 400);
        List<OsmContext.Poi> places = List.of(
                new OsmContext.Poi(1, "late cafe", near, "Mo-Su 08:00-23:30"),
                new OsmContext.Poi(2, "bank", near, "Mo-Fr 10:00-16:00"),
                new OsmContext.Poi(3, "no hours", near, null),
                new OsmContext.Poi(4, "weird", near, "sunrise-sunset"),
                new OsmContext.Poi(5, "too far", far, "24/7"));
        RouteSafety.OpenNow o = WalkInfo.openNow(route, places, MON_22_30);
        assertTrue(o.available());
        assertEquals(2, o.withHours());
        assertEquals(1, o.openNow());
        assertEquals("22:30", o.checkedAt());
    }

    @Test
    void walkingResponseCarriesTransitAndOpenNow() {
        var http = RouteScenario.http(true);
        var store = RouteSafetyServiceTest.storeWithIncident();
        var service = RouteSafetyServiceTest.service(http, store);
        var res = service.plan(new RouteDtos.RouteRequest(
                new RouteDtos.Coordinates(RouteScenario.PICKUP.lat(), RouteScenario.PICKUP.lng()),
                new RouteDtos.Coordinates(RouteScenario.DESTINATION.lat(), RouteScenario.DESTINATION.lng()), "walking", true));
        assertNotNull(res.transit());
        assertTrue(res.transit().dataAvailable());
        assertTrue(res.routes().get(0).safety().openNow().available());
        var driving = service.plan(new RouteDtos.RouteRequest(
                new RouteDtos.Coordinates(RouteScenario.PICKUP.lat(), RouteScenario.PICKUP.lng()),
                new RouteDtos.Coordinates(RouteScenario.DESTINATION.lat(), RouteScenario.DESTINATION.lng()), "driving", true));
        assertNull(driving.transit());
    }

    @Test
    void refusesWalksThatAreTooLong() {
        var service = RouteSafetyServiceTest.service(RouteScenario.http(true), RouteSafetyServiceTest.storeWithIncident());
        var far = new RouteDtos.Coordinates(13.20, 77.75); // ~30 km from the pickup
        IllegalArgumentException e = org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> service.plan(new RouteDtos.RouteRequest(
                        new RouteDtos.Coordinates(RouteScenario.PICKUP.lat(), RouteScenario.PICKUP.lng()), far, "walking", true)));
        assertTrue(e.getMessage().contains("too far to walk"), e.getMessage());
    }

    private static String node(long id, double lat, double lng, String tags) {
        return String.format(Locale.ROOT, "{\"type\":\"node\",\"id\":%d,\"lat\":%.6f,\"lon\":%.6f,\"tags\":{%s}}", id, lat, lng, tags);
    }
}
