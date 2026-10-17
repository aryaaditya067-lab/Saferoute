package com.saferoute.route;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.saferoute.geo.BBox;
import com.saferoute.geo.Geo;
import com.saferoute.geo.LatLng;
import com.saferoute.support.TestProps;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class NightLightTest {

    /** Cells within 300 m of route A are dark; the rest of the area has varied brightness, route B bright. */
    static List<String> csv() {
        List<String> lines = new ArrayList<>();
        lines.add("# source=NASA Black Marble VNP46A4 year=2025 unit=nW/cm2/sr");
        lines.add("lat,lng,radiance");
        BBox box = BBox.around(RouteScenario.ROUTE_B).expand(1500);
        double step = 1 / NightLightGrid.CELLS_PER_DEGREE;
        int i = 0;
        for (double lat = box.south(); lat <= box.north(); lat += step) {
            for (double lng = box.west(); lng <= box.east(); lng += step) {
                LatLng c = new LatLng(lat + step / 2, lng + step / 2);
                double v;
                if (Geo.distanceToPolylineMeters(c, RouteScenario.ROUTE_A) <= 450) v = 0.5;
                else if (Geo.distanceToPolylineMeters(c, RouteScenario.ROUTE_B) <= 450) v = 80;
                else v = 1 + (i++ % 60);
                lines.add(String.format(java.util.Locale.ROOT, "%.6f,%.6f,%.2f", c.lat(), c.lng(), v));
            }
        }
        lines.add("bad,line");
        lines.add("12.9,77.6,-5");
        return lines;
    }

    @Test
    void parsesCsvAndMeasuresDarkShare() {
        NightLightGrid grid = NightLightService.parse(csv());
        assertTrue(grid.size() > 100);
        assertTrue(grid.source().contains("VNP46A4"));
        RouteSafety.NightLight a = grid.measure(Geo.resample(RouteScenario.ROUTE_A, 25));
        RouteSafety.NightLight b = grid.measure(Geo.resample(RouteScenario.ROUTE_B, 25));
        assertTrue(a.available() && a.coveredFraction() > 0.99);
        assertTrue(a.darkFraction() > 0.95, "A dark " + a.darkFraction());
        assertTrue(b.darkFraction() < 0.5, "B dark " + b.darkFraction());
        assertFalse(grid.measure(List.of(new LatLng(28.6, 77.2))).available());
    }

    @Test
    void darkRouteIsRankedLessSafe() {
        SafetyScorer scorer = new SafetyScorer(TestProps.safety());
        List<RouteCandidate> routes = List.of(
                new RouteCandidate(RouteScenario.ROUTE_A, 5000, 1200, "A"),
                new RouteCandidate(RouteScenario.ROUTE_B, 6000, 1400, "B"));
        var outcome = scorer.score(routes, null, null, null, NightLightService.parse(csv()), LocalDate.of(2026, 10, 5));
        assertEquals(List.of(SafetyScorer.Factor.NIGHT_LIGHT), outcome.factorsUsed());
        assertTrue(outcome.routes().get(1).labels().contains(SafetyScorer.Label.SAFEST));
        assertEquals("nightLight", RouteSafetyService.factorId(SafetyScorer.Factor.NIGHT_LIGHT));

        // No file → factor left out, nothing invented.
        var none = scorer.score(routes, null, null, null, null, LocalDate.of(2026, 10, 5));
        assertTrue(none.factorsUsed().isEmpty());
        assertFalse(none.routes().get(0).safety().nightLight().available());
    }

    @Test
    void serviceReloadsWhenFileAppears() throws Exception {
        Path dir = Files.createTempDirectory("nl");
        Path file = dir.resolve("nightlights.csv");
        var base = TestProps.properties("key");
        var props = new com.saferoute.config.SafeRouteProperties(base.cors(), base.city(), base.providers(), base.mimo(),
                base.ingest(), base.safety(), base.community(), base.backfill(),
                new com.saferoute.config.SafeRouteProperties.NightLights(file.toString()), base.transit(), base.admin());
        NightLightService service = new NightLightService(props);
        assertNull(service.grid());
        Files.write(file, csv());
        assertTrue(service.grid() != null && service.grid().size() > 100);
    }

    @Test
    void rasterIsNorthUp() {
        NightLightGrid grid = NightLightService.parse(List.of(
                "lat,lng,radiance",
                "13.002083,77.502083,5.0",   // north-west
                "12.997917,77.506250,9.0")); // south-east
        NightLightGrid.Raster r = grid.raster();
        assertEquals(2, r.rows());
        assertEquals(2, r.cols());
        assertEquals(5.0, r.values()[0]);
        assertEquals(9.0, r.values()[3]);
        assertTrue(Double.isNaN(r.values()[1]));
        assertTrue(r.north() > 13.002 && r.south() < 12.998);
        var response = new NightLightController(new NightLightService(TestProps.properties("k") ) {
            @Override public synchronized NightLightGrid grid() { return grid; }
        }).get();
        assertTrue(response.available());
        assertNull(response.values().get(1));
    }

    @Test
    void findsTheBrightestCellNearby() {
        NightLightGrid grid = NightLightService.parse(List.of(
                "lat,lng,radiance",
                "12.950000,77.600000,2.0",
                "12.952083,77.602083,40.0",   // bright, ~330 m away
                "12.990000,77.640000,90.0")); // brighter but far outside the radius
        LatLng best = grid.brightestNear(new LatLng(12.95, 77.60), 1000);
        assertTrue(best != null && Math.abs(best.lat() - 12.952083) < 0.003 && Math.abs(best.lng() - 77.602083) < 0.003, "best " + best);
        assertNull(grid.brightestNear(new LatLng(13.2, 77.2), 500));
    }

    @Test
    void walkingWeighsDarknessMore() {
        var base = TestProps.safety();
        var walk = RouteSafetyService.forMode(base, TravelMode.WALKING);
        assertTrue(walk.weights().nightLight() > base.weights().nightLight() * 2);
        assertTrue(walk.weights().darkness() > base.weights().darkness());
        assertEquals(base.weights().crime(), walk.weights().crime());
        assertEquals(base, RouteSafetyService.forMode(base, TravelMode.DRIVING));
    }

    @Test
    void asksForRoutesThroughBrightAreas() throws Exception {
        Path dir = Files.createTempDirectory("nl2");
        Path file = dir.resolve("nightlights.csv");
        Files.write(file, csv());
        var base = TestProps.properties("key");
        var props = new com.saferoute.config.SafeRouteProperties(base.cors(), base.city(), base.providers(), base.mimo(),
                base.ingest(), base.safety(), base.community(), base.backfill(),
                new com.saferoute.config.SafeRouteProperties.NightLights(file.toString()), base.transit(), base.admin());
        var http = RouteScenario.http(true);
        var clock = java.time.Clock.fixed(java.time.Instant.parse("2026-10-05T10:00:00Z"), java.time.ZoneOffset.UTC);
        var service = new RouteSafetyService(new OsrmClient(http, props), new OverpassClient(http, props),
                new com.saferoute.support.InMemoryIncidentStore(),
                new com.saferoute.community.CommunityService(new com.saferoute.support.InMemoryCommunityStore(), props, clock),
                new NightLightService(props), props, clock);
        var res = service.plan(new RouteDtos.RouteRequest(
                new RouteDtos.Coordinates(RouteScenario.PICKUP.lat(), RouteScenario.PICKUP.lng()),
                new RouteDtos.Coordinates(RouteScenario.DESTINATION.lat(), RouteScenario.DESTINATION.lng()), "walking", true));
        long viaCalls = http.calls.stream().filter(u -> u.contains("https://router.test") && u.substring(0, u.indexOf('?')).split(";").length >= 3).count();
        assertTrue(viaCalls >= 2, "bright via routes requested: " + viaCalls);
        assertTrue(res.safety().factorsUsed().contains("nightLight"));
        assertTrue(res.safety().weights().get("nightLight") > 0.2, "walking weight " + res.safety().weights());
    }

    @Test
    void brightestPathFollowsTheLitCorridor() {
        // Dark square 12.90..12.98 x 77.50..77.58, with a lit "L" road: west edge going north, then east along the top.
        List<String> lines = new java.util.ArrayList<>(List.of("lat,lng,radiance"));
        double step = 1 / NightLightGrid.CELLS_PER_DEGREE;
        for (double lat = 12.90 + step / 2; lat < 12.98; lat += step) {
            for (double lng = 77.50 + step / 2; lng < 77.58; lng += step) {
                boolean lit = lng < 77.505 || lat > 12.975;
                lines.add(String.format(java.util.Locale.ROOT, "%.6f,%.6f,%.1f", lat, lng, lit ? 60.0 : 0.5));
            }
        }
        NightLightGrid grid = NightLightService.parse(lines);
        LatLng from = new LatLng(12.902, 77.502), to = new LatLng(12.978, 77.578);
        List<LatLng> path = grid.brightestPath(from, to, 500);
        assertTrue(path != null && path.size() > 10);
        // The middle of the path is on the lit edges, not on the dark diagonal.
        LatLng mid = RouteSafetyService.along(path, 0.5);
        assertTrue(mid.lng() < 77.507 || mid.lat() > 12.973, "mid " + mid);
        long dark = path.stream().filter(p -> !(p.lng() < 77.506 || p.lat() > 12.974)).count();
        assertTrue(dark <= 2, "dark cells on path: " + dark);
    }

    @Test
    void spursAreCutOutOfViaRoutes() {
        LatLng a = new LatLng(12.95, 77.60);
        LatLng b = com.saferoute.geo.Geo.offset(a, 0, 2000);
        LatLng spur = com.saferoute.geo.Geo.offset(b, 90, 600);
        LatLng c = com.saferoute.geo.Geo.offset(b, 0, 2000);
        RouteCandidate withSpur = new RouteCandidate(RouteScenario.densify(List.of(a, b, spur, b, c)), 5200, 3900, "x");
        RouteCandidate cleaned = RouteSafetyService.removeLoops(withSpur);
        assertTrue(cleaned.distanceMeters() < 4300 && cleaned.distanceMeters() > 3700, "distance " + cleaned.distanceMeters());
        assertFalse(RouteSafetyService.backtracks(cleaned.geometry()));
        RouteCandidate straight = new RouteCandidate(RouteScenario.densify(List.of(a, c)), 4000, 3000, "y");
        assertEquals(straight, RouteSafetyService.removeLoops(straight));
    }
}
