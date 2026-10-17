package com.saferoute.ingest;

import com.saferoute.incident.CrimeType;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Keyword rules that read a headline (or a sentence) and decide which street
 * crime it reports. Deterministic and fast; anything ambiguous is skipped.
 */
public final class CrimeClassifier {

    private static final Map<CrimeType, Pattern> RULES = new LinkedHashMap<>();

    static {
        RULES.put(CrimeType.MURDER, p("murder(ed|s)?|hacked to death|killed|bludgeoned|strangled|found dead with injuries"));
        RULES.put(CrimeType.CHAIN_SNATCHING, p("chain[- ]snatch\\w*|snatch\\w* (a |her |gold )?(gold )?chain|mangalsutra"));
        RULES.put(CrimeType.PHONE_SNATCHING, p("(phone|mobile)[- ]snatch\\w*|snatch\\w* (a |her |his )?(mobile|phone)"));
        RULES.put(CrimeType.STABBING, p("stabb?(ed|ing)|knifed"));
        RULES.put(CrimeType.SEXUAL_OFFENCE, p("molest\\w*|rape[ds]?|sexual(ly)? (assault|harass)\\w*|groped|eve[- ]teas\\w*"));
        RULES.put(CrimeType.KIDNAPPING, p("kidnap\\w*|abduct\\w*"));
        RULES.put(CrimeType.ROBBERY, p("robb(ed|ery|eries|ers?)|dacoity|waylaid|looted at knifepoint|at knifepoint"));
        RULES.put(CrimeType.ASSAULT, p("assault(ed|s)?|attack(ed|s)? (with|by|on)|beaten up|thrashed|road rage"));
        RULES.put(CrimeType.BURGLARY, p("burglar\\w*|house[- ]break\\w*|break[- ]in|burgled"));
        RULES.put(CrimeType.VEHICLE_THEFT, p("(bike|two[- ]wheeler|car|vehicle|scooter)s? (theft|thie(f|ves)|stolen|lifted)|steal\\w* (bikes?|two[- ]wheelers?|cars?|vehicles?)"));
        RULES.put(CrimeType.THEFT, p("theft|thie(f|ves)|stolen|pickpocket\\w*"));
    }

    /** Headlines about courts, old cases, fraud or policy are not new street incidents. */
    private static final Pattern SKIP = p(
            "court|sentenc\\w*|convict\\w*|acquit\\w*|verdict|bail|charge ?sheet|years? (ago|after|later)|cyber|online|"
                    + "fraud|scam|cheat\\w*|ponzi|digital arrest|crypto|loan app|dowry|suicide|accident|crash|"
                    + "statistics|data shows|report says|crime rate|ncrb|minister|assembly|election|opinion|editorial");

    private CrimeClassifier() {}

    private static Pattern p(String regex) {
        return Pattern.compile("\\b(" + regex + ")\\b", Pattern.CASE_INSENSITIVE);
    }

    public static Optional<CrimeType> classify(String text) {
        if (text == null || text.isBlank() || SKIP.matcher(text).find()) return Optional.empty();
        for (Map.Entry<CrimeType, Pattern> rule : RULES.entrySet()) {
            if (rule.getValue().matcher(text).find()) return Optional.of(rule.getKey());
        }
        return Optional.empty();
    }

    public static boolean mentionsCrime(String text) {
        if (text == null) return false;
        return RULES.values().stream().anyMatch(p -> p.matcher(text).find());
    }
}
