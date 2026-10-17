package com.saferoute.ingest;

import com.fasterxml.jackson.databind.JsonNode;
import com.saferoute.common.Json;
import java.util.ArrayList;
import java.util.List;

/** Extracts the JSON array of candidates from the model's text answer. */
public final class CandidateParser {

    private CandidateParser() {}

    public static List<NewsCandidate> parse(String content) {
        if (content == null) return List.of();
        String text = content.trim();
        int start = text.indexOf('[');
        int end = text.lastIndexOf(']');
        if (start < 0 || end <= start) return List.of();
        JsonNode array;
        try {
            array = Json.MAPPER.readTree(text.substring(start, end + 1));
        } catch (Exception e) {
            return List.of();
        }
        if (!array.isArray()) return List.of();
        List<NewsCandidate> out = new ArrayList<>();
        for (JsonNode item : array) {
            if (!item.isObject()) continue;
            out.add(new NewsCandidate(
                    text(item, "url"),
                    text(item, "headline"),
                    text(item, "published_date"),
                    text(item, "crime_type"),
                    text(item, "locality"),
                    text(item, "incident_date"),
                    text(item, "evidence_quote")));
        }
        return out;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) return "";
        return value.asText("").trim();
    }
}
