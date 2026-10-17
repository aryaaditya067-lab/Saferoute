package com.saferoute.ingest;

import com.fasterxml.jackson.databind.JsonNode;
import com.saferoute.common.Json;
import com.saferoute.config.SafeRouteProperties;
import com.saferoute.incident.CrimeType;
import java.util.Optional;

/**
 * Asks MiMo to read an article we downloaded ourselves and pull out the crime
 * details. Its answer is only a claim: {@link ArticleVerifier} still checks the
 * quote, the locality and the city against the same article text.
 */
public class ArticleExtractor {

    public record Extracted(boolean crimeReport, String crimeType, String locality, String incidentDate, String evidenceQuote) {}

    static final int MAX_ARTICLE_CHARS = 12_000;

    private final MimoClient mimo;
    private final SafeRouteProperties.City city;

    public ArticleExtractor(MimoClient mimo, SafeRouteProperties.City city) {
        this.mimo = mimo;
        this.city = city;
    }

    public Optional<Extracted> extract(String url, String title, String articleText) {
        String text = articleText.length() > MAX_ARTICLE_CHARS ? articleText.substring(0, MAX_ARTICLE_CHARS) : articleText;
        String system = "You extract facts from a news article. Use only the article text given. "
                + "Never guess. Answer with one JSON object and nothing else.";
        String user = "Article URL: " + url + "\nTitle: " + title + "\nArticle text:\n<<<\n" + text + "\n>>>\n\n"
                + "Does this article report a specific crime that happened in " + String.join(" / ", city.aliases()) + "?\n"
                + "Answer with exactly this JSON object:\n"
                + "{\"is_crime_report\": true or false,\n"
                + " \"crime_type\": one of " + CrimeType.allowedIds() + " or \"other\",\n"
                + " \"locality\": the neighbourhood, area or road in " + city.name()
                + " where it happened, written as in the article, or \"\" if the article does not say,\n"
                + " \"incident_date\": \"YYYY-MM-DD\" if the article states the date, otherwise \"\",\n"
                + " \"evidence_quote\": one sentence copied exactly, word for word, from the article text that describes the crime"
                + " (prefer a sentence that also names the locality)}\n"
                + "If the article covers several crimes, describe the main one.";
        return parse(mimo.complete(system, user));
    }

    static Optional<Extracted> parse(String content) {
        if (content == null) return Optional.empty();
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        if (start < 0 || end <= start) return Optional.empty();
        try {
            JsonNode o = Json.MAPPER.readTree(content.substring(start, end + 1));
            if (!o.isObject()) return Optional.empty();
            return Optional.of(new Extracted(
                    o.path("is_crime_report").asBoolean(false),
                    o.path("crime_type").asText("").trim(),
                    o.path("locality").asText("").trim(),
                    o.path("incident_date").asText("").trim(),
                    o.path("evidence_quote").asText("").trim()));
        } catch (Exception e) {
            return Optional.empty();
        }
    }
}
