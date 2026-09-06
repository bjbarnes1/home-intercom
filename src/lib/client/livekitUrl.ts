/**
 * Browsers must open LiveKit over a WebSocket URL (ws/wss). LiveKit Cloud
 * settings sometimes surface an https URL, and it's easy to paste that into
 * the env by mistake — so normalize http(s) → ws(s) before connecting.
 */
export function toWsUrl(url: string): string {
  if (!url) return url;
  return url.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://");
}
