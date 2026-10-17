package com.saferoute.support;

import com.saferoute.common.HttpFetcher;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;
import java.util.function.Function;

/** Routes requests to handlers by URL; records every call. */
public class FakeHttp implements HttpFetcher {

    public final List<String> calls = new ArrayList<>();
    private final BiFunction<String, String, Response> handler;

    public FakeHttp(Function<String, Response> handler) {
        this.handler = (url, body) -> handler.apply(url);
    }

    /** Handler that also sees the POST body (null for GET). */
    public FakeHttp(BiFunction<String, String, Response> handler) {
        this.handler = handler;
    }

    @Override
    public Response get(String url, Map<String, String> headers, Duration timeout, int maxBytes) {
        calls.add("GET " + url);
        return handler.apply(url, null);
    }

    @Override
    public Response postJson(String url, Map<String, String> headers, String jsonBody, Duration timeout) {
        calls.add("POST " + url);
        return handler.apply(url, jsonBody);
    }

    @Override
    public Response postForm(String url, Map<String, String> headers, String formBody, Duration timeout, int maxBytes) {
        calls.add("POSTFORM " + url);
        return handler.apply(url, formBody);
    }

    public static Response json(String body) {
        return new Response(200, body, "application/json");
    }

    public static Response html(String body) {
        return new Response(200, body, "text/html");
    }

    public static Response status(int status) {
        return new Response(status, "", "text/plain");
    }
}
