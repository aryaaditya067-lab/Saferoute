package com.saferoute.ingest;

import com.saferoute.common.ApiException;
import com.saferoute.config.SafeRouteProperties;
import com.saferoute.incident.CrimeType;
import com.saferoute.incident.Incident;
import com.saferoute.incident.IncidentStore;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Fast crime-history loader without AI: GDELT finds Bengaluru crime articles, keyword
 * rules decide the crime type from the headline, and OpenStreetMap locality names
 * place it (from the headline, or from the article text when the headline names no area).
 * Every stored incident links to its article.
 */
@Service
public class BackfillService {

    private static final Logger log = LoggerFactory.getLogger(BackfillService.class);
    /** With doubling waits capped at 20 x retryDelay: 30 s, 1, 2, 4, 8, 10 min (about 25 min) before a window is skipped. */
    private static final int GDELT_ATTEMPTS = 7;

    public record Progress(
            String state,
            String startedAt,
            String finishedAt,
            int windowsDone,
            int windowsTotal,
            /** Windows GDELT never answered for (left as gaps; a later run fills them). */
            int windowsSkipped,
            int articlesFound,
            int articlesChecked,
            int accepted,
            int merged,
            int alreadyKnown,
            int noCrimeInHeadline,
            int noLocality,
            int fetchFailed,
            String error) {

        static Progress idle() {
            return new Progress("idle", null, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null);
        }
    }

    /** Google News retries: 30 s, 1 and 2 min. */
    private static final int GOOGLE_ATTEMPTS = 4;
    /** GDELT gets one quick retry when Google News is there to fall back on. */
    private static final int GDELT_ATTEMPTS_WITH_FALLBACK = 2;

    /** A found article; {@code readable} = its link leads to the article itself (not a redirect page). */
    private record Candidate(MimoClient.Citation citation, boolean readable) {}

