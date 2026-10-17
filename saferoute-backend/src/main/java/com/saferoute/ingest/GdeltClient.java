package com.saferoute.ingest;

import com.fasterxml.jackson.databind.JsonNode;
import com.saferoute.common.ApiException;
import com.saferoute.common.HttpFetcher;
import com.saferoute.common.Json;
import com.saferoute.common.RequestGate;
import com.saferoute.config.SafeRouteProperties;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * GDELT DOC 2.0 API (https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/):
 * a free index of world news. Used only to discover article URLs; every article
 * is then downloaded, read and verified like the MiMo results.
 */
@Component
public class GdeltClient {

    private final HttpFetcher http;
    private final SafeRouteProperties.City city;
    private final String baseUrl;
    // GDELT asks for no more than one request every 5 seconds.
    private final RequestGate gate = new RequestGate(5_000);

    public GdeltClient(HttpFetcher http, SafeRouteProperties properties) {
        this.http = http;
        this.city = properties.city();
        this.baseUrl = properties.ingest().gdeltUrl();
    }

    public static final String VIOLENT_TERMS = "(murder OR killed OR stabbed OR robbed OR robbery OR \"chain snatching\" OR snatched "
            + "OR assaulted OR molested OR kidnapped OR attacked OR dacoity)";
    public static final String PROPERTY_TERMS = "(theft OR stolen OR burglary OR \"house break\" OR \"bike theft\" "
            + "OR \"phone snatching\" OR burgled OR thieves OR thief)";

    public List<MimoClient.Citation> recentCrimeArticles(int weeks) {
        String names = String.join(" OR ", city.aliases());
        String query = "(" + names + ") (robbery OR murder OR \"chain snatching\" OR stabbed OR assault OR theft OR burglary "
                + "OR snatched OR kidnapped OR molested OR robbed) sourcecountry:india sourcelang:english";
        return fetch(query, "&timespan=" + Math.max(1, weeks) + "w");
    }

    /** Articles matching the crime terms published between {@code start} and {@code end} (UTC). */
    public List<MimoClient.Citation> articlesBetween(String crimeTerms, java.time.LocalDateTime start, java.time.LocalDateTime end) {
        java.time.format.DateTimeFormatter f = java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
        String names = String.join(" OR ", city.aliases());
        String query = "(" + names + ") " + crimeTerms + " sourcecountry:india sourcelang:english";
        return fetch(query, "&startdatetime=" + start.format(f) + "&enddatetime=" + end.format(f));
    }

    private List<MimoClient.Citation> fetch(String query, String timeParams) {
        String url = baseUrl + "?query=" + URLEncoder.encode(query, StandardCharsets.UTF_8)
                + "&mode=artlist&format=json&maxrecords=250&sort=datedesc" + timeParams;
        gate.acquire();
        HttpFetcher.Response response = http.get(url, Map.of("Accept", "application/json"), Duration.ofSeconds(40), 8 * 1024 * 1024);
        if (response.status() == 429) {
            throw new ApiException(ApiException.Code.RATE_LIMITED, "GDELT asked to slow down.");
        }
        if (!response.ok()) {
            throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE, "GDELT returned HTTP " + response.status() + ".");
        }
        try {
            return parse(response.body());
        } catch (ApiException e) {
            // GDELT answers some queries with a plain-text message instead of JSON.
            return List.of();
        }
    }

    /** Package-private for tests. GDELT answers with an empty body when nothing matches. */
    static List<MimoClient.Citation> parse(String body) {
        if (body == null || body.isBlank()) return List.of();
        JsonNode root = Json.parse(body, "GDELT");
        List<MimoClient.Citation> out = new ArrayList<>();
        for (JsonNode a : root.path("articles")) {
            String url = a.path("url").asText("");
            if (url.isBlank()) continue;
            String seen = a.path("seendate").asText(""); // 20261005T120000Z
            String date = seen.length() >= 8
                    ? seen.substring(0, 4) + "-" + seen.substring(4, 6) + "-" + seen.substring(6, 8)
                    : "";
            out.add(new MimoClient.Citation(url, a.path("title").asText(""), a.path("domain").asText(""), date));
        }
        return out;
    }
}
