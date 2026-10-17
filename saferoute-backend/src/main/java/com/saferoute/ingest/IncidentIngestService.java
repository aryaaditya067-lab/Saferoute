package com.saferoute.ingest;

import com.saferoute.common.ApiException;
import com.saferoute.common.HttpFetcher;
import com.saferoute.config.SafeRouteProperties;
import com.saferoute.incident.CrimeType;
import com.saferoute.incident.Incident;
import com.saferoute.incident.IncidentStore;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Collects recent street-crime reports for the configured city:
 * MiMo web search → each claim verified against its article → locality
 * geocoded inside the city → de-duplicated → stored.
 */
@Service
public class IncidentIngestService {

    private static final Logger log = LoggerFactory.getLogger(IncidentIngestService.class);

    /**
     * Result of one ingest run. {@code pagesFound} and {@code replyPreview} show what
     * MiMo's search returned, so an empty run can be diagnosed.
     */
    public record Report(
            boolean ran,
            String message,
            int searches,
            int pagesFound,
            /** Of pagesFound, how many came from the GDELT news index. */
            int fromGdelt,
            /** Articles downloaded and read in this run. */
            int articlesChecked,
            int accepted,
            int merged,
            int alreadyKnown,
            Map<String, Integer> rejected,
            List<String> replyPreview) {}

    /** Separate searches per crime group find more articles than one broad search. */
    static final List<String> SEARCH_FOCUS = List.of(
            "violent street crime: murder, assault, stabbing, robbery, chain snatching, kidnapping, sexual offences",
            "theft: phone snatching, vehicle theft, burglary, house break-ins, pickpocketing",
            "street crimes registered by local police stations (FIRs, arrests) in specific neighbourhoods");

    private final MimoClient mimo;
    private final GdeltClient gdelt;
    private final BackfillService backfill;
    private final ArticleVerifier verifier;
    private final ArticleExtractor extractor;
    private final LocalityGeocoder geocoder;
    private final IncidentStore store;
    private final SafeRouteProperties properties;
    private final Clock clock;

