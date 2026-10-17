package com.saferoute.ingest;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Reduces an HTML page to plain text for verification. */
public final class HtmlText {

    private static final Pattern DROP_BLOCKS = Pattern.compile(
            "(?is)<(script|style|noscript|svg|template|iframe)\\b[^>]*>.*?</\\1\\s*>");
    private static final Pattern COMMENTS = Pattern.compile("(?s)<!--.*?-->");
    private static final Pattern TAGS = Pattern.compile("(?s)<[^>]+>");
    private static final Pattern NUMERIC_ENTITY = Pattern.compile("&#(x?)([0-9a-fA-F]+);");
    private static final Pattern TITLE = Pattern.compile("(?is)<title[^>]*>(.*?)</title>");
    private static final Map<String, String> ENTITIES = Map.of(
            "&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", "\"", "&#39;", "'",
            "&apos;", "'", "&nbsp;", " ", "&rsquo;", "'", "&lsquo;", "'", "&ndash;", "-");

    private HtmlText() {}

    public static String toText(String html) {
        if (html == null) return "";
        String text = DROP_BLOCKS.matcher(html).replaceAll(" ");
        text = COMMENTS.matcher(text).replaceAll(" ");
        text = TAGS.matcher(text).replaceAll(" ");
        return decodeEntities(text).replaceAll("\\s+", " ").trim();
    }

    private static final Pattern ARTICLE = Pattern.compile("(?is)<article\\b[^>]*>(.*?)</article\\s*>");

    /** Text of the longest {@code <article>} block, or of the whole page when there is none. */
    public static String mainText(String html) {
        if (html == null) return "";
        String cleaned = DROP_BLOCKS.matcher(html).replaceAll(" ");
        Matcher m = ARTICLE.matcher(cleaned);
        String best = null;
        while (m.find()) {
            if (best == null || m.group(1).length() > best.length()) best = m.group(1);
        }
        String text = toText(best != null ? best : cleaned);
        return text.length() >= 300 || best == null ? text : toText(cleaned);
    }

    private static final Pattern PUBLISHED = Pattern.compile(
            "(?is)(?:article:published_time|datePublished|publish-date|pubdate)[\"']?\\s*(?:content\\s*=|:)\\s*[\"'](\\d{4}-\\d{2}-\\d{2})");

    /** Publish date from the page's metadata (meta tags or JSON-LD), as YYYY-MM-DD, or "". */
    public static String publishedDate(String html) {
        if (html == null) return "";
        Matcher m = PUBLISHED.matcher(html);
        return m.find() ? m.group(1) : "";
    }

    public static String title(String html) {
        if (html == null) return "";
        Matcher m = TITLE.matcher(html);
        return m.find() ? decodeEntities(m.group(1)).replaceAll("\\s+", " ").trim() : "";
    }

    static String decodeEntities(String text) {
        String out = text;
        for (Map.Entry<String, String> e : ENTITIES.entrySet()) out = out.replace(e.getKey(), e.getValue());
        Matcher m = NUMERIC_ENTITY.matcher(out);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String replacement;
            try {
                int code = Integer.parseInt(m.group(2), m.group(1).isEmpty() ? 10 : 16);
                replacement = new String(Character.toChars(code));
            } catch (IllegalArgumentException ex) {
                replacement = " ";
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /** Lower-case, unify quotes/dashes and whitespace so quotes can be matched reliably. */
    public static String normalize(String text) {
        if (text == null) return "";
        return text.toLowerCase()
                .replace('‘', '\'').replace('’', '\'')
                .replace('“', '"').replace('”', '"')
                .replace('–', '-').replace('—', '-')
                .replace(' ', ' ')
                .replaceAll("\\s+", " ")
                .trim();
    }
}
