package com.saferoute.ingest;

/** One incident the model claims to have found. Nothing here is trusted until verified. */
public record NewsCandidate(
        String url,
        String headline,
        String publishedDate,
        String crimeType,
        String locality,
        String incidentDate,
        String evidenceQuote) {}