    public IncidentIngestService(
            MimoClient mimo,
            GdeltClient gdelt,
            BackfillService backfill,
            HttpFetcher http,
            LocalityGeocoder geocoder,
            IncidentStore store,
            SafeRouteProperties properties,
            Clock clock) {
        this.mimo = mimo;
        this.gdelt = gdelt;
        this.backfill = backfill;
        this.verifier = new ArticleVerifier(http, properties.city().aliases());
        this.extractor = new ArticleExtractor(mimo, properties.city());
        this.geocoder = geocoder;
        this.store = store;
        this.properties = properties;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${saferoute.ingest.interval}", initialDelayString = "${saferoute.ingest.initial-delay}")
    public void scheduledRun() {
        if (!properties.ingest().enabled()) return;
        if (!properties.ingest().useMimo()) {
            // Fast path: keyword rules on the last two weeks of GDELT articles.
            if (!"running".equals(backfill.status().state())) log.info("Crime ingest: {}", backfill.runRecent(14));
            return;
        }
        if (!mimo.configured()) {
            log.info("Crime ingest skipped: MIMO_API_KEY is not set.");
            return;
        }
        Report report = runOnce();
        log.info("Crime ingest: {}", report);
    }

    public synchronized Report runOnce() {
        if (!mimo.configured()) {
            return new Report(false, "MIMO_API_KEY is not set.", 0, 0, 0, 0, 0, 0, 0, Map.of(), List.of());
        }
        Instant started = clock.instant();
        long runId = store.startRun(started);
        LocalDate today = LocalDate.now(clock);
        int lookback = properties.ingest().lookbackDays();
        int acceptWindow = Math.max(lookback, properties.safety().incidentWindowDays());
        Map<ArticleVerifier.Rejection, Integer> rejected = new EnumMap<>(ArticleVerifier.Rejection.class);
        int checked = 0, accepted = 0, merged = 0, known = 0, notLocated = 0, searches = 0, fromGdelt = 0;
        List<String> previews = new java.util.ArrayList<>();
        Map<String, MimoClient.Citation> pages = new java.util.LinkedHashMap<>();

        try {
            // 1. Discovery: MiMo web search. Only the pages it actually returned are used.
            for (String focus : SEARCH_FOCUS) {
                MimoClient.SearchAnswer answer = mimo.searchAndAnswer(systemPrompt(), userPrompt(today, lookback, focus));
                searches++;
                previews.add(preview(answer));
                for (MimoClient.Citation c : answer.citations()) {
                    ArticleVerifier.parseHttpUrl(c.url()).ifPresent(uri -> pages.putIfAbsent(ArticleVerifier.canonical(uri), c));
                }
            }

            // 1b. Discovery: GDELT news index (free), last 12 weeks, newest first.
            if (properties.ingest().gdeltEnabled()) {
                try {
                    int before = pages.size();
                    for (MimoClient.Citation c : gdelt.recentCrimeArticles(12)) {
                        ArticleVerifier.parseHttpUrl(c.url()).ifPresent(uri -> pages.putIfAbsent(ArticleVerifier.canonical(uri), c));
                    }
                    fromGdelt = pages.size() - before;
                } catch (ApiException e) {
                    previews.add("GDELT unavailable: " + e.getMessage());
                }
            }

            // 2. For each new page: download it ourselves, let MiMo read it, verify, locate, store.
            for (MimoClient.Citation citation : pages.values()) {
                if (checked >= properties.ingest().maxArticlesPerRun()) break;
                if (store.sourceExists(citation.url()) || store.wasProcessed(citation.url())) {
                    known++;
                    continue;
                }
                checked++;
                Outcome outcome = processPage(citation, today, acceptWindow);
                switch (outcome.kind()) {
                    case ACCEPTED -> accepted++;
                    case MERGED -> merged++;
                    case NOT_LOCATED -> notLocated++;
                    case REJECTED -> rejected.merge(outcome.rejection(), 1, Integer::sum);
                }
                // Transient failures are retried in a later run; everything else is remembered.
                boolean transientFailure = outcome.kind() == OutcomeKind.REJECTED
                        && (outcome.rejection() == ArticleVerifier.Rejection.FETCH_FAILED
                        || outcome.rejection() == ArticleVerifier.Rejection.EXTRACTION_FAILED);
                if (!transientFailure) {
                    store.markProcessed(citation.url(), outcome.kind() == OutcomeKind.REJECTED
                            ? outcome.rejection().name().toLowerCase() : outcome.kind().name().toLowerCase(), clock.instant());
                }
            }
            int rejectedTotal = rejected.values().stream().mapToInt(Integer::intValue).sum() + notLocated;
            store.finishRun(runId, clock.instant(), true,
                    new IncidentStore.RunStats(checked, accepted, merged, rejectedTotal), null);
        } catch (RuntimeException e) {
            int rejectedTotal = rejected.values().stream().mapToInt(Integer::intValue).sum() + notLocated;
            store.finishRun(runId, clock.instant(), false,
                    new IncidentStore.RunStats(checked, accepted, merged, rejectedTotal), e.getMessage());
            log.warn("Crime ingest failed: {}", e.getMessage());
            return new Report(true, "Failed: " + e.getMessage(), searches, pages.size(), fromGdelt, checked, accepted, merged, known,
                    toMap(rejected, notLocated), previews);
        }
        return new Report(true, "OK", searches, pages.size(), fromGdelt, checked, accepted, merged, known,
                toMap(rejected, notLocated), previews);
    }

    enum OutcomeKind { ACCEPTED, MERGED, NOT_LOCATED, REJECTED }

    record Outcome(OutcomeKind kind, ArticleVerifier.Rejection rejection) {
        static Outcome rejected(ArticleVerifier.Rejection r) {
            return new Outcome(OutcomeKind.REJECTED, r);
        }
    }

    /** Download one page, let MiMo read it, verify, locate and store it. */
    private Outcome processPage(MimoClient.Citation citation, LocalDate today, int acceptWindow) {
        java.net.URI uri = ArticleVerifier.parseHttpUrl(citation.url()).orElseThrow();
        Optional<String> html = verifier.fetch(uri);
        if (html.isEmpty()) {
            return Outcome.rejected(ArticleVerifier.Rejection.FETCH_FAILED);
        }
        String title = HtmlText.title(html.get());
        if (title.isBlank()) title = citation.title();
        Optional<ArticleExtractor.Extracted> extracted;
        try {
            extracted = extractor.extract(citation.url(), title, HtmlText.mainText(html.get()));
        } catch (ApiException e) {
            if (e.code() == ApiException.Code.RATE_LIMITED || e.code() == ApiException.Code.NOT_CONFIGURED) throw e;
            extracted = Optional.empty();
        }
        if (extracted.isEmpty()) {
            return Outcome.rejected(ArticleVerifier.Rejection.EXTRACTION_FAILED);
        }
        ArticleExtractor.Extracted x = extracted.get();
        if (!x.crimeReport()) {
            return Outcome.rejected(ArticleVerifier.Rejection.NOT_A_CRIME_REPORT);
        }
        String published = citation.publishTime().isBlank() ? HtmlText.publishedDate(html.get()) : citation.publishTime();
        NewsCandidate candidate = new NewsCandidate(citation.url(), title, published,
                x.crimeType(), x.locality(), x.incidentDate(), x.evidenceQuote());
        // Search asks for recent news, but any report whose date falls inside the map's
        // window (default 90 days) is still valid data and is kept.
        ArticleVerifier.Result result = verifier.check(candidate, uri, citation, html.get(), today, acceptWindow);
        if (!result.accepted()) {
            return Outcome.rejected(result.rejection());
        }
        ArticleVerifier.Verified v = result.verified();
        Optional<LocalityGeocoder.Place> place;
        try {
            place = geocoder.locate(candidate.locality());
        } catch (ApiException e) {
            place = Optional.empty();
        }
        if (place.isEmpty()) {
            return new Outcome(OutcomeKind.NOT_LOCATED, null);
        }
        Incident.Source source = new Incident.Source(v.url(), v.title(), v.site(), v.publishedOn());
        String localityKey = localityKey(candidate.locality());
        Optional<Long> duplicate = store.findDuplicate(v.type(), localityKey, v.occurredOn());
        if (duplicate.isPresent()) {
            store.addSource(duplicate.get(), source, clock.instant());
            return new Outcome(OutcomeKind.MERGED, null);
        } else {
            store.insert(new IncidentStore.NewIncident(
                    v.type(), title, candidate.locality().trim(), localityKey,
                    place.get().label(), place.get().center(), place.get().radiusMeters(),
                    v.occurredOn(), candidate.evidenceQuote().trim()), source, clock.instant());
            return new Outcome(OutcomeKind.ACCEPTED, null);
        }
    }

    private static Map<String, Integer> toMap(Map<ArticleVerifier.Rejection, Integer> rejected, int notLocated) {
        Map<String, Integer> out = new java.util.LinkedHashMap<>();
        rejected.forEach((k, v) -> out.put(k.name().toLowerCase(), v));
        if (notLocated > 0) out.put("locality_not_found", notLocated);
        return out;
    }

    private static String preview(MimoClient.SearchAnswer answer) {
        String text = answer.content() == null ? "" : answer.content().replaceAll("\\s+", " ").trim();
        if (text.length() > 200) text = text.substring(0, 200) + "…";
        return "[" + answer.citations().size() + " pages, finish=" + answer.finishReason() + "] " + text;
    }

    static String localityKey(String locality) {
        return ArticleVerifier.stripPunctuation(HtmlText.normalize(locality));
    }

    String systemPrompt() {
        return "You are a careful news researcher. Find real, recent news articles and list them. "
                + "You never invent articles, URLs, places or dates.";
    }

    String userPrompt(LocalDate today, int lookbackDays, String focus) {
        SafeRouteProperties.City city = properties.city();
        int max = properties.ingest().maxArticlesPerRun();
        String names = String.join(" / ", city.aliases());
        return "Today is " + today + ". Search Indian news websites (for example city pages of newspapers) for articles published in the last "
                + lookbackDays + " days about " + focus + " that happened in " + names + ", " + city.region() + ", " + city.country() + ".\n"
                + "Good search terms: \"" + city.name() + " police case registered\", \"" + city.name() + " robbery\", \""
                + city.name() + " chain snatching\", \"" + city.aliases().get(city.aliases().size() - 1) + " crime news\".\n"
                + "Only include these crime types (use these ids): " + CrimeType.allowedIds() + ".\n"
                + "Ignore cyber crime, fraud, scams, political news, court verdicts about old cases and anything outside " + city.name() + ".\n"
                + "Return a JSON array with at most " + max + " objects, one per article, with exactly these fields:\n"
                + "- url: the exact article URL as it appears in your search results\n"
                + "- headline: the article headline\n"
                + "- published_date: YYYY-MM-DD\n"
                + "- crime_type: one id from the list above\n"
                + "- locality: the specific neighbourhood, area or road in " + city.name()
                + " where the crime happened, as written in the article (not just the city name)\n"
                + "- incident_date: YYYY-MM-DD if the article states it, otherwise an empty string\n"
                + "- evidence_quote: one sentence copied word for word from the article that mentions the crime and the locality\n"
                + "Only include articles that appear in your search results. If you found none, return [].";
    }
}
