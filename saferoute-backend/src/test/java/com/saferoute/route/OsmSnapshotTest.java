package com.saferoute.route;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.saferoute.geo.BBox;
import com.saferoute.geo.LatLng;
import com.saferoute.support.FakeHttp;
import com.saferoute.support.TestProps;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** The saved city snapshot stands in for live Overpass queries. */
class OsmSnapshotTest {

    static final String ROADS = "{\"elements\":["
            + "{\"type\":\"way\",\"id\":1,\"tags\":{\"highway\":\"primary\",\"lit\":\"yes\"},"
            + "\"geometry\":[{\"lat\":12.97,\"lon\":77.59},{\"lat\":12.97,\"lon\":77.61}]},"
            + "{\"type\":\"way\",\"id\":2,\"tags\":{\"highway\":\"residential\",\"lit\":\"no\"},"
            + "\"geometry\":[{\"lat\":12.98,\"lon\":77.62},{\"lat\":12.98,\"lon\":77.63}]}]}";

    static final String PLACES = String.join("\n",
            "@type\t@id\t@lat\t@lon\tamenity\tshop\thealthcare\trailway\tstation\tpublic_transport\tsubway\tname\tname:en\tnetwork\toperator\topening_hours",
            "node\t10\t12.971\t77.60\tpolice\t\t\t\t\t\t\tCubbon Park Police\t\t\t\t",
            "node\t11\t12.969\t77.595\thospital\t\t\t\t\t\t\tCity Hospital\t\t\t\t",
            "node\t12\t12.9701\t77.600\t\tbakery\t\t\t\t\t\tBakery\t\t\t\t",
            "way\t13\t12.9702\t77.605\trestaurant\t\t\t\t\t\t\tDarshini\t\t\t\tMo-Su 07:00-22:00",
            "node\t14\t12.972\t77.60\t\t\t\tstation\tsubway\tstation\tyes\tಎಂ.ಜಿ. ರಸ್ತೆ\tMG Road\tNamma Metro\t\t",
            "node\t15\t13.20\t77.85\tpolice\t\t\t\t\t\t\tFar Police\t\t\t\t");

    static final List<LatLng> ROUTE = List.of(new LatLng(12.97, 77.592), new LatLng(12.97, 77.608));

    @Test
    void snapshotServesRouteFactorsWithoutNetwork(@TempDir Path dir) throws Exception {
        Files.writeString(dir.resolve("roads.json"), ROADS);
        Files.writeString(dir.resolve("places.tsv"), PLACES);
        FakeHttp http = new FakeHttp((String url, String body) -> FakeHttp.status(504));
        OverpassClient client = new OverpassClient(http, TestProps.properties(""), dir.toString());
        BBox area = BBox.around(ROUTE).expand(1000);

        OsmContext osm = client.fromSnapshot(List.of(ROUTE), area).orElseThrow();
        assertTrue(osm.majorRoadsComplete());
        assertEquals(1, osm.roads().size(), "only roads along the route; the lit street 1 km away is left out");
        assertTrue(osm.roads().get(0).major());
        assertEquals(List.of("Cubbon Park Police"), osm.police().stream().map(OsmContext.Poi::name).toList());
        assertEquals(1, osm.hospitals().size());
        assertEquals(2, osm.activity().size());
        assertEquals("Mo-Su 07:00-22:00", osm.activity().stream().filter(p -> p.osmId() == 13).findFirst().orElseThrow().openingHours());
        assertEquals(List.of("MG Road"), osm.stations().stream().map(OsmContext.Station::name).toList());
        assertEquals(1, client.mainRoads(area, Duration.ofSeconds(1)).size());
        assertTrue(http.calls.isEmpty(), "no live Overpass query");

        List<LatLng> outside = List.of(new LatLng(28.61, 77.20), new LatLng(28.62, 77.21));
        assertTrue(client.fromSnapshot(List.of(outside), BBox.around(outside)).isEmpty(), "outside the city: fall back to live");
    }

    @Test
    void withTheSnapshotPointsAwayFromMainRoadsAreSmallerStreets() {
        OsmContext osm = OverpassClient.snapshot(ROADS, PLACES);
        List<LatLng> samples = List.of(new LatLng(12.97, 77.595), new LatLng(12.97, 77.60),
                new LatLng(12.975, 77.595), new LatLng(12.975, 77.60));

        RouteSafety.Roads complete = SafetyScorer.matchRoads(samples, osm.roads(), true).roads();
        assertEquals(0.5, complete.mainRoadFraction());
        assertEquals(0.5, complete.minorRoadFraction());

        RouteSafety.Roads live = SafetyScorer.matchRoads(samples, osm.roads(), false).roads();
        assertEquals(0.0, live.minorRoadFraction(), "a live query lists every road, so unmatched points stay unknown");
    }

    @Test
    void oneReportDoesNotGiveTheFullCrimePenalty() {
        assertEquals(0.0, SafetyScorer.crimeTerm(0));
        double one = SafetyScorer.crimeTerm(1.0); // one recent violent report right on the route
        double three = SafetyScorer.crimeTerm(3.0);
        assertTrue(one > 0 && one < 0.5, "one report: " + one);
        assertTrue(three > one && three < 1, "more reports weigh more: " + three);
    }
}
