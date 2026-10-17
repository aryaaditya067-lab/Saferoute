package com.saferoute.route;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.saferoute.common.ApiException;
import com.saferoute.common.Json;
import com.saferoute.geo.BBox;
import com.saferoute.incident.CrimeType;
import com.saferoute.incident.IncidentController;
import com.saferoute.incident.IncidentDtos;
import com.saferoute.incident.IncidentStore;
import com.saferoute.support.FakeHttp;
import com.saferoute.support.InMemoryIncidentStore;
import com.saferoute.support.TestProps;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class RouteSafetyServiceTest {

    static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-05T10:00:00Z"), ZoneOffset.UTC);

    static InMemoryIncidentStore storeWithIncident() {
        InMemoryIncidentStore store = new InMemoryIncidentStore();
        long run = store.startRun(CLOCK.instant());
        store.insert(new IncidentStore.NewIncident(CrimeType.ROBBERY, "Shopkeeper robbed at knifepoint", "Test Layout", "test layout",
                        "Test Layout, Bengaluru", RouteScenario.A_MIDDLE, 400, LocalDate.of(2026, 9, 28),
                        "Two men robbed a shopkeeper at knifepoint in Test Layout"),
                new com.saferoute.incident.Incident.Source("https://news.test/robbery", "Shopkeeper robbed", "News Test", LocalDate.of(2026, 9, 29)),
                CLOCK.instant());
        store.finishRun(run, CLOCK.instant(), true, new IncidentStore.RunStats(1, 1, 0, 0), null);
        return store;
    }

    static RouteDtos.RouteRequest request() {
        return new RouteDtos.RouteRequest(
                new RouteDtos.Coordinates(RouteScenario.PICKUP.lat(), RouteScenario.PICKUP.lng()),
                new RouteDtos.Coordinates(RouteScenario.DESTINATION.lat(), RouteScenario.DESTINATION.lng()),
                "driving", true);
    }

    static RouteSafetyService service(FakeHttp http, IncidentStore store) {
        return service(http, store, new com.saferoute.support.InMemoryCommunityStore());
    }

    static RouteSafetyService service(FakeHttp http, IncidentStore store, com.saferoute.community.CommunityStore communityStore) {
        var props = TestProps.properties("key");
        return new RouteSafetyService(new OsrmClient(http, props), new OverpassClient(http, props), store,
                new com.saferoute.community.CommunityService(communityStore, props, CLOCK), new NightLightService(props), props, CLOCK);
    }

    @Test
    void labelsFastestAndSafestFromMeasuredFactors() throws Exception {
        FakeHttp http = RouteScenario.http(true);
        InMemoryIncidentStore store = storeWithIncident();
        var communityStore = new com.saferoute.support.InMemoryCommunityStore();
        var props = TestProps.properties("key");
        var communityService = new com.saferoute.community.CommunityService(communityStore, props, CLOCK);
        var spotPoint = RouteScenario.ROUTE_A.get(RouteScenario.ROUTE_A.size() / 4);
        for (String device : List.of("device-aaaa1", "device-bbbb2", "device-cccc3")) {
            communityService.submit(new com.saferoute.community.CommunityService.Submission(
                    "dark_spot", spotPoint.lat(), spotPoint.lng(), "No street lights after the bus stop", device), "10.0.0." + device.length());
        }
        RouteDtos.RouteResponse response = service(http, store, communityStore).plan(request());

        // alternatives + two detours around the reported area
        assertEquals(3, http.calls.stream().filter(c -> c.contains("router.test")).count());
        assertEquals(3, response.routes().size());

        RouteDtos.RouteDto fastest = only(response, "fastest");
        RouteDtos.RouteDto safest = only(response, "safest");
        assertNotNull(only(response, "balanced"));
        assertEquals(1200, fastest.durationSeconds(), 0.01);
        assertEquals(1, fastest.safety().crime().incidentCount());
        assertEquals(1, fastest.safety().crime().violentCount());
        assertNotNull(fastest.safety().crime().nearestMeters());
        assertEquals(1, fastest.safety().community().spotCount());
        assertEquals(List.of("Poorly lit"), fastest.safety().community().categories());
        assertEquals(0, safest.safety().community().spotCount());
        assertTrue(fastest.safety().lighting().unlitFraction() > 0.3);
        assertEquals(0.0, fastest.safety().roads().mainRoadFraction(), 1e-9);
        assertTrue(fastest.safety().roads().minorRoadFraction() > 0.95);
        assertFalse(safest.labels().contains("fastest"));
        assertEquals(0, safest.safety().crime().incidentCount());
        assertTrue(safest.safety().riskIndex() < fastest.safety().riskIndex());

        assertTrue(response.safety().crimeDataAvailable());
        assertTrue(safest.safety().activity().placeCount() >= 5, "places " + safest.safety().activity().placeCount());
        // The detours run on roads missing from the OSM fixture, so lighting and road type can't be
        // compared fairly and are left out; the other factors are used.
        assertEquals(List.of("crime", "community", "activity", "police", "hospital"), response.safety().factorsUsed());

        // Contract fixtures for the frontend tests (only when asked for).
        String dir = System.getProperty("saferoute.fixtureDir");
        if (dir != null) {
            Files.createDirectories(Path.of(dir));
            Files.writeString(Path.of(dir, "routes.json"), Json.write(response));
            var incidents = store.findInBox(new BBox(12.73, 77.37, 13.23, 77.88), LocalDate.of(2026, 7, 7)).stream()
                    .map(IncidentDtos.IncidentDto::from).toList();
            Files.writeString(Path.of(dir, "community.json"), Json.write(communityService.spotsIn(new BBox(12.73, 77.37, 13.23, 77.88))));
            Files.writeString(Path.of(dir, "incidents.json"), Json.write(new IncidentDtos.IncidentsResponse(
                    incidents, true, 90, "2026-10-05T10:00:00Z", "Bengaluru", IncidentController.SOURCE_NOTE)));
        }
    }

    @Test
    void withoutCrimeDataItSaysSoAndSkipsDetours() {
        FakeHttp http = RouteScenario.http(true);
        RouteDtos.RouteResponse response = service(http, new InMemoryIncidentStore()).plan(request());
        // no crime detours; two side routes are requested so there are three routes to compare
        assertEquals(3, http.calls.stream().filter(c -> c.contains("router.test")).count());
        assertEquals(3, response.routes().size());
        assertFalse(response.safety().crimeDataAvailable());
        assertEquals("No crime reports have been collected yet.", response.safety().crimeDataNote());
        assertFalse(response.safety().factorsUsed().contains("crime"));
        response.routes().forEach(r -> assertFalse(r.safety().crime().available()));
        assertNotNull(only(response, "safest"));
    }

    @Test
    void withNoSafetyDataOnlyFastestIsLabelled() {
        FakeHttp http = RouteScenario.http(false);
        RouteDtos.RouteResponse response = service(http, new InMemoryIncidentStore()).plan(request());
        assertTrue(response.safety().factorsUsed().isEmpty());
        assertFalse(response.safety().osmDataAvailable());
        long labelled = response.routes().stream().filter(r -> !r.labels().isEmpty()).count();
        assertEquals(1, labelled);
        assertEquals(List.of("fastest"), response.routes().get(0).labels());
        response.routes().forEach(r -> assertNull(r.safety().riskIndex()));
    }

    @Test
    void rejectsSamePlaceAndBadMode() {
        FakeHttp http = RouteScenario.http(true);
        RouteSafetyService service = service(http, new InMemoryIncidentStore());
        var same = new RouteDtos.RouteRequest(request().pickup(), request().pickup(), "driving", true);
        assertThrows(IllegalArgumentException.class, () -> service.plan(same));
        var badMode = new RouteDtos.RouteRequest(request().pickup(), request().destination(), "flying", true);
        assertThrows(IllegalArgumentException.class, () -> service.plan(badMode));
    }

    @Test
    void osrmErrorsBecomeFriendlyMessages() {
        ApiException e = assertThrows(ApiException.class,
                () -> OsrmClient.parse("{\"code\":\"NoSegment\",\"message\":\"Could not find a matching segment\"}"));
        assertEquals(ApiException.Code.NO_ROUTE, e.code());
        assertTrue(e.getMessage().contains("isn't close enough to a road"));
    }

    @Test
    void lightingIsRankedWhenEveryRouteHasEnoughTags() {
        SafetyScorer scorer = new SafetyScorer(TestProps.safety());
        List<RouteCandidate> routes = List.of(
                new RouteCandidate(RouteScenario.ROUTE_A, 5000, 1200, "A"),
                new RouteCandidate(RouteScenario.ROUTE_B, 6000, 1400, "B"));
        SafetyScorer.Outcome outcome = scorer.score(routes, List.of(), OverpassClient.parse(RouteScenario.overpass()),
                LocalDate.of(2026, 10, 5));
        assertTrue(outcome.factorsUsed().contains(SafetyScorer.Factor.DARKNESS));
        assertTrue(outcome.factorsUsed().contains(SafetyScorer.Factor.MAIN_ROADS));
        assertTrue(outcome.routes().get(1).safety().roads().mainRoadFraction() > 0.95);
        assertTrue(outcome.routes().get(1).safety().activity().placesPerKm() > outcome.routes().get(0).safety().activity().placesPerKm());
        RouteSafety b = outcome.routes().get(1).safety();
        assertTrue(b.lighting().litFraction() > 0.95, "lit " + b.lighting().litFraction());
        assertTrue(outcome.routes().get(1).labels().contains(SafetyScorer.Label.SAFEST));
        assertTrue(outcome.routes().get(0).labels().contains(SafetyScorer.Label.FASTEST));
    }

    @Test
    void balancedIsASeparateRouteOnlyWhenItSitsInBetween() {
        java.util.function.BiFunction<Double, Double, RouteSafety> s = (risk, unused) -> new RouteSafety(
                RouteSafety.Crime.unavailable(), RouteSafety.Community.unavailable(), RouteSafety.Lighting.unavailable(), RouteSafety.Roads.unavailable(),
                RouteSafety.Activity.unavailable(), RouteSafety.Service.unavailable(), RouteSafety.Service.unavailable(), RouteSafety.NightLight.unavailable(), RouteSafety.OpenNow.unavailable(), risk);
        List<RouteCandidate> routes = List.of(
                new RouteCandidate(RouteScenario.ROUTE_A, 5000, 1000, "fast"),
                new RouteCandidate(RouteScenario.ROUTE_B, 6000, 1100, "middle"),
                new RouteCandidate(RouteScenario.ROUTE_B, 7000, 1300, "safe"));
        var labels = SafetyScorer.label(routes, List.of(s.apply(0.8, 0.0), s.apply(0.4, 0.0), s.apply(0.2, 0.0)));
        assertEquals(java.util.Set.of(SafetyScorer.Label.FASTEST), labels.get(0));
        assertEquals(java.util.Set.of(SafetyScorer.Label.BALANCED), labels.get(1));
        assertEquals(java.util.Set.of(SafetyScorer.Label.SAFEST), labels.get(2));

        // The middle route is slower than the safest one: it is not offered as "Balanced".
        List<RouteCandidate> dominated = List.of(routes.get(0),
                new RouteCandidate(RouteScenario.ROUTE_B, 6000, 1400, "slow"), routes.get(2));
        var labels2 = SafetyScorer.label(dominated, List.of(s.apply(0.8, 0.0), s.apply(0.4, 0.0), s.apply(0.2, 0.0)));
        // Three routes always get three different labels.
        assertEquals(java.util.Set.of(SafetyScorer.Label.FASTEST), labels2.get(0));
        assertEquals(java.util.Set.of(SafetyScorer.Label.BALANCED), labels2.get(1));
        assertEquals(java.util.Set.of(SafetyScorer.Label.SAFEST), labels2.get(2));

        // Fastest is also lowest-risk: still one label each (the app notes it on the Safest card).
        var labels3 = SafetyScorer.label(routes, List.of(s.apply(0.1, 0.0), s.apply(0.4, 0.0), s.apply(0.3, 0.0)));
        assertEquals(java.util.Set.of(SafetyScorer.Label.FASTEST), labels3.get(0));
        assertEquals(java.util.Set.of(SafetyScorer.Label.BALANCED), labels3.get(1));
        assertEquals(java.util.Set.of(SafetyScorer.Label.SAFEST), labels3.get(2));

        // One route: it carries all three.
        var labels1 = SafetyScorer.label(routes.subList(0, 1), List.of(s.apply(0.5, 0.0)));
        assertEquals(3, labels1.get(0).size());
    }

    @Test
    void routesWithASpurAreDropped() {
        com.saferoute.geo.LatLng a = new com.saferoute.geo.LatLng(12.95, 77.60);
        com.saferoute.geo.LatLng b = com.saferoute.geo.Geo.offset(a, 0, 2000);     // 2 km north
        com.saferoute.geo.LatLng spur = com.saferoute.geo.Geo.offset(b, 90, 600);  // 600 m east, then back
        com.saferoute.geo.LatLng c = com.saferoute.geo.Geo.offset(b, 0, 2000);
        List<com.saferoute.geo.LatLng> clean = RouteScenario.densify(List.of(a, b, c));
        List<com.saferoute.geo.LatLng> withSpur = RouteScenario.densify(List.of(a, b, spur, b, c));
        List<com.saferoute.geo.LatLng> crossing = RouteScenario.densify(List.of(a, c, com.saferoute.geo.Geo.offset(c, 90, 1000),
                com.saferoute.geo.Geo.offset(b, 270, 1000)));
        assertFalse(RouteSafetyService.backtracks(clean));
        assertTrue(RouteSafetyService.backtracks(withSpur));
        assertFalse(RouteSafetyService.backtracks(crossing));
        var kept = RouteSafetyService.distinct(List.of(
                new RouteCandidate(clean, 4000, 400, "clean"),
                new RouteCandidate(withSpur, 5200, 520, "spur")), 10_000);
        assertEquals(1, kept.size());
        assertEquals("clean", kept.get(0).summary());
    }

    @Test
    void overpassParsing() {
        OsmContext context = OverpassClient.parse(RouteScenario.overpass());
        assertEquals(3, context.roads().size());
        assertEquals(6, context.activity().size());
        assertTrue(OverpassClient.query(List.of(RouteScenario.ROUTE_A), new BBox(12.9, 77.5, 13.0, 77.7)).contains("around:20,"));
        assertEquals(1, context.police().size());
        assertEquals(1, context.hospitals().size());
        assertEquals("Test Hospital", context.hospitals().get(0).name());
    }

    private static RouteDtos.RouteDto only(RouteDtos.RouteResponse response, String label) {
        List<RouteDtos.RouteDto> matches = response.routes().stream().filter(r -> r.labels().contains(label)).toList();
        assertEquals(1, matches.size(), "routes labelled " + label);
        return matches.get(0);
    }
}
