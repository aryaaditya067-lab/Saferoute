package com.saferoute.ingest;

import com.saferoute.common.ApiException;
import com.saferoute.common.HttpFetcher;
import com.saferoute.incident.CrimeType;
import java.net.URI;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Checks a model-supplied candidate against reality: the URL must come from the
 * search results, the page must load, and the quoted sentence, the locality and
 * the city must actually appear in the article text.
 */
public class ArticleVerifier {

    public enum Rejection {
        INVALID_URL, URL_NOT_FROM_SEARCH, NOT_A_CRIME_REPORT, EXTRACTION_FAILED, UNSUPPORTED_CRIME_TYPE,
        LOCALITY_TOO_VAGUE, QUOTE_TOO_SHORT, FETCH_FAILED, QUOTE_NOT_IN_ARTICLE, LOCALITY_NOT_IN_ARTICLE,
        CITY_NOT_IN_ARTICLE, DATE_OUT_OF_RANGE
    }

    public record Verified(
            NewsCandidate candidate,
            String url,
            CrimeType type,
            LocalDate occurredOn,
            LocalDate publishedOn,
            String title,
            String site) {}

    public record Result(Verified verified, Rejection rejection) {
        static Result ok(Verified v) {
            return new Result(v, null);
        }

        static Result reject(Rejection r) {
            return new Result(null, r);
        }

        public boolean accepted() {
            return verified != null;
        }
    }

    private static final int MAX_PAGE_BYTES = 3 * 1024 * 1024;
    private static final Set<String> TRACKING_PARAMS = Set.of("utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid");

    private final HttpFetcher http;
    private final List<String> cityAliases;

    public ArticleVerifier(HttpFetcher http, List<String> cityAliases) {
        this.http = http;
        this.cityAliases = cityAliases;
    }

    public Result verify(NewsCandidate c, Collection<MimoClient.Citation> citations, LocalDate today, int lookbackDays) {
        URI uri = parseHttpUrl(c.url()).orElse(null);
        if (uri == null) return Result.reject(Rejection.INVALID_URL);

        Map<String, MimoClient.Citation> searchResults = citations.stream()
                .filter(cit -> parseHttpUrl(cit.url()).isPresent())
                .collect(Collectors.toMap(cit -> canonical(parseHttpUrl(cit.url()).get()), cit -> cit, (a, b) -> a));
        MimoClient.Citation citation = searchResults.get(canonical(uri));
        if (citation == null) return Result.reject(Rejection.URL_NOT_FROM_SEARCH);

        Rejection early = precheck(c);
        if (early != null) return Result.reject(early);

        Optional<String> html = fetch(uri);
        if (html.isEmpty()) return Result.reject(Rejection.FETCH_FAILED);
        return check(c, uri, citation, html.get(), today, lookbackDays);
    }

    /** Checks that need no network: supported crime type, specific locality, real quote. */
    Rejection precheck(NewsCandidate c) {
        if (CrimeType.fromId(c.crimeType()).isEmpty()) return Rejection.UNSUPPORTED_CRIME_TYPE;
        String locality = c.locality().trim();
        if (locality.length() < 3 || cityAliases.stream().anyMatch(alias -> alias.equalsIgnoreCase(locality))) {
            return Rejection.LOCALITY_TOO_VAGUE;
        }
        if (c.evidenceQuote().trim().length() < 20) return Rejection.QUOTE_TOO_SHORT;
        return null;
    }

    /** Downloads a page; empty when it can't be fetched. */
    public Optional<String> fetch(URI uri) {
        try {
            HttpFetcher.Response page = http.get(uri.toString(), Map.of("Accept", "text/html,application/xhtml+xml"),
                    Duration.ofSeconds(20), MAX_PAGE_BYTES);
            return page.ok() ? Optional.of(page.body()) : Optional.empty();
        } catch (ApiException e) {
            return Optional.empty();
        }
    }

