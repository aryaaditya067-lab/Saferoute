package com.saferoute.route;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A small, strict reader for OpenStreetMap {@code opening_hours} values.
 *
 * <p>Understands "24/7", weekday ranges and lists ("Mo-Fr", "Sa,Su"), time spans
 * ("06:00-23:00", several separated by commas, spans past midnight) and "off".
 * Later rules override earlier ones for the days they name, as in OSM. Anything
 * else (sunrise, months, week numbers, open ends) makes the value unreadable, and
 * the place is treated as "hours unknown" rather than guessed.
 */
public final class OpeningHours {

    private static final List<String> DAYS = List.of("mo", "tu", "we", "th", "fr", "sa", "su");
    private static final Pattern DAY_SEL = Pattern.compile("^(mo|tu|we|th|fr|sa|su|ph)(-(mo|tu|we|th|fr|sa|su))?(,(mo|tu|we|th|fr|sa|su|ph)(-(mo|tu|we|th|fr|sa|su))?)*$");
    private static final Pattern SPAN = Pattern.compile("^(\\d{1,2}):(\\d{2})-(\\d{1,2}):(\\d{2})$");

    /** Per weekday (Monday = 0): open intervals in minutes from that day's midnight; an end above 1440 runs into the next day. */
    private final List<List<int[]>> week;

    private OpeningHours(List<List<int[]>> week) {
        this.week = week;
    }

    /** Parsed hours, or null when the value is empty or uses syntax this reader does not handle. */
    public static OpeningHours parse(String value) {
        if (value == null) return null;
        String v = value.trim().toLowerCase(Locale.ROOT);
        if (v.isEmpty()) return null;
        List<List<int[]>> week = new ArrayList<>();
        for (int d = 0; d < 7; d++) week.add(new ArrayList<>());
        if (v.equals("24/7")) {
            for (List<int[]> day : week) day.add(new int[] {0, 1440});
            return new OpeningHours(week);
        }
        boolean any = false;
        for (String rawRule : v.split(";")) {
            String rule = rawRule.trim();
            if (rule.isEmpty()) continue;
            String[] parts = rule.split("\\s+", 2);
            boolean[] days = new boolean[7];
            String times;
            if (DAY_SEL.matcher(parts[0]).matches()) {
                boolean onlyHolidays = true;
                for (String item : parts[0].split(",")) {
                    if (item.equals("ph")) continue;
                    onlyHolidays = false;
                    String[] range = item.split("-");
                    int from = DAYS.indexOf(range[0]), to = range.length > 1 ? DAYS.indexOf(range[1]) : from;
                    for (int d = from; ; d = (d + 1) % 7) {
                        days[d] = true;
                        if (d == to) break;
                    }
                }
                if (onlyHolidays) continue; // public-holiday rules don't affect an ordinary day
                if (parts.length < 2) return null;
                times = parts[1].trim();
            } else {
                for (int d = 0; d < 7; d++) days[d] = true;
                times = rule;
            }
            List<int[]> spans = new ArrayList<>();
            if (!(times.equals("off") || times.equals("closed"))) {
                if (times.equals("24/7") || times.equals("00:00-24:00")) {
                    spans.add(new int[] {0, 1440});
                } else {
                    for (String span : times.split(",")) {
                        Matcher m = SPAN.matcher(span.trim());
                        if (!m.matches()) return null;
                        int start = Integer.parseInt(m.group(1)) * 60 + Integer.parseInt(m.group(2));
                        int end = Integer.parseInt(m.group(3)) * 60 + Integer.parseInt(m.group(4));
                        if (start > 1440 || end > 1440 + 12 * 60) return null;
                        if (end <= start) end += 1440;
                        spans.add(new int[] {start, end});
                    }
                }
            }
            for (int d = 0; d < 7; d++) if (days[d]) week.set(d, new ArrayList<>(spans));
            any = true;
        }
        return any ? new OpeningHours(week) : null;
    }

    public boolean isOpen(LocalDateTime at) {
        int day = at.getDayOfWeek().getValue() - 1;
        int minute = at.getHour() * 60 + at.getMinute();
        for (int[] s : week.get(day)) if (minute >= s[0] && minute < s[1]) return true;
        int prev = (day + 6) % 7;
        for (int[] s : week.get(prev)) if (s[1] > 1440 && minute + 1440 < s[1]) return true;
        return false;
    }

    /** Today's hours for display, e.g. "05:00–23:00", "Open 24 hours" or "Closed today". */
    public String describe(LocalDate date) {
        List<int[]> spans = week.get(date.getDayOfWeek().getValue() - 1);
        if (spans.isEmpty()) return "Closed today";
        if (spans.size() == 1 && spans.get(0)[0] == 0 && spans.get(0)[1] >= 1440) return "Open 24 hours";
        List<String> out = new ArrayList<>();
        for (int[] s : spans) out.add(clock(s[0]) + "–" + clock(s[1]));
        return String.join(", ", out);
    }

    private static String clock(int minutes) {
        int m = minutes % 1440;
        if (minutes == 1440) return "24:00";
        return String.format(Locale.ROOT, "%02d:%02d", m / 60, m % 60);
    }
}
