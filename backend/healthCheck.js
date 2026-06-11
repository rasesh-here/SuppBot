import fetch from "node-fetch";

const cache = {};
const CACHE_TTL_MS = 60_000;

async function checkEndpoint(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SuppBot-HealthCheck/1.0" },
    });

    clearTimeout(timeout);
    return { status: res.ok ? "operational" : `HTTP ${res.status}`, ok: res.ok };
  } catch (err) {
    return {
      status: err.name === "AbortError" ? "timeout" : "unreachable",
      ok: false,
    };
  }
}

/**
 * Returns a status string to inject into the AI prompt.
 * Set HEALTH_CHECK_URL in .env to enable. Otherwise returns all-ok.
 */
export async function getServiceStatusText(product) {
  const url = process.env.HEALTH_CHECK_URL;
  if (!url) return "All services operational.";

  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  const result = await checkEndpoint(url);
  const icon = result.ok ? "✅" : "❌";
  const summary = result.ok
    ? `All services operational. ${icon} ${result.status}`
    : `⚠️ Service issue detected. ${icon} ${result.status}`;

  cache.data = summary;
  cache.timestamp = now;

  return summary;
}
