package com.saferoute.ingest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.saferoute.common.ApiException;
import com.saferoute.incident.CrimeType;
import com.saferoute.incident.Incident;
import com.saferoute.incident.IncidentStore;
import com.saferoute.support.FakeHttp;
import com.saferoute.support.InMemoryIncidentStore;
import com.saferoute.support.TestProps;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
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

    /** Srinagar and Varanasi are Bengaluru localities and also cities in news-site menus. */
    static final String AMBIGUOUS_GAZETTEER = "{\"elements\":["
            + "{\"type\":\"node\",\"id\":1,\"lat\":12.9439,\"lon\":77.5542,\"tags\":{\"place\":\"suburb\",\"name\":\"Srinagar\"}},"
            + "{\"type\":\"node\",\"id\":2,\"lat\":13.0305,\"lon\":77.6861,\"tags\":{\"place\":\"neighbourhood\",\"name\":\"Varanasi\"}},"
            + "{\"type\":\"node\",\"id\":3,\"lat\":12.9352,\"lon\":77.6245,\"tags\":{\"place\":\"suburb\",\"name\":\"Koramangala\"}}]}";

    static final String NEWS_MENU = "<nav>Edition IN Cities Bengaluru Mumbai Delhi Srinagar Varanasi Mysuru Pune</nav>";

    @Test
    void placementIgnoresMenusOtherCitiesAndCrashes() {
        List<LocalityGazetteer.Place> places = LocalityGazetteer.parse(AMBIGUOUS_GAZETTEER, List.of("Bengaluru", "Bangalore"), TestProps.safety());
        List<String> city = List.of("Bengaluru", "Bangalore");

        // Prose naming the crime, the locality and the city places it.
        assertEquals("Koramangala", Placement.fromSentence("Bike stolen, police begin probe",
                "Bengaluru: A motorcycle was stolen from outside a house in Koramangala on Friday night.", places, city).orElseThrow().name());
        // A story from another city never says Bengaluru, so a shared locality name proves nothing.
        assertTrue(Placement.fromSentence("Rowdy-sheeter murdered in Melukote village | Mysuru News",
                "The rowdy-sheeter was murdered near the Srinagar bus stand on Monday night.", places, city).isEmpty());
        // Menus and link lists are not evidence, even when they mention a crime.
        assertTrue(Placement.fromSentence("Bengaluru murder: Husband paid hitman",
                "Also Read Bengaluru murder: Srinagar police probe killing", places, city).isEmpty());
        assertTrue(Placement.fromSentence("Bengaluru murder", "Bengaluru murder Srinagar " + "Edition IN ".repeat(60), places, city).isEmpty());

        assertTrue(CrimeClassifier.classify("4 college friends killed, 2 injured after SUV hits divider, crashes into truck").isEmpty());
        assertTrue(CrimeClassifier.classify("4 killed as bus, truck collide in Periyapatna").isEmpty());
        assertTrue(CrimeClassifier.classify("Two killed after speeding vehicle hits motorcycle on Bommasandra flyover").isEmpty());
        assertTrue(CrimeClassifier.classify("28-year-old scooter rider killed in hit-and-run near Kengeri").isEmpty());
        assertEquals(CrimeType.STABBING, CrimeClassifier.classify("Rapido rider stabbed to death in Koramangala").orElseThrow());
    }

    @Test
    void backfillSkipsLocalitiesFoundOnlyInPageMenus() {
        FakeHttp http = new FakeHttp((String url, String body) -> {
            if (url.startsWith("https://overpass.test")) return FakeHttp.json(AMBIGUOUS_GAZETTEER);
            if (url.startsWith("https://gdelt.test")) {
                if (url.contains("theft")) return FakeHttp.json("");
                return FakeHttp.json(gdelt(row("https://news.test/m", "Guest worker murdered in drunken brawl in Coimbatore", "20261005T080000Z")));
            }
            if (url.equals("https://news.test/m")) {
                return FakeHttp.html(NEWS_MENU + "<article><p>A guest worker was murdered by a co-worker after a drunken brawl, police said.</p></article>");
            }
            return FakeHttp.status(404);
        });
        var props = TestProps.properties("");
        InMemoryIncidentStore store = new InMemoryIncidentStore();
        BackfillService service = new BackfillService(new GdeltClient(http, props), new LocalityGazetteer(http, props), http, store, props, CLOCK);

        service.run(LocalDateTime.of(2026, 9, 24, 10, 0), LocalDateTime.of(2026, 10, 9, 10, 0));
        assertEquals(0, service.status().accepted());
        assertEquals(1, service.status().noLocality());
    }

    @Test
    void recheckRemovesReportsThatNoLongerPass() {
        FakeHttp http = new FakeHttp((String url, String body) ->
                url.startsWith("https://overpass.test") ? FakeHttp.json(AMBIGUOUS_GAZETTEER) : FakeHttp.status(404));
        var props = TestProps.properties("");
        InMemoryIncidentStore store = new InMemoryIncidentStore();
        List<LocalityGazetteer.Place> places = LocalityGazetteer.parse(AMBIGUOUS_GAZETTEER, List.of("Bengaluru", "Bangalore"), TestProps.safety());
        LocalityGazetteer.Place srinagar = places.stream().filter(p -> p.name().equals("Srinagar")).findFirst().orElseThrow();
        LocalityGazetteer.Place koramangala = places.stream().filter(p -> p.name().equals("Koramangala")).findFirst().orElseThrow();
        Instant now = CLOCK.instant();

        long good = store.insert(new IncidentStore.NewIncident(CrimeType.ROBBERY, "Techie robbed at knifepoint in Koramangala",
                koramangala.name(), koramangala.key(), koramangala.name(), koramangala.center(), 1200, LocalDate.of(2026, 10, 1),
                "Techie robbed at knifepoint in Koramangala"), new Incident.Source("https://news.test/ok", "t", "news.test", null), now);
        store.insert(new IncidentStore.NewIncident(CrimeType.MURDER, "Guest worker murdered in drunken brawl in Coimbatore",
                srinagar.name(), srinagar.key(), srinagar.name(), srinagar.center(), 1200, LocalDate.of(2026, 10, 2),
                "Guest worker murdered in drunken brawl in Coimbatore | Coimbatore News - Edition IN Srinagar Varanasi"),
                new Incident.Source("https://news.test/menu", "t", "news.test", null), now);
        store.insert(new IncidentStore.NewIncident(CrimeType.MURDER, "4 friends killed after SUV crashes into truck",
                srinagar.name(), srinagar.key(), srinagar.name(), srinagar.center(), 1200, LocalDate.of(2026, 10, 3),
                "4 friends killed after SUV crashes into truck"), new Incident.Source("https://news.test/crash", "t", "news.test", null), now);
        store.markProcessed("https://news.test/menu", "accepted", now);

        BackfillService service = new BackfillService(new GdeltClient(http, props), new LocalityGazetteer(http, props), http, store, props, CLOCK);
        BackfillService.RecheckResult result = service.recheck();

        assertEquals(3, result.checked());
        assertEquals(1, result.kept());
        assertEquals(List.of(good), store.findSince(LocalDate.of(2000, 1, 1)).stream().map(Incident::id).toList());
        assertTrue(!store.wasProcessed("https://news.test/menu"), "removed articles are read again by the next load");
    }

    static String googleNews(String... items) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><rss version=\"2.0\"><channel><title>Google News</title>"
                + String.join("", items) + "</channel></rss>";
    }

    static String newsItem(String link, String title, String site, String pubDate) {
        return "<item><title>" + title + " - " + site + "</title><link>" + link + "</link><pubDate>" + pubDate
                + "</pubDate><source url=\"https://site.test\">" + site + "</source></item>";
    }

    @Test
    void googleNewsFeedIsRead() {
        List<MimoClient.Citation> items = GoogleNewsClient.parse(googleNews(
                newsItem("https://news.google.test/rss/articles/abc", "Techie robbed at knifepoint in Koramangala", "The Hindu",
                        "Thu, 14 Mar 2024 07:00:00 GMT")));
        assertEquals(1, items.size());
        assertEquals("Techie robbed at knifepoint in Koramangala", items.get(0).title());
        assertEquals("The Hindu", items.get(0).siteName());
        assertEquals("2024-03-14", items.get(0).publishTime());
        assertThrows(ApiException.class,
                () -> GoogleNewsClient.parse("<!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]><rss>&e;</rss>"),
                "a feed with a DOCTYPE is refused, never expanded");
    }

    @Test
    void googleNewsFillsInWhileGdeltRefuses() {
        AtomicInteger gdeltCalls = new AtomicInteger();
        FakeHttp http = new FakeHttp((String url, String body) -> {
            if (url.startsWith("https://overpass.test")) return FakeHttp.json(GAZETTEER);
            if (url.startsWith("https://gdelt.test")) {
                gdeltCalls.incrementAndGet();
                return FakeHttp.status(429);
            }
            if (url.startsWith("https://news.test/rss")) {
                return FakeHttp.html(googleNews(
                        newsItem("https://news.google.test/rss/articles/1", "Woman's chain snatched near bus stop in JP Nagar", "The Hindu",
                                "Mon, 05 Oct 2026 08:00:00 GMT"),
                        newsItem("https://news.google.test/rss/articles/2", "Two held for theft", "Deccan Herald",
                                "Sun, 04 Oct 2026 08:00:00 GMT")));
            }
            return FakeHttp.status(404);
        });
        var props = TestProps.properties("");
        InMemoryIncidentStore store = new InMemoryIncidentStore();
        GoogleNewsClient google = new GoogleNewsClient(http, props, "https://news.test/rss", Duration.ZERO);
        BackfillService service = new BackfillService(new GdeltClient(http, props), google, new LocalityGazetteer(http, props), http, store, props, CLOCK);
        service.retryDelay = Duration.ZERO;

        service.run(LocalDateTime.of(2026, 9, 24, 10, 0), LocalDateTime.of(2026, 10, 9, 10, 0));
        BackfillService.Progress p = service.status();
        assertEquals("done", p.state());
        assertEquals(0, p.windowsSkipped());
        assertEquals(1, p.accepted());
        assertEquals(1, p.noLocality(), "a headline that names no area is skipped: the Google link can't be read");
        assertEquals(2, gdeltCalls.get(), "GDELT gets one retry, then the run continues without it");
        Incident chain = store.findSince(LocalDate.of(2026, 1, 1)).get(0);
        assertEquals("J. P. Nagar", chain.locality());
        assertEquals(LocalDate.of(2026, 10, 5), chain.occurredOn());
        assertEquals("The Hindu", chain.sources().get(0).site());
    }

    @Test
    void backfillRetriesWhenGdeltThrottles() {
        AtomicInteger gdeltCalls = new AtomicInteger();
        FakeHttp http = new FakeHttp((String url, String body) -> {
            if (url.startsWith("https://overpass.test")) return FakeHttp.json(GAZETTEER);
            if (url.startsWith("https://gdelt.test")) {
                if (gdeltCalls.incrementAndGet() == 1) return FakeHttp.status(429);
                if (url.contains("theft")) return FakeHttp.json("");
                return FakeHttp.json(gdelt(row("https://news.test/r", "Techie robbed at knifepoint in Koramangala", "20261005T080000Z")));
            }
            return FakeHttp.status(404);
        });
        var props = TestProps.properties("");
        InMemoryIncidentStore store = new InMemoryIncidentStore();
        BackfillService service = new BackfillService(new GdeltClient(http, props), new LocalityGazetteer(http, props), http, store, props, CLOCK);
        service.retryDelay = Duration.ZERO;

        service.run(LocalDateTime.of(2026, 9, 24, 10, 0), LocalDateTime.of(2026, 10, 9, 10, 0));
        assertEquals("done", service.status().state());
        assertEquals(1, service.status().accepted());
        assertEquals(3, gdeltCalls.get());
        assertEquals(0, service.status().windowsSkipped(), "the throttled window was retried, not skipped");
    }
}
