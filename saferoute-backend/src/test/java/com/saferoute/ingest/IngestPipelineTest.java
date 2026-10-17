package com.saferoute.ingest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.saferoute.incident.CrimeType;
import com.saferoute.incident.Incident;
import com.saferoute.support.FakeHttp;
import com.saferoute.support.InMemoryIncidentStore;
import com.saferoute.support.TestProps;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Synthetic fixtures in the documented MiMo / Photon response formats. */
class IngestPipelineTest {

    static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-05T10:00:00Z"), ZoneOffset.UTC);
    static final LocalDate TODAY = LocalDate.of(2026, 10, 5);

    static final String ARTICLE_A = "<html><head><title>Woman's chain snatched in Jayanagar | City News</title>"
            + "<script>var x = 'Jayanagar ignored';</script></head><body><article><p>Bengaluru: Two men on a bike snatched a "
            + "woman&#8217;s gold chain near the 4th Block bus stop in Jayanagar on Friday evening, police said.</p>"
            + "<p>The Jayanagar police have registered a case.</p></article></body></html>";

    static final String ARTICLE_B = "<html><head><title>Chain snatching in Jayanagar</title></head><body>"
            + "<p>In Bangalore, a chain snatching was reported in Jayanagar on Friday, an officer said.</p></body></html>";

    static final String ARTICLE_FAKE_QUOTE = "<html><body><p>Bengaluru traffic update for Indiranagar.</p></body></html>";

    static String mimoResponse() {
        String content = "```json\\n["
                + "{\\\"url\\\":\\\"https://www.citynews.test/bengaluru/chain-snatched-jayanagar?utm_source=x\\\",\\\"headline\\\":\\\"Woman's chain snatched in Jayanagar\\\","
                + "\\\"published_date\\\":\\\"2026-10-04\\\",\\\"crime_type\\\":\\\"chain_snatching\\\",\\\"locality\\\":\\\"Jayanagar\\\",\\\"incident_date\\\":\\\"2026-10-03\\\","
                + "\\\"evidence_quote\\\":\\\"Two men on a bike snatched a woman’s gold chain near the 4th Block bus stop in Jayanagar on Friday evening\\\"},"
                + "{\\\"url\\\":\\\"https://other.test/chain-jayanagar\\\",\\\"headline\\\":\\\"Chain snatching in Jayanagar\\\",\\\"published_date\\\":\\\"2026-10-04\\\","
                + "\\\"crime_type\\\":\\\"chain_snatching\\\",\\\"locality\\\":\\\"Jayanagar\\\",\\\"incident_date\\\":\\\"2026-10-04\\\","
                + "\\\"evidence_quote\\\":\\\"a chain snatching was reported in Jayanagar on Friday\\\"},"
                + "{\\\"url\\\":\\\"https://invented.test/story\\\",\\\"headline\\\":\\\"Made up\\\",\\\"published_date\\\":\\\"2026-10-04\\\",\\\"crime_type\\\":\\\"robbery\\\","
                + "\\\"locality\\\":\\\"Koramangala\\\",\\\"incident_date\\\":\\\"\\\",\\\"evidence_quote\\\":\\\"A robbery happened in Koramangala last night near the park\\\"},"
                + "{\\\"url\\\":\\\"https://citynews.test/traffic\\\",\\\"headline\\\":\\\"Robbery in Indiranagar\\\",\\\"published_date\\\":\\\"2026-10-04\\\",\\\"crime_type\\\":\\\"robbery\\\","
                + "\\\"locality\\\":\\\"Indiranagar\\\",\\\"incident_date\\\":\\\"\\\",\\\"evidence_quote\\\":\\\"Three men robbed a shopkeeper in Indiranagar at knifepoint\\\"},"
                + "{\\\"url\\\":\\\"https://citynews.test/cyber\\\",\\\"headline\\\":\\\"Cyber fraud\\\",\\\"published_date\\\":\\\"2026-10-04\\\",\\\"crime_type\\\":\\\"cyber_fraud\\\","
                + "\\\"locality\\\":\\\"Whitefield\\\",\\\"incident_date\\\":\\\"\\\",\\\"evidence_quote\\\":\\\"A techie lost money in an online fraud in Whitefield\\\"}"
                + "]\\n```";
        return "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"" + content + "\",\"annotations\":["
                + "{\"type\":\"url_citation\",\"url\":\"https://citynews.test/bengaluru/chain-snatched-jayanagar\",\"title\":\"Woman's chain snatched\",\"site_name\":\"City News\",\"publish_time\":\"2026-10-04T08:00:00Z\"},"
                + "{\"type\":\"url_citation\",\"url\":\"https://other.test/chain-jayanagar\",\"title\":\"Chain snatching\",\"site_name\":\"Other\",\"publish_time\":\"2026-10-04T09:00:00Z\"},"
                + "{\"type\":\"url_citation\",\"url\":\"https://citynews.test/traffic\",\"title\":\"Traffic\",\"site_name\":\"City News\",\"publish_time\":\"2026-10-04T09:00:00Z\"},"
                + "{\"type\":\"url_citation\",\"url\":\"https://citynews.test/cyber\",\"title\":\"Cyber\",\"site_name\":\"City News\",\"publish_time\":\"2026-10-04T09:00:00Z\"}"
                + "]}}]}";
    }

