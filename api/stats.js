/**
 * Vercel serverless: anonymous aggregate counters (page visits + visuals exported).
 *
 * GET  → { pageViews, visualsExported, configured }
 * POST → { event: "page_view" | "visual_exported" }
 *
 * Env:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 *   MOZAYK_STATS_ALLOWED_ORIGINS (comma-separated; production defaults to GitHub Pages)
 */

const REDIS_PAGE_KEY = "mozayk:stats:page_views";
const REDIS_EXPORT_KEY = "mozayk:stats:visuals_exported";
const EVENTS = new Set(["page_view", "visual_exported"]);
const PRODUCTION_ORIGINS = ["https://stellanjoh2.github.io"];

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function redisCommand(config, command) {
  const res = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(String(data.error));
  return data.result;
}

async function redisPipeline(config, commands) {
  const res = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Upstash pipeline failed");
  return data.map((row) => {
    if (row?.error) throw new Error(String(row.error));
    return row.result;
  });
}

function corsHeaders(origin, req) {
  const allow =
    process.env.MOZAYK_STATS_ALLOWED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? null;
  let allowOrigin = "*";
  if (allow?.length) {
    allowOrigin = allow.includes(origin || "") ? origin : allow[0];
  } else if (process.env.VERCEL_ENV === "production") {
    allowOrigin = PRODUCTION_ORIGINS.includes(origin || "")
      ? origin
      : PRODUCTION_ORIGINS[0];
  } else if (origin && /^https?:\/\//i.test(origin)) {
    allowOrigin = origin;
  }
  const requested = req.headers["access-control-request-headers"];
  const allowHeaders =
    typeof requested === "string" && requested.trim() !== ""
      ? requested
      : "Content-Type";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim() !== "") {
    return xff.split(",")[0].trim();
  }
  const rip = req.headers["x-real-ip"];
  if (typeof rip === "string" && rip.trim() !== "") return rip.trim();
  return "unknown";
}

function parseBody(req) {
  let raw = req.body;
  if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");
  let body =
    typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed;
      }
    } catch {
      /* ignore */
    }
  }
  return body;
}

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

async function readCounts(config) {
  const [pageViews, visualsExported] = await redisPipeline(config, [
    ["GET", REDIS_PAGE_KEY],
    ["GET", REDIS_EXPORT_KEY],
  ]);
  return {
    pageViews: toCount(pageViews),
    visualsExported: toCount(visualsExported),
  };
}

async function rateLimit(config, ip) {
  const key = `mozayk:stats:rl:${ip}`;
  const count = toCount(await redisCommand(config, ["INCR", key]));
  if (count === 1) await redisCommand(config, ["EXPIRE", key, 60]);
  return count <= 120;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const headers = corsHeaders(origin, req);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  const method = String(req.method || "").toUpperCase();
  if (method === "OPTIONS") {
    return res.status(204).end();
  }

  const config = redisConfig();
  if (!config) {
    if (method === "GET") {
      return res.status(200).json({
        pageViews: null,
        visualsExported: null,
        configured: false,
      });
    }
    return res.status(204).end();
  }

  if (method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    try {
      const counts = await readCounts(config);
      return res.status(200).json({ ...counts, configured: true });
    } catch (e) {
      console.error("stats read error", e);
      return res.status(503).json({ error: "Statistics unavailable" });
    }
  }

  if (method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const allowed = await rateLimit(config, clientIp(req));
    if (!allowed) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ error: "Too many requests" });
    }
  } catch (e) {
    console.error("stats rate limit error (fail open)", e);
  }

  const body = parseBody(req);
  const event = typeof body.event === "string" ? body.event.trim() : "";
  if (!EVENTS.has(event)) {
    return res.status(400).json({ error: "Invalid event" });
  }

  try {
    await redisCommand(config, [
      "INCR",
      event === "page_view" ? REDIS_PAGE_KEY : REDIS_EXPORT_KEY,
    ]);
    return res.status(204).end();
  } catch (e) {
    console.error("stats incr error", e);
    return res.status(503).json({ error: "Statistics unavailable" });
  }
}
