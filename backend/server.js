import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { rateLimitMiddleware } from "./rateLimiter.js";
import { validateWidgetToken, sanitizeInput, sanitizeHistory } from "./security.js";
import { getRelevantContext } from "./rag.js";
import { getServiceStatusText } from "./healthCheck.js";
import { callAI } from "./aiClient.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*").split(",").map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, origin || "*");
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "x-widget-token"],
  })
);

app.get("/", (_req, res) => {
  res.send("SuppBot is Active.");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/status", async (req, res) => {
  try {
    const status = await getServiceStatusText(req.query.product);
    res.json({ status });
  } catch {
    res.status(500).json({ error: "Could not fetch status" });
  }
});

app.post(
  "/chat",
  rateLimitMiddleware,
  validateWidgetToken,
  sanitizeInput,
  async (req, res) => {
    const { message, history = [], category } = req.body;
    const product = req.product;

    try {
      const relevantDocs = await getRelevantContext(message, product, category, 4);
      const serviceStatus = await getServiceStatusText(product);

      const productName = product
        ? product.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
        : "our product";

      const systemPrompt = `You are a friendly, helpful customer support assistant for ${productName}.

RULES:
- Only answer based on the documentation provided below.
- If the answer is not in the docs, say: "I don't have information on that."
- Do NOT make up features, prices, or policies.
- Keep answers concise and under 500 characters.
- If the user reports an issue, check the service status first.

SERVICE STATUS:
${serviceStatus}

DOCUMENTATION:
---
${relevantDocs}
---`;

      const safeHistory = sanitizeHistory(history);
      const messages = [
        { role: "system", content: systemPrompt },
        ...safeHistory,
        { role: "user", content: message },
      ];

      const { text, provider } = await callAI(messages);

      res.json({ reply: text.slice(0, 500), provider });
    } catch (err) {
      console.error("Chat error:", err.message);
      res.status(500).json({
        error: "Something went wrong. Please try again.",
        ...(process.env.NODE_ENV === "development" && { debug: err.message }),
      });
    }
  }
);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`
🤖 SuppBot running on http://localhost:${PORT}
   Test it:  http://localhost:${PORT}/test.html
  `);
});