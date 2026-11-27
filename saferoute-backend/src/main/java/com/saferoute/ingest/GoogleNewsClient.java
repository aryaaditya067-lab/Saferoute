package com.saferoute.ingest;

import com.saferoute.common.ApiException;
import com.saferoute.common.HttpFetcher;
import com.saferoute.common.RequestGate;
import com.saferoute.config.SafeRouteProperties;
import java.io.ByteArrayInputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * Google News search feed (RSS): headlines, publisher and date for a search between two dates.
 * A second source next to GDELT, which throttles heavy users for long periods. Its links are
 * Google redirect links that can't be read as articles, so reports from it are placed by headline.
 */
@Component
public class GoogleNewsClient {

    /** One search per word: a single OR-ed search returns far fewer stories. */
    static final List<String> CRIME_TERMS = List.of("murder", "killed", "stabbed", "robbery", "robbed", "theft", "stolen",
            "\"chain snatching\"", "snatched", "burglary", "assault", "molested", "kidnapped");

    private final HttpFetcher http;
    private final SafeRouteProperties.City city;
    private final String baseUrl;
    private final RequestGate gate;

    @Autowired
    public GoogleNewsClient(HttpFetcher http, SafeRouteProperties properties,
                            @Value("${saferoute.ingest.google-news-url:https://news.google.com/rss/search}") String baseUrl) {
        this(http, properties, baseUrl, Duration.ofSeconds(2));
    }

    GoogleNewsClient(HttpFetcher http, SafeRouteProperties properties, String baseUrl, Duration gap) {
        this.http = http;
        this.city = properties.city();
        this.baseUrl = baseUrl;
        this.gate = new RequestGate(gap.toMillis());
    }

    /** Stories matching one crime term published from {@code from} up to (not including) {@code before}. */
    public List<MimoClient.Citation> articlesBetween(String term, LocalDate from, LocalDate before) {
        String query = "(" + String.join(" OR ", city.aliases()) + ") " + term + " after:" + from + " before:" + before;
        String url = baseUrl + "?q=" + URLEncoder.encode(query, StandardCharsets.UTF_8) + "&hl=en-IN&gl=IN&ceid=IN:en";
        gate.acquire();
        HttpFetcher.Response response = http.get(url, Map.of("Accept", "application/rss+xml"), Duration.ofSeconds(30), 4 * 1024 * 1024);
        if (response.status() == 429 || response.status() == 503) {
            throw new ApiException(ApiException.Code.RATE_LIMITED, "Google News asked to slow down.");
        }
        if (!response.ok()) {
            throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE, "Google News returned HTTP " + response.status() + ".");
        }
        return parse(response.body());
    }

    /** Package-private for tests. Titles end with " - Publisher", which is removed. */
    static List<MimoClient.Citation> parse(String xml) {
        List<MimoClient.Citation> out = new ArrayList<>();
        if (xml == null || xml.isBlank()) return out;
        Document doc;
        try {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
            f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            f.setExpandEntityReferences(false);
            doc = f.newDocumentBuilder().parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE, "Google News sent an unreadable feed.");
        }
        NodeList items = doc.getElementsByTagName("item");
        for (int i = 0; i < items.getLength(); i++) {
            Element item = (Element) items.item(i);
            String link = text(item, "link");
            String title = text(item, "title");
            if (link.isBlank() || title.isBlank()) continue;
            String site = text(item, "source");
            if (!site.isBlank() && title.endsWith(" - " + site)) title = title.substring(0, title.length() - site.length() - 3).trim();
            out.add(new MimoClient.Citation(link, title, site, day(text(item, "pubDate"))));
        }
        return out;
    }

    private static String text(Element parent, String tag) {
        NodeList nodes = parent.getElementsByTagName(tag);
        return nodes.getLength() == 0 ? "" : nodes.item(0).getTextContent().trim();
    }

    private static String day(String rfc1123) {
        try {
            return ZonedDateTime.parse(rfc1123, DateTimeFormatter.RFC_1123_DATE_TIME).toLocalDate().toString();
        } catch (RuntimeException e) {
            return "";
        }
    }
}
