package com.saferoute.common;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/** {@link HttpFetcher} backed by the JDK HTTP client. */
public class JdkHttpFetcher implements HttpFetcher {

    private final HttpClient client;
    private final String userAgent;

    public JdkHttpFetcher(String userAgent) {
        this.userAgent = userAgent;
        this.client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    @Override
    public Response get(String url, Map<String, String> headers, Duration timeout, int maxBytes) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url)).timeout(timeout).GET();
        builder.header("User-Agent", userAgent);
        headers.forEach(builder::header);
        return send(builder.build(), maxBytes);
    }

    @Override
    public Response postJson(String url, Map<String, String> headers, String jsonBody, Duration timeout) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                .timeout(timeout)
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8));
        builder.header("User-Agent", userAgent);
        builder.header("Content-Type", "application/json");
        headers.forEach(builder::header);
        return send(builder.build(), 8 * 1024 * 1024);
    }

    @Override
    public Response postForm(String url, Map<String, String> headers, String formBody, Duration timeout, int maxBytes) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                .timeout(timeout)
                .POST(HttpRequest.BodyPublishers.ofString(formBody, StandardCharsets.UTF_8));
        builder.header("User-Agent", userAgent);
        builder.header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
        headers.forEach(builder::header);
        return send(builder.build(), maxBytes);
    }

    private Response send(HttpRequest request, int maxBytes) {
        try {
            HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            String body;
            try (InputStream in = response.body()) {
                body = readLimited(in, maxBytes);
            }
            String contentType = response.headers().firstValue("Content-Type").orElse("");
            return new Response(response.statusCode(), body, contentType);
        } catch (HttpTimeoutException e) {
            throw new ApiException(ApiException.Code.UPSTREAM_TIMEOUT, "The service took too long to respond.", e);
        } catch (IOException e) {
            throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE, "Couldn't reach " + request.uri().getHost() + ".", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE, "Request interrupted.", e);
        }
    }

    private static String readLimited(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[16 * 1024];
        int total = 0;
        int read;
        while ((read = in.read(buffer)) != -1) {
            int allowed = Math.min(read, maxBytes - total);
            out.write(buffer, 0, allowed);
            total += allowed;
            if (total >= maxBytes) break;
        }
        return out.toString(StandardCharsets.UTF_8);
    }
}
