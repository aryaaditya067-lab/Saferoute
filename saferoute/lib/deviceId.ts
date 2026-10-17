/**
 * A random id for this browser, used only so the server can limit how often one
 * device reports and count different reporters. It is never shown or shared.
 */
const KEY = "saferoute.deviceId.v1";

export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Storage blocked: a per-session id still lets the report through.
    return crypto.randomUUID();
  }
}
