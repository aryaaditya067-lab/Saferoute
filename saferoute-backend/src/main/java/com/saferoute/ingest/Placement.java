package com.saferoute.ingest;

import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Decides which locality a news report is about. Precision over recall: a misplaced report
 * marks a safe area as dangerous for every route through it; a skipped one only leaves a gap.
 */
final class Placement {

    /** Longer "sentences" are menus and link lists that survived HTML text extraction. */
    static final int MAX_SENTENCE = 400;

    private static final Pattern PAGE_CHROME = Pattern.compile(
            "\\b(also read|read more|edition in|invest now|india world sport|representative image|photo credit|"
                    + "subscribe|sign in|newsletter|follow us|click here)\\b",
            Pattern.CASE_INSENSITIVE);

    private Placement() {}

    static Optional<LocalityGazetteer.Place> fromHeadline(String headline, List<LocalityGazetteer.Place> places) {
        return LocalityGazetteer.find(headline, places);
    }

    /**
     * An article sentence places a report only if it reads like prose, names the crime and the
     * locality, and the story is about this city (said in the headline or in that sentence).
     * News-site menus list other cities, and some share a name with a Bengaluru locality
     * (Srinagar, Varanasi), so a bare name elsewhere on the page proves nothing.
     */
    static Optional<LocalityGazetteer.Place> fromSentence(String headline, String sentence,
                                                         List<LocalityGazetteer.Place> places, List<String> cityAliases) {
        String s = sentence == null ? "" : sentence.trim();
        if (s.length() < 20 || s.length() >= MAX_SENTENCE || PAGE_CHROME.matcher(s).find()) return Optional.empty();
        if (!CrimeClassifier.mentionsCrime(s)) return Optional.empty();
        if (!mentionsCity(headline, cityAliases) && !mentionsCity(s, cityAliases)) return Optional.empty();
        return LocalityGazetteer.find(s, places);
    }

    static boolean mentionsCity(String text, List<String> cityAliases) {
        String padded = " " + LocalityGazetteer.normalize(text) + " ";
        return cityAliases.stream().anyMatch(a -> padded.contains(" " + LocalityGazetteer.normalize(a) + " "));
    }
}
