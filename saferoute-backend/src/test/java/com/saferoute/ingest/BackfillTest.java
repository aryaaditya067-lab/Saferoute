package com.saferoute.ingest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.saferoute.incident.CrimeType;
import com.saferoute.incident.Incident;
import com.saferoute.support.FakeHttp;
import com.saferoute.support.InMemoryIncidentStore;
import com.saferoute.support.TestProps;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Synthetic GDELT / Overpass fixtures in the providers' documented formats. */
class BackfillTest {

    static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-09T10:00:00Z"), ZoneOffset.UTC);

    static final String GAZETTEER = "{\"elements\":["
            + "{\"type\":\"node\",\"id\":1,\"lat\":12.9063,\"lon\":77.5857,\"tags\":{\"place\":\"suburb\",\"name\":\"J. P. Nagar\"}},"
            + "{\"type\":\"node\",\"id\":2,\"lat\":12.8890,\"lon\":77.5840,\"tags\":{\"place\":\"neighbourhood\",\"name\":\"JP Nagar 7th Phase\"}},"
            + "{\"type\":\"node\",\"id\":3,\"lat\":12.9352,\"lon\":77.6245,\"tags\":{\"place\":\"suburb\",\"name\":\"Koramangala\"}},"
            + "{\"type\":\"node\",\"id\":4,\"lat\":12.97,\"lon\":77.59,\"tags\":{\"place\":\"suburb\",\"name\":\"Bengaluru\"}},"
            + "{\"type\":\"way\",\"id\":5,\"center\":{\"lat\":12.9784,\"lon\":77.6408},\"tags\":{\"place\":\"suburb\",\"name\":\"Indiranagar\"}}]}";

    static String gdelt(String... rows) {
        return "{\"articles\":[" + String.join(",", rows) + "]}";
    }

    static String row(String url, String title, String seen) {
        return "{\"url\":\"" + url + "\",\"title\":\"" + title + "\",\"seendate\":\"" + seen + "\",\"domain\":\"news.test\"}";
    }

    @Test
    void classifierAndGazetteer() {
        assertEquals(CrimeType.CHAIN_SNATCHING, CrimeClassifier.classify("Woman's chain snatched near bus stop in JP Nagar").orElseThrow());
        assertEquals(CrimeType.ROBBERY, CrimeClassifier.classify("Techie robbed at knifepoint in Koramangala").orElseThrow());
        assertEquals(CrimeType.MURDER, CrimeClassifier.classify("Man hacked to death in Indiranagar").orElseThrow());
        assertTrue(CrimeClassifier.classify("Court sentences man for 2019 murder").isEmpty());
        assertTrue(CrimeClassifier.classify("Techie loses Rs 2 lakh in online fraud").isEmpty());
        assertTrue(CrimeClassifier.classify("New metro line opens in Bengaluru").isEmpty());

        List<LocalityGazetteer.Place> places = LocalityGazetteer.parse(GAZETTEER, List.of("Bengaluru", "Bangalore"), TestProps.safety());
        assertEquals(4, places.size()); // "Bengaluru" itself is not a locality
        assertEquals("JP Nagar 7th Phase", LocalityGazetteer.find("Bike stolen in J.P. Nagar 7th phase", places).orElseThrow().name());
        assertEquals("J. P. Nagar", LocalityGazetteer.find("Chain snatched in JP Nagar", places).orElseThrow().name());
        assertTrue(LocalityGazetteer.find("Theft in Whitefield", places).isEmpty());
    }

    @Test
    void backfillLoadsHeadlinesAndArticles() {
        FakeHttp http = new FakeHttp((String url, String body) -> {
            if (url.startsWith("https://overpass.test")) return FakeHttp.json(GAZETTEER);
            if (url.startsWith("https://gdelt.test")) {
                if (url.contains("startdatetime=20261009")) return FakeHttp.json("");
                if (url.contains("theft")) {
                    return FakeHttp.json(gdelt(
                            row("https://news.test/a", "Woman's chain snatched near bus stop in JP Nagar", "20261005T080000Z"),
                            row("https://news.test/c", "Bike stolen from outside house, police begin probe", "20261004T080000Z"),
                            row("https://news.test/d", "Two held for theft", "20261003T080000Z")));
                }
                return FakeHttp.json(gdelt(
                        row("https://news.test/a", "Woman's chain snatched near bus stop in JP Nagar", "20261005T080000Z"),
                        row("https://other.test/a2", "Chain snatching in J P Nagar: second woman targeted", "20261005T120000Z"),
                        row("https://news.test/b", "Metro line extended to Whitefield", "20261004T080000Z")));
            }
            if (url.equals("https://news.test/c")) {
                return FakeHttp.html("<article><p>Bengaluru: A motorcycle was stolen from outside a house in Koramangala on Friday night, "
                        + "police said. The owner found the bike missing in the morning and filed a complaint.</p></article>");
            }
            if (url.equals("https://news.test/d")) return FakeHttp.html("<article><p>Two men were held for theft. No area was named.</p></article>");
            return FakeHttp.status(404);
        });
        var props = TestProps.properties("");
        InMemoryIncidentStore store = new InMemoryIncidentStore();
        BackfillService service = new BackfillService(new GdeltClient(http, props), new LocalityGazetteer(http, props), http, store, props, CLOCK);

        service.run(LocalDateTime.of(2026, 9, 24, 10, 0), LocalDateTime.of(2026, 10, 9, 10, 0));
        BackfillService.Progress p = service.status();
        assertEquals("done", p.state());
        assertEquals(1, p.windowsTotal());
        assertEquals(5, p.articlesFound());
        assertEquals(2, p.accepted());
        assertEquals(1, p.merged());
        assertEquals(1, p.noCrimeInHeadline());
        assertEquals(1, p.noLocality());

        List<Incident> incidents = store.findSince(LocalDate.of(2026, 1, 1));
        assertEquals(2, incidents.size());
        Incident chain = incidents.stream().filter(i -> i.type() == CrimeType.CHAIN_SNATCHING).findFirst().orElseThrow();
        assertEquals("J. P. Nagar", chain.locality());
        assertEquals(2, chain.sources().size());
        assertEquals(LocalDate.of(2026, 10, 5), chain.occurredOn());
        Incident bike = incidents.stream().filter(i -> i.type() == CrimeType.VEHICLE_THEFT).findFirst().orElseThrow();
        assertEquals("Koramangala", bike.locality());
        assertTrue(bike.evidenceQuote().contains("motorcycle was stolen"), bike.evidenceQuote());

        // Second run: everything already read.
        service.run(LocalDateTime.of(2026, 9, 24, 10, 0), LocalDateTime.of(2026, 10, 9, 10, 0));
        assertEquals(0, service.status().accepted());
        assertEquals(5, service.status().alreadyKnown());
    }
}