    static final String PHOTON_JAYANAGAR = "{\"type\":\"FeatureCollection\",\"features\":["
            + "{\"type\":\"Feature\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[77.5946,12.9716]},\"properties\":{\"name\":\"Bengaluru\",\"type\":\"city\",\"osm_value\":\"city\"}},"
            + "{\"type\":\"Feature\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[77.5838,12.9299]},\"properties\":{\"name\":\"Jayanagar\",\"type\":\"district\",\"osm_value\":\"suburb\",\"city\":\"Bengaluru\",\"extent\":[77.575,12.938,77.593,12.921]}}]}";

    static String extraction(String json) {
        return "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":" + com.saferoute.common.Json.write(json) + "}}]}";
    }

    static FakeHttp http() {
        return new FakeHttp((String url, String body) -> {
            if (url.startsWith("https://mimo.test")) {
                if (body.contains("web_search")) return FakeHttp.json(mimoResponse());
                if (body.contains("gold chain")) return FakeHttp.json(extraction("{\"is_crime_report\":true,\"crime_type\":\"chain_snatching\","
                        + "\"locality\":\"Jayanagar\",\"incident_date\":\"2026-10-03\",\"evidence_quote\":"
                        + "\"Two men on a bike snatched a woman’s gold chain near the 4th Block bus stop in Jayanagar on Friday evening\"}"));
                if (body.contains("a chain snatching was reported")) return FakeHttp.json(extraction("Here it is: {\"is_crime_report\":true,"
                        + "\"crime_type\":\"chain_snatching\",\"locality\":\"Jayanagar\",\"incident_date\":\"2026-10-04\","
                        + "\"evidence_quote\":\"a chain snatching was reported in Jayanagar on Friday\"}"));
                return FakeHttp.json(extraction("{\"is_crime_report\":false,\"crime_type\":\"other\",\"locality\":\"\",\"incident_date\":\"\",\"evidence_quote\":\"\"}"));
            }
            if (url.contains("citynews.test/bengaluru/chain-snatched-jayanagar")) return FakeHttp.html(ARTICLE_A);
            if (url.startsWith("https://other.test/chain-jayanagar")) return FakeHttp.html(ARTICLE_B);
            if (url.startsWith("https://citynews.test/traffic")) return FakeHttp.html(ARTICLE_FAKE_QUOTE);
            if (url.startsWith("https://photon.test")) return FakeHttp.json(PHOTON_JAYANAGAR);
            if (url.startsWith("https://gdelt.test")) return FakeHttp.json("{\"articles\":["
                    + "{\"url\":\"https://citynews.test/bengaluru/chain-snatched-jayanagar\",\"title\":\"dup\",\"seendate\":\"20261004T080000Z\",\"domain\":\"citynews.test\"},"
                    + "{\"url\":\"https://gone.test/robbery\",\"title\":\"Robbery\",\"seendate\":\"20261003T080000Z\",\"domain\":\"gone.test\"}]}");
            return FakeHttp.status(404);
        });
    }

    @Test
    void pipelineReadsEachFoundPageAndKeepsOnlyVerifiedReports() {
        FakeHttp http = http();
        var props = TestProps.properties("key");
        InMemoryIncidentStore store = new InMemoryIncidentStore();
        IncidentIngestService service = new IncidentIngestService(
                new MimoClient(http, props), new GdeltClient(http, props), backfill(http, props), http, new LocalityGeocoder(http, props), store, props, CLOCK);

        IncidentIngestService.Report report = service.runOnce();

        assertEquals("OK", report.message());
        assertEquals(IncidentIngestService.SEARCH_FOCUS.size(), report.searches());
        assertEquals(5, report.pagesFound());
        assertEquals(1, report.fromGdelt());
        assertEquals(5, report.articlesChecked());
        assertEquals(1, report.accepted());
        assertEquals(1, report.merged());
        assertEquals(Integer.valueOf(2), report.rejected().get("fetch_failed"));
        assertEquals(Integer.valueOf(1), report.rejected().get("not_a_crime_report"));
        assertTrue(report.replyPreview().get(0).startsWith("[4 pages"), report.replyPreview().get(0));

        List<Incident> stored = store.findSince(TODAY.minusDays(90));
        assertEquals(1, stored.size());
        Incident incident = stored.get(0);
        assertEquals(CrimeType.CHAIN_SNATCHING, incident.type());
        assertEquals(LocalDate.of(2026, 10, 3), incident.occurredOn());
        assertEquals("Woman's chain snatched in Jayanagar | City News", incident.headline());
        assertEquals(12.9299, incident.center().lat(), 1e-9);
        assertTrue(incident.radiusMeters() > 900 && incident.radiusMeters() < 1500, "radius " + incident.radiusMeters());
        assertEquals(2, incident.sources().size());
        assertTrue(store.lastSuccessfulRun().isPresent());

        // A second run skips pages already read (stored or rejected for good) and retries only failed downloads.
        IncidentIngestService.Report again = service.runOnce();
        assertEquals(0, again.accepted());
        assertEquals(3, again.alreadyKnown());
        assertEquals(2, again.articlesChecked());
        assertEquals(1, GdeltClient.parse("{\"articles\":[{\"url\":\"https://a.test/x\",\"seendate\":\"20261001T000000Z\"}]}").size());
        assertEquals("2026-10-01", GdeltClient.parse("{\"articles\":[{\"url\":\"https://a.test/x\",\"seendate\":\"20261001T000000Z\"}]}").get(0).publishTime());
        assertTrue(GdeltClient.parse("").isEmpty());
    }

    @Test
    void extractionParsing() {
        assertTrue(ArticleExtractor.parse("no json here").isEmpty());
        var x = ArticleExtractor.parse("```json\n{\"is_crime_report\": true, \"crime_type\": \"robbery\", \"locality\": \"BTM Layout\"}\n```").orElseThrow();
        assertTrue(x.crimeReport());
        assertEquals("BTM Layout", x.locality());
        assertEquals("", x.incidentDate());
        assertEquals("2026-09-30", HtmlText.publishedDate("<meta property=\"article:published_time\" content=\"2026-09-30T10:00:00+05:30\">"));
        assertEquals("2026-09-29", HtmlText.publishedDate("<script>{\"datePublished\":\"2026-09-29T08:00:00Z\"}</script>"));
        assertEquals("", HtmlText.publishedDate("<p>no date</p>"));
        String body = "Two men robbed a shop in BTM Layout on Monday night. ".repeat(8).trim();
        assertEquals(body, HtmlText.mainText("<nav>Menu Home Sports</nav><article><p>" + body + "</p></article><footer>About us</footer>"));
        // A tiny <article> (e.g. a teaser card) is ignored in favour of the whole page.
        assertTrue(HtmlText.mainText("<p>Main story text</p><article>Ad</article>").contains("Main story text"));
    }

    static BackfillService backfill(FakeHttp http, com.saferoute.config.SafeRouteProperties props) {
        return new BackfillService(new GdeltClient(http, props), new LocalityGazetteer(http, props), http,
                new InMemoryIncidentStore(), props, CLOCK);
    }

    @Test
    void withoutApiKeyNothingRuns() {
        FakeHttp http = http();
        var props = TestProps.properties("");
        IncidentIngestService service = new IncidentIngestService(
                new MimoClient(http, props), new GdeltClient(http, props), backfill(http, props), http, new LocalityGeocoder(http, props), new InMemoryIncidentStore(), props, CLOCK);
        assertFalse(service.runOnce().ran());
        assertTrue(http.calls.isEmpty());
    }

    @Test
    void verifierRejectsOldNewsAndVagueLocality() {
        ArticleVerifier verifier = new ArticleVerifier(http(), List.of("Bengaluru", "Bangalore"));
        List<MimoClient.Citation> citations = List.of(new MimoClient.Citation(
                "https://citynews.test/bengaluru/chain-snatched-jayanagar", "t", "City News", ""));
        NewsCandidate old = new NewsCandidate("https://citynews.test/bengaluru/chain-snatched-jayanagar", "h", "2026-08-01",
                "chain_snatching", "Jayanagar", "2026-08-01",
                "Two men on a bike snatched a woman's gold chain near the 4th Block bus stop in Jayanagar on Friday evening");
        assertEquals(ArticleVerifier.Rejection.DATE_OUT_OF_RANGE, verifier.verify(old, citations, TODAY, 3).rejection());

        NewsCandidate vague = new NewsCandidate("https://citynews.test/bengaluru/chain-snatched-jayanagar", "h", "2026-10-04",
                "chain_snatching", "Bangalore", "", "Two men on a bike snatched a woman's gold chain");
        assertEquals(ArticleVerifier.Rejection.LOCALITY_TOO_VAGUE, verifier.verify(vague, citations, TODAY, 3).rejection());
    }

    @Test
    void verifierAcceptsCurlyQuotesAndTrackingParams() {
        ArticleVerifier verifier = new ArticleVerifier(http(), List.of("Bengaluru", "Bangalore"));
        List<MimoClient.Citation> citations = List.of(new MimoClient.Citation(
                "https://citynews.test/bengaluru/chain-snatched-jayanagar/", "t", "City News", "2026-10-04T08:00:00Z"));
        NewsCandidate c = new NewsCandidate("https://www.citynews.test/bengaluru/chain-snatched-jayanagar?utm_source=x", "h", "",
                "chain_snatching", "Jayanagar", "",
                "Two men on a bike snatched a woman's gold chain near the 4th Block bus stop in Jayanagar on Friday evening.");
        ArticleVerifier.Result r = verifier.verify(c, citations, TODAY, 3);
        assertTrue(r.accepted(), String.valueOf(r.rejection()));
        assertNull(r.rejection());
        assertEquals(LocalDate.of(2026, 10, 4), r.verified().occurredOn());
        assertEquals("Woman's chain snatched in Jayanagar | City News", r.verified().title());
    }

    @Test
    void parsersTolerateNoise() {
        assertEquals(0, CandidateParser.parse("I could not find anything.").size());
        assertEquals(0, CandidateParser.parse("[not json").size());
        assertEquals(1, CandidateParser.parse("Here you go:\n[{\"url\":\"https://a.test\",\"locality\":null}]").size());
        assertEquals("a b & c", HtmlText.toText("<style>p{}</style><p>a</p><!-- x --><b>b</b> &amp; c"));
        MimoClient.SearchAnswer answer = MimoClient.parse(mimoResponse());
        assertEquals(4, answer.citations().size());
        assertTrue(answer.content().startsWith("```json"));
    }
}
