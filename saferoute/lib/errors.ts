export type AppErrorCode =
  | "OFFLINE"
  | "TIMEOUT"
  | "NETWORK"
  | "RATE_LIMITED"
  | "HTTP"
  | "INVALID_RESPONSE"
  | "ABORTED"
  | "NO_ROUTE"
  | "INVALID_LOCATION"
  | "PERMISSION_DENIED"
  | "POSITION_UNAVAILABLE"
  | "UNSUPPORTED"
  | "INSECURE_CONTEXT"
  | "BACKEND_NOT_CONFIGURED";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status?: number;
  readonly retryAfterMs?: number;
  /** Parsed response body, when the server sent one with an error status. */
  readonly body?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    extra: { status?: number; retryAfterMs?: number; body?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: extra.cause });
    this.name = "AppError";
    this.code = code;
    this.status = extra.status;
    this.retryAfterMs = extra.retryAfterMs;
    this.body = extra.body;
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof AppError) return error.code === "ABORTED";
  return error instanceof DOMException && error.name === "AbortError";
}

type ErrorContext = "search" | "reverse" | "routing" | "location" | "generic";

/** Turns any thrown value into a short, user-facing sentence. */
export function describeError(error: unknown, context: ErrorContext = "generic"): string {
  if (!(error instanceof AppError)) {
    return context === "routing"
      ? "Couldn't calculate a route. Please try again."
      : "Something went wrong. Please try again.";
  }

  switch (error.code) {
    case "OFFLINE":
      return "You're offline. Check your internet connection and try again.";
    case "TIMEOUT":
      return context === "routing"
        ? "The routing service took too long to respond. Please try again."
        : "The request timed out. Please try again.";
    case "NETWORK":
      return "Couldn't reach the service. Check your connection and try again.";
    case "RATE_LIMITED": {
      const seconds = error.retryAfterMs ? Math.ceil(error.retryAfterMs / 1000) : null;
      return seconds
        ? `Too many requests. Please wait ${seconds}s and try again.`
        : "Too many requests. Please wait a moment and try again.";
    }
    case "NO_ROUTE":
    case "INVALID_LOCATION":
    case "PERMISSION_DENIED":
    case "POSITION_UNAVAILABLE":
    case "UNSUPPORTED":
    case "INSECURE_CONTEXT":
      // These carry messages written for users at the point they are thrown.
      return error.message;
    case "HTTP":
      if (error.status && error.status >= 500) {
        return context === "search" || context === "reverse"
          ? "The search service is having trouble right now. Please try again shortly."
          : "The routing service is having trouble right now. Please try again shortly.";
      }
      return context === "routing"
        ? "Couldn't calculate a route for these locations."
        : "The search request was rejected. Try different words.";
    case "INVALID_RESPONSE":
      return "Received an unexpected response from the service. Please try again.";
    case "BACKEND_NOT_CONFIGURED":
      return "The SafeRoute server isn't configured.";
    case "ABORTED":
      return "Request cancelled.";
  }
}

/** The server's own user-facing message (SafeRoute backend errors carry { message }), if any. */
export function serverMessage(error: unknown): string | null {
  if (error instanceof AppError && error.body && typeof error.body === "object") {
    const message = (error.body as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return null;
}
