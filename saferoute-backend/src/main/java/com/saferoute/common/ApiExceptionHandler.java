package com.saferoute.common;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, String>> handle(ApiException error) {
        if (error.code().status >= 500) log.warn("{}: {}", error.code(), error.getMessage(), error.getCause());
        return ResponseEntity.status(error.code().status)
                .body(Map.of("code", error.code().name(), "message", error.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadInput(IllegalArgumentException error) {
        return ResponseEntity.badRequest()
                .body(Map.of("code", ApiException.Code.INVALID_REQUEST.name(), "message", error.getMessage()));
    }
}