    /** Verifies a candidate against a page that has already been downloaded. */
    public Result check(NewsCandidate c, URI uri, MimoClient.Citation citation, String html, LocalDate today, int lookbackDays) {
        Rejection early = precheck(c);
        if (early != null) return Result.reject(early);
        CrimeType type = CrimeType.fromId(c.crimeType()).orElseThrow();
        String locality = c.locality().trim();
        HttpFetcher.Response page = new HttpFetcher.Response(200, html, "text/html");

        String text = HtmlText.normalize(HtmlText.toText(page.body()));
        String bare = stripPunctuation(text);
        if (!containsLoosely(text, bare, c.evidenceQuote())) return Result.reject(Rejection.QUOTE_NOT_IN_ARTICLE);
        if (!containsAllWords(bare, locality)) return Result.reject(Rejection.LOCALITY_NOT_IN_ARTICLE);
        if (cityAliases.stream().noneMatch(alias -> bare.contains(stripPunctuation(HtmlText.normalize(alias))))) {
            return Result.reject(Rejection.CITY_NOT_IN_ARTICLE);
        }

        LocalDate published = parseDate(c.publishedDate()).or(() -> parseDate(citation.publishTime())).orElse(null);
        LocalDate occurred = parseDate(c.incidentDate()).orElse(published);
        if (occurred == null) return Result.reject(Rejection.DATE_OUT_OF_RANGE);
        LocalDate earliest = today.minusDays(Math.max(lookbackDays, 1) + 2L);
        if (occurred.isAfter(today) || occurred.isBefore(earliest)
                || (published != null && (published.isAfter(today) || published.isBefore(earliest)))) {
            return Result.reject(Rejection.DATE_OUT_OF_RANGE);
        }

        String title = HtmlText.title(page.body());
        if (title.isBlank()) title = citation.title().isBlank() ? c.headline() : citation.title();
        String site = citation.siteName().isBlank() ? uri.getHost() : citation.siteName();
        return Result.ok(new Verified(c, uri.toString(), type, occurred, published, title, site));
    }

    public static Optional<URI> parseHttpUrl(String url) {
        if (url == null || url.isBlank()) return Optional.empty();
        try {
            URI uri = new URI(url.trim());
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) return Optional.empty();
            if (uri.getHost() == null || uri.getHost().isBlank()) return Optional.empty();
            return Optional.of(uri);
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    /** host + path (+ meaningful query), lower-cased host, no "www.", no trailing slash, no tracking params. */
    public static String canonical(URI uri) {
        String host = uri.getHost().toLowerCase(Locale.ROOT).replaceFirst("^www\\.", "");
        String path = uri.getRawPath() == null ? "" : uri.getRawPath().replaceAll("/+$", "");
        String query = uri.getRawQuery();
        String keptQuery = "";
        if (query != null && !query.isBlank()) {
            keptQuery = java.util.Arrays.stream(query.split("&"))
                    .filter(p -> !TRACKING_PARAMS.contains(p.split("=", 2)[0].toLowerCase(Locale.ROOT)))
                    .sorted()
                    .collect(Collectors.joining("&"));
        }
        return host + path + (keptQuery.isEmpty() ? "" : "?" + keptQuery);
    }

    static Optional<LocalDate> parseDate(String value) {
        if (value == null || value.isBlank()) return Optional.empty();
        String v = value.trim();
        if (v.length() >= 10) v = v.substring(0, 10);
        try {
            return Optional.of(LocalDate.parse(v));
        } catch (DateTimeParseException e) {
            return Optional.empty();
        }
    }

    static String stripPunctuation(String text) {
        return text.replaceAll("[^\\p{L}\\p{N}]+", " ").replaceAll("\\s+", " ").trim();
    }

    private static boolean containsLoosely(String text, String bareText, String quote) {
        String q = HtmlText.normalize(quote);
        if (q.endsWith(".")) q = q.substring(0, q.length() - 1);
        if (text.contains(q)) return true;
        String bareQuote = stripPunctuation(q);
        return !bareQuote.isEmpty() && bareText.contains(bareQuote);
    }

    private static boolean containsAllWords(String bareText, String phrase) {
        List<String> words = java.util.Arrays.stream(stripPunctuation(HtmlText.normalize(phrase)).split(" "))
                .filter(w -> w.length() >= 3)
                .toList();
        if (words.isEmpty()) return false;
        String padded = " " + bareText + " ";
        return words.stream().allMatch(w -> padded.contains(" " + w + " "));
    }
}
