package com.saferoute.common;

/** An error with a stable code and a message that is safe to show to users. */
public class ApiException extends RuntimeException {

    public enum Code {
        INVALID_REQUEST(400),
        NO_ROUTE(422),
        UPSTREAM_UNAVAILABLE(502),
        UPSTREAM_TIMEOUT(504),
        RATE_LIMITED(429),
        UNAUTHORIZED(401),
        NOT_CONFIGURED(503);

        public final int status;

        Code(int status) {
            this.status = status;
        }
    }

    private final Code code;

    public ApiException(Code code, String message) {
        super(message);
        this.code = code;
    }

    public ApiException(Code code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public Code code() {
        return code;
    }
}
