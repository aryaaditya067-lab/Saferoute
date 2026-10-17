import { AppError } from "./errors";

export interface FetchJsonOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  /** Abort and throw TIMEOUT after this many ms. */
  timeoutMs?: number;
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/**
 * fetch() wrapper used by every service: timeouts, cancellation, offline
 * detection and consistent AppError codes.
 */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { method = "GET", headers, body, signal, timeoutMs = 12_000 } = options;

  if (signal?.aborted) throw new AppError("ABORTED", "Request cancelled.");
  if (isOffline()) throw new AppError("OFFLINE", "You're offline.");

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (cause) {
    if (timedOut) throw new AppError("TIMEOUT", "Request timed out.", { cause });
    if (signal?.aborted) throw new AppError("ABORTED", "Request cancelled.", { cause });
    if (isOffline()) throw new AppError("OFFLINE", "You're offline.", { cause });
    throw new AppError("NETWORK", "Network request failed.", { cause });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (cause) {
    if (!response.ok) {
      throw new AppError(
        response.status === 429 ? "RATE_LIMITED" : "HTTP",
        `Request failed with status ${response.status}.`,
        {
          status: response.status,
          retryAfterMs: parseRetryAfter(response.headers.get("Retry-After")),
          cause,
        },
      );
    }
    if (signal?.aborted) throw new AppError("ABORTED", "Request cancelled.", { cause });
    throw new AppError("INVALID_RESPONSE", "Response was not valid JSON.", { cause });
  }

  if (!response.ok) {
    throw new AppError(
      response.status === 429 ? "RATE_LIMITED" : "HTTP",
      `Request failed with status ${response.status}.`,
      {
        status: response.status,
        retryAfterMs: parseRetryAfter(response.headers.get("Retry-After")),
        body: data,
      },
    );
  }

  return data as T;
}
