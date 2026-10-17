package com.saferoute.ingest;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.saferoute.common.ApiException;
import com.saferoute.common.HttpFetcher;
import com.saferoute.common.Json;
import com.saferoute.config.SafeRouteProperties;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Xiaomi MiMo chat completions with the web_search tool
 * (https://mimo.mi.com/docs). The Web Search plugin must be enabled in the
 * MiMo console.
 */
@Component
public class MimoClient {

    /** A page the search actually returned (from {@code message.annotations}). */
    public record Citation(String url, String title, String siteName, String publishTime) {}

    public record SearchAnswer(String content, List<Citation> citations, String finishReason) {}

    private final HttpFetcher http;
    private final SafeRouteProperties.Mimo config;
    private final SafeRouteProperties.City city;

    public MimoClient(HttpFetcher http, SafeRouteProperties properties) {
        this.http = http;
        this.config = properties.mimo();
        this.city = properties.city();
    }

    public boolean configured() {
        return config.configured();
    }

    /** Plain completion (no tools), used to read an article we fetched ourselves. */
    public String complete(String systemPrompt, String userPrompt) {
        return post(request(systemPrompt, userPrompt)).content();
    }

    private ObjectNode request(String systemPrompt, String userPrompt) {
        if (!configured()) {
            throw new ApiException(ApiException.Code.NOT_CONFIGURED, "MIMO_API_KEY is not set.");
        }
        ObjectNode body = Json.MAPPER.createObjectNode();
        body.put("model", config.model());
        body.put("temperature", 0.0);
        body.put("max_completion_tokens", 4000);
        body.putObject("thinking").put("type", "disabled");
        ArrayNode messages = body.putArray("messages");
        messages.addObject().put("role", "system").put("content", systemPrompt);
        messages.addObject().put("role", "user").put("content", userPrompt);
        return body;
    }

    /** Web search; the pages found are returned as citations. */
    public SearchAnswer searchAndAnswer(String systemPrompt, String userPrompt) {
        ObjectNode body = request(systemPrompt, userPrompt);
        ObjectNode tool = body.putArray("tools").addObject();
        tool.put("type", "web_search");
        tool.put("max_keyword", config.maxKeywords());
        tool.put("force_search", true);
        if (config.searchLimit() != null && config.searchLimit() > 0) tool.put("limit", config.searchLimit());
        ObjectNode location = tool.putObject("user_location");
        location.put("type", "approximate");
        location.put("country", city.country());
        location.put("region", city.region());
        location.put("city", city.name());
        return post(body);
    }

    private SearchAnswer post(ObjectNode body) {
        HttpFetcher.Response response = http.postJson(
                config.baseUrl() + "/chat/completions",
                Map.of("api-key", config.apiKey()),
                Json.write(body),
                Duration.ofSeconds(120));
        if (response.status() == 429) {
            throw new ApiException(ApiException.Code.RATE_LIMITED, "MiMo rate limit reached.");
        }
        if (!response.ok()) {
            throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE,
                    "MiMo returned HTTP " + response.status() + ": " + abbreviate(response.body()));
        }
        return parse(response.body());
    }

    /** Parses a chat completion response. Package-private for tests. */
    static SearchAnswer parse(String responseBody) {
        JsonNode root = Json.parse(responseBody, "MiMo");
        JsonNode message = root.path("choices").path(0).path("message");
        if (message.isMissingNode()) {
            throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE, "MiMo response had no message.");
        }
        List<Citation> citations = new ArrayList<>();
        for (JsonNode a : message.path("annotations")) {
            String url = a.path("url").asText("");
            if (url.isBlank()) continue;
            citations.add(new Citation(url, a.path("title").asText(""), a.path("site_name").asText(""),
                    a.path("publish_time").asText("")));
        }
        return new SearchAnswer(message.path("content").asText(""), citations,
                root.path("choices").path(0).path("finish_reason").asText(""));
    }

    private static String abbreviate(String text) {
        if (text == null) return "";
        return text.length() > 300 ? text.substring(0, 300) + "…" : text;
    }
}
