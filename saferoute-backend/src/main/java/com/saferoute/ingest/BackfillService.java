package com.saferoute.ingest;

import com.saferoute.common.ApiException;
import com.saferoute.config.SafeRouteProperties;
import com.saferoute.incident.CrimeType;
import com.saferoute.incident.Incident;
import com.saferoute.incident.IncidentStore;
import java.net.URI;
import java.time.Clock;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    public record Progress(
            String state,
            String startedAt,
            String finishedAt,
            int windowsDone,
            int windowsTotal,
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
            return new Progress("idle", null, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null);
        }
    }

    private final GdeltClient gdelt;
    private final LocalityGazetteer gazetteer;
    private final ArticleVerifier fetcher;
    private final IncidentStore store;
    private final SafeRouteProperties properties;
    private final Clock clock;
    private final AtomicReference<Progress> progress = new AtomicReference<>(Progress.idle());
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "crime-backfill");
        t.setDaemon(true);
        return t;
    });

    public BackfillService(GdeltClient gdelt, LocalityGazetteer gazetteer, com.saferoute.common.HttpFetcher http,
                           IncidentStore store, SafeRouteProperties properties, Clock clock) {
        this.gdelt = gdelt;
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
        int m = Math.max(1, Math.min(24, months));
        LocalDateTime end = LocalDateTime.now(clock.withZone(ZoneOffset.UTC));
        LocalDateTime begin = end.minusMonths(m);
        progress.set(new Progress("running", clock.instant().toString(), null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null));
        executor.submit(() -> run(begin, end));
        return progress.get();
    }

    /** Synchronous load of the last {@code days} days (used by the scheduler). */
    public Progress runRecent(int days) {
        LocalDateTime end = LocalDateTime.now(clock.withZone(ZoneOffset.UTC));
        progress.set(new Progress("running", clock.instant().toString(), null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null));
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
            for (LocalDateTime[] w : windows) {
                Map<String, MimoClient.Citation> pages = new LinkedHashMap<>();
                for (String terms : List.of(GdeltClient.VIOLENT_TERMS, GdeltClient.PROPERTY_TERMS)) {
                    try {
                        for (MimoClient.Citation cit : gdelt.articlesBetween(terms, w[0], w[1])) {
                            ArticleVerifier.parseHttpUrl(cit.url()).ifPresent(u -> pages.putIfAbsent(ArticleVerifier.canonical(u), cit));
                        }
                    } catch (ApiException e) {
                        log.warn("GDELT window {}..{} failed: {}", w[0], w[1], e.getMessage());
                    }
                }
                c.found += pages.size();
                for (MimoClient.Citation cit : pages.values()) process(cit, places, c);
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

    private void process(MimoClient.Citation cit, List<LocalityGazetteer.Place> places, Counter c) {
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
        Optional<LocalityGazetteer.Place> place = LocalityGazetteer.find(title, places);
        String quote = title;
        if (place.isEmpty() && properties.backfill().fetchArticles()) {
            URI uri = ArticleVerifier.parseHttpUrl(url).orElse(null);
            Optional<String> html = uri == null ? Optional.empty() : fetcher.fetch(uri);
            if (html.isEmpty()) {
                c.fetchFailed++;
                return; // retried in a later run
            }
            String text = HtmlText.mainText(html.get());
            if (text.length() > 6000) text = text.substring(0, 6000);
            for (String sentence : text.split("(?<=[.!?])\\s+")) {
                Optional<LocalityGazetteer.Place> p = LocalityGazetteer.find(sentence, places);
                if (p.isPresent() && CrimeClassifier.mentionsCrime(sentence)) {
                    place = p;
                    quote = sentence.length() > 400 ? sentence.substring(0, 400) : sentence;
                    break;
                }
            }
            if (place.isEmpty()) {
                // A locality anywhere in the opening text, if the story is clearly about one place.
                Optional<LocalityGazetteer.Place> p = LocalityGazetteer.find(text.length() > 1500 ? text.substring(0, 1500) : text, places);
                if (p.isPresent()) {
                    place = p;
                    quote = title;
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
                c.windowsDone, c.windowsTotal, c.found, c.checked, c.accepted, c.merged, c.known, c.noCrime, c.noLocality,
                c.fetchFailed, error));
    }

    private static final class Counter {
        int windowsDone, windowsTotal, found, checked, accepted, merged, known, noCrime, noLocality, fetchFailed;
    }
}
