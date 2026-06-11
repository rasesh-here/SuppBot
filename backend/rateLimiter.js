const store = new Map(); // ip → { count, resetAt }

const MAX = parseInt(process.env.MAX_MESSAGES_PER_IP_PER_HOUR || "30");
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function rateLimitMiddleware(req, res, next) {
  // Get real IP
  const ip =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";

  const now = Date.now();
  const record = store.get(ip);

  if (!record || now > record.resetAt) {
    // First request or window expired — reset
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  if (record.count >= MAX) {
    const minutesLeft = Math.ceil((record.resetAt - now) / 60000);
    return res.status(429).json({
      error: "rate_limited",
      message: `Too many messages. Try again in ${minutesLeft} minute(s).`,
      retryAfter: Math.ceil((record.resetAt - now) / 1000),
    });
  }

  record.count++;
  next();
}

// Cleanup old entries every 30 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of store) {
    if (now > record.resetAt) store.delete(ip);
  }
}, 30 * 60 * 1000);
