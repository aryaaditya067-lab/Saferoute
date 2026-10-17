package com.saferoute.common;

import java.time.Duration;
import java.util.Map;

/** Minimal HTTP access so services can be tested without the network. */
public interface HttpFetcher {

    record Response(int status, String body, String contentType) {
        public boolean ok() {
            return status >= 200 && status < 300;
        }
    }

    Response get(String url, Map<String, String> headers, Duration timeout, int maxBytes);

    Response postJson(String url, Map<String, String> headers, String jsonBody, Duration timeout);

    /** POST application/x-www-form-urlencoded (e.g. Overpass queries too long for a URL). */
    Response postForm(String url, Map<String, String> headers, String formBody, Duration timeout, int maxBytes);
}