    private final GdeltClient gdelt;
    /** Null = GDELT only. */
    private final GoogleNewsClient googleNews;
    private final LocalityGazetteer gazetteer;
    private final ArticleVerifier fetcher;
    private final IncidentStore store;
    private final SafeRouteProperties properties;
    private final Clock clock;
    private final AtomicReference<Progress> progress = new AtomicReference<>(Progress.idle());
    Duration retryDelay = Duration.ofSeconds(30);
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "crime-backfill");
        t.setDaemon(true);
        return t;
    });

    public BackfillService(GdeltClient gdelt, LocalityGazetteer gazetteer, com.saferoute.common.HttpFetcher http,
                           IncidentStore store, SafeRouteProperties properties, Clock clock) {
        this(gdelt, null, gazetteer, http, store, properties, clock);
    }

    @Autowired
    public BackfillService(GdeltClient gdelt, GoogleNewsClient googleNews, LocalityGazetteer gazetteer,
                           com.saferoute.common.HttpFetcher http, IncidentStore store, SafeRouteProperties properties, Clock clock) {
        this.gdelt = gdelt;
        this.googleNews = googleNews;
        this.gazetteer = gazetteer;
        this.fetcher = new ArticleVerifier(http, properties.city().aliases());
        this.store = store;
        this.properties = properties;
        this.clock = clock;
    }

    public Progress status() {
        return progress.get();
    }

    /** Starts loading the last {@code months} months in the background. Returns immediately. */
    public synchronized Progress start(int months) {
        if ("running".equals(progress.get().state())) return progress.get();
        int m = Math.max(1, Math.min(60, months));
        LocalDateTime end = LocalDateTime.now(clock.withZone(ZoneOffset.UTC));
        LocalDateTime begin = end.minusMonths(m);
        progress.set(new Progress("running", clock.instant().toString(), null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null));
        executor.submit(() -> run(begin, end));
        return progress.get();
    }

    /** Synchronous load of the last {@code days} days (used by the scheduler). */
    public Progress runRecent(int days) {
        LocalDateTime end = LocalDateTime.now(clock.withZone(ZoneOffset.UTC));
        progress.set(new Progress("running", clock.instant().toString(), null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null));
        run(end.minusDays(days), end);
        return progress.get();
    }

    void run(LocalDateTime begin, LocalDateTime end) {
        Counter c = new Counter();
        String error = null;
        long runId = store.startRun(clock.instant());
        try {
            List<LocalityGazetteer.Place> places = gazetteer.places();
            int windowDays = Math.max(1, properties.backfill().windowDays());
            List<LocalDateTime[]> windows = new ArrayList<>();
            for (LocalDateTime t = end; t.isAfter(begin); t = t.minusDays(windowDays)) {
                LocalDateTime from = t.minusDays(windowDays).isBefore(begin) ? begin : t.minusDays(windowDays);
                windows.add(new LocalDateTime[] {from, t});
            }
            c.windowsTotal = windows.size();
            boolean gdeltUp = true;
            int gdeltAttempts = googleNews == null ? GDELT_ATTEMPTS : GDELT_ATTEMPTS_WITH_FALLBACK;
            for (LocalDateTime[] w : windows) {
                Map<String, Candidate> pages = new LinkedHashMap<>();
                boolean answered = false;
                if (gdeltUp) {
                    for (String terms : List.of(GdeltClient.VIOLENT_TERMS, GdeltClient.PROPERTY_TERMS)) {
                        try {
                            for (MimoClient.Citation cit : withRetry(() -> gdelt.articlesBetween(terms, w[0], w[1]), gdeltAttempts, "GDELT")) {
                                ArticleVerifier.parseHttpUrl(cit.url())
                                        .ifPresent(u -> pages.putIfAbsent(ArticleVerifier.canonical(u), new Candidate(cit, true)));
                            }
                            answered = true;
                        } catch (ApiException e) {
                            log.warn("GDELT {}..{} failed: {}", w[0], w[1], e.getMessage());
                            if (googleNews != null) {
                                // Once over its limit GDELT refuses for a long time; don't spend every window waiting.
                                gdeltUp = false;
                                log.warn("GDELT is refusing requests; using Google News only for the rest of this run");
                                break;
                            }
                        }
                    }
                }
                if (googleNews != null) {
                    LocalDate from = w[0].toLocalDate();
                    LocalDate before = w[1].toLocalDate().plusDays(1);
                    for (String term : GoogleNewsClient.CRIME_TERMS) {
                        try {
                            for (MimoClient.Citation cit : withRetry(() -> googleNews.articlesBetween(term, from, before), GOOGLE_ATTEMPTS, "Google News")) {
                                pages.putIfAbsent(cit.url(), new Candidate(cit, false));
                            }
                            answered = true;
                        } catch (ApiException e) {
                            log.warn("Google News {}..{} stopped: {}", from, before, e.getMessage());
                            break;
                        }
                    }
                }
                if (!answered) c.windowsSkipped++;
                c.found += pages.size();
                for (Candidate p : pages.values()) process(p.citation(), p.readable(), places, c);
                c.windowsDone++;
                publish(c, "running", null);
            }
        } catch (RuntimeException e) {
            error = e.getMessage();
            log.warn("Backfill failed: {}", e.getMessage());
        }
        store.finishRun(runId, clock.instant(), error == null,
                new IncidentStore.RunStats(c.checked, c.accepted, c.merged, c.noCrime + c.noLocality + c.fetchFailed), error);
        publish(c, error == null ? "done" : "failed", error);
    }

    public record RecheckResult(int checked, int kept, List<String> removed) {}

    /**
     * Applies the current classification and placement rules to every stored report, using its
     * stored headline and evidence sentence. Reports that fail are deleted and their articles
     * forgotten, so the next history load reads them again under the current rules.
     */
    public synchronized RecheckResult recheck() {
        List<LocalityGazetteer.Place> places = gazetteer.places();
        List<Incident> all = store.findSince(LocalDate.of(1970, 1, 1));
        List<String> removed = new ArrayList<>();
        for (Incident incident : all) {
            String reason = recheckFailure(incident, places, properties.city().aliases());
            if (reason == null) continue;
            store.forget(incident.id());
            removed.add(incident.id() + " " + incident.locality() + " (" + reason + "): " + incident.headline());
        }
        if (!removed.isEmpty()) log.info("Recheck removed {} of {} reports", removed.size(), all.size());
        return new RecheckResult(all.size(), all.size() - removed.size(), removed);
    }

    /** Why a stored report no longer passes, or null if it does. */
    static String recheckFailure(Incident incident, List<LocalityGazetteer.Place> places, List<String> cityAliases) {
        if (CrimeClassifier.classify(incident.headline()).isEmpty()) return "not a street crime";
        Optional<LocalityGazetteer.Place> where = Placement.fromHeadline(incident.headline(), places);
        if (where.isEmpty()) where = Placement.fromSentence(incident.headline(), incident.evidenceQuote(), places, cityAliases);
        if (where.isEmpty()) return "location not supported by its source";
        if (!where.get().name().equals(incident.locality())) return "source names " + where.get().name();
        return null;
    }

    /**
     * GDELT throttles with 429s and slow handshakes, and keeps refusing for minutes once a client has
     * gone over its limit; back off with doubling waits instead of losing the window.
     */
    private List<MimoClient.Citation> withRetry(Supplier<List<MimoClient.Citation>> call, int attempts, String source) {
        for (int attempt = 1; ; attempt++) {
            try {
                return call.get();
            } catch (ApiException e) {
                boolean busy = e.code() == ApiException.Code.RATE_LIMITED || e.code() == ApiException.Code.UPSTREAM_TIMEOUT;
                if (!busy || attempt >= attempts) throw e;
                long waitMs = Math.min(retryDelay.toMillis() << (attempt - 1), retryDelay.toMillis() * 20);
                log.info("{} busy ({}); retrying in {}s", source, e.getMessage(), waitMs / 1000);
                try {
                    Thread.sleep(waitMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        }
    }

    private void process(MimoClient.Citation cit, boolean readable, List<LocalityGazetteer.Place> places, Counter c) {
        String url = cit.url();
        if (store.sourceExists(url) || store.wasProcessed(url)) {
            c.known++;
            return;
        }
        c.checked++;
        String title = cit.title() == null ? "" : cit.title().trim();
        Optional<CrimeType> type = CrimeClassifier.classify(title);
        if (type.isEmpty()) {
            c.noCrime++;
            store.markProcessed(url, "no_crime_in_headline", clock.instant());
            return;
        }
        Optional<LocalityGazetteer.Place> place = Placement.fromHeadline(title, places);
        String quote = title;
        if (place.isEmpty() && readable && properties.backfill().fetchArticles()) {
            URI uri = ArticleVerifier.parseHttpUrl(url).orElse(null);
            Optional<String> html = uri == null ? Optional.empty() : fetcher.fetch(uri);
            if (html.isEmpty()) {
                c.fetchFailed++;
                return; // retried in a later run
            }
            String text = HtmlText.mainText(html.get());
            if (text.length() > 6000) text = text.substring(0, 6000);
            for (String sentence : text.split("(?<=[.!?])\\s+")) {
                Optional<LocalityGazetteer.Place> p = Placement.fromSentence(title, sentence, places, properties.city().aliases());
                if (p.isPresent()) {
                    place = p;
                    quote = sentence.trim();
                    break;
                }
            }
        }
        if (place.isEmpty()) {
            c.noLocality++;
            store.markProcessed(url, "no_locality", clock.instant());
            return;
        }
        LocalDate reported = ArticleVerifier.parseDate(cit.publishTime()).orElse(LocalDate.now(clock));
        LocalityGazetteer.Place loc = place.get();
        Incident.Source source = new Incident.Source(url, title, cit.siteName(), reported);
        Optional<Long> dup = store.findDuplicate(type.get(), loc.key(), reported);
        if (dup.isPresent()) {
            store.addSource(dup.get(), source, clock.instant());
            c.merged++;
            store.markProcessed(url, "merged", clock.instant());
        } else {
            store.insert(new IncidentStore.NewIncident(type.get(), title, loc.name(), loc.key(), loc.name(), loc.center(),
                    loc.radiusMeters(), reported, quote), source, clock.instant());
            c.accepted++;
            store.markProcessed(url, "accepted", clock.instant());
        }
    }

    private void publish(Counter c, String state, String error) {
        Progress old = progress.get();
        progress.set(new Progress(state, old.startedAt(), "running".equals(state) ? null : Instant.now(clock).toString(),
                c.windowsDone, c.windowsTotal, c.windowsSkipped, c.found, c.checked, c.accepted, c.merged, c.known, c.noCrime, c.noLocality,
                c.fetchFailed, error));
    }

    private static final class Counter {
        int windowsDone, windowsTotal, windowsSkipped, found, checked, accepted, merged, known, noCrime, noLocality, fetchFailed;
    }
}
