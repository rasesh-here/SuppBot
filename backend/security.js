const ALLOWED_TOKENS = new Set(
  (process.env.ALLOWED_WIDGET_TOKENS || "pub_demo_token")
    .split(",")
    .map((t) => t.trim())
);

const INJECTION_PATTERNS = [
  /ignore (previous|all|above) instructions/i,
  /you are now/i,
  /pretend (you are|to be)/i,
  /forget (everything|your instructions)/i,
  /system prompt/i,
  /\[INST\]/i,
  /<\|system\|>/i,
  /disregard (your|the) (previous|instructions|rules)/i,
];

export function validateWidgetToken(req, res, next) {
  const token = req.headers["x-widget-token"] || req.body?.widgetToken;

  if (process.env.NODE_ENV === "development" && !token) {
    req.product = "cloudnote";
    return next();
  }

  if (!token || !ALLOWED_TOKENS.has(token)) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Invalid or missing widget token.",
    });
  }

  // Extract product from token.
  // format: "prefix_product_key"
  const parts = token.split("_");
  req.product = parts.length >= 2 ? parts[1] : "cloudnote";
  next();
}

export function sanitizeInput(req, res, next) {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required." });
  }

  const trimmed = message.trim();

  if (trimmed.length === 0) {
    return res.status(400).json({ error: "Message cannot be empty." });
  }

  if (trimmed.length > 500) {
    return res.status(400).json({
      error: "Message too long. Please keep it under 500 characters.",
    });
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      console.warn(`⚠️ Injection attempt blocked from IP: ${req.ip}`);
      return res.status(400).json({
        error: "invalid_input",
        message: "Your message contains patterns that are not allowed.",
      });
    }
  }

  req.body.message = trimmed;
  next();
}

export function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (msg) =>
        msg &&
        typeof msg === "object" &&
        ["user", "assistant"].includes(msg.role) &&
        typeof msg.content === "string" &&
        msg.content.trim().length > 0
    )
    .map((msg) => ({
      role: msg.role,
      content: msg.content.slice(0, 500),
    }))
    .slice(-10);
}
