package com.saferoute.common;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Shared Jackson mapper for parsing provider responses. */
public final class Json {

    public static final ObjectMapper MAPPER =
            new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private Json() {}

    public static JsonNode parse(String body, String what) {
        try {
            return MAPPER.readTree(body);
        } catch (JsonProcessingException e) {
            throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE, "Unexpected response from " + what + ".", e);
        }
    }

    public static String write(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
