/**
 * A random id for this browser, used only so the server can limit how often one
 * device reports and count different reporters. It is never shown or shared.
 */
const KEY = "saferoute.deviceId.v1";

/** crypto.randomUUID only exists on https:// and localhost, so fall back for plain-http (e.g. phone on the LAN). */
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing;
    const id = newId();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Storage blocked: a per-session id still lets the report through.
    return newId();
  }
}
