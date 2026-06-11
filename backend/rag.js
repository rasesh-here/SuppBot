import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "docs");

// Cache fetched docs in memory (5 min TTL)
const cache = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getProductChunks(product) {
  const name = (product || "cloudnote").toLowerCase();
  const now = Date.now();
  const cached = cache[name];

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.chunks;
  }

  const filePath = path.join(DOCS_DIR, `${name}.md`);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ RAG: No doc found for "${name}"`);
    if (cached) return cached.chunks;
    return [];
  }

  let content = fs.readFileSync(filePath, "utf-8").trim();

  // If file content is a URL, fetch live markdown from it
  if (content.startsWith("http://") || content.startsWith("https://")) {
    let fetchUrl = content;
    // Auto-format HackMD links to raw download
    if (fetchUrl.includes("hackmd.io") && !fetchUrl.endsWith("/download")) {
      fetchUrl = fetchUrl.replace(/\/$/, "") + "/download";
    }

    console.log(`📡 Fetching live docs for "${name}" from ${fetchUrl}`);
    try {
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      content = await res.text();
    } catch (err) {
      console.error(`❌ Failed to fetch docs for "${name}":`, err.message);
      if (cached) return cached.chunks;
    }
  }

  const chunks = chunkMarkdown(content, `${name}.md`);
  cache[name] = { chunks, timestamp: now };
  return chunks;
}

function chunkMarkdown(content, filename) {
  const sections = content.split(/\n(?=#{1,3} )/);
  const result = [];
  let category = "";

  for (const section of sections) {
    const trimmed = section.trim();
    if (trimmed.length < 30) continue;

    const match = trimmed.match(/^##\s+(.+)$/m);
    if (match) category = match[1].trim();

    if (trimmed.length > 1200) {
      const paragraphs = trimmed.split(/\n\n+/);
      let buffer = "";
      for (const para of paragraphs) {
        buffer += para + "\n\n";
        if (buffer.length > 600) {
          result.push({ text: buffer.trim(), source: filename, category });
          buffer = "";
        }
      }
      if (buffer.trim().length > 30) {
        result.push({ text: buffer.trim(), source: filename, category });
      }
    } else {
      result.push({ text: trimmed, source: filename, category });
    }
  }

  return result;
}

// Simple keyword search (TF-IDF style)

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
}

const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "are", "not",
  "can", "you", "your", "have", "will", "how", "what", "does", "when",
  "where", "but", "all", "get", "its", "our", "was", "been", "has",
]);

function getKeywords(text) {
  return tokenize(text).filter((w) => !STOPWORDS.has(w));
}

function scoreChunk(chunk, queryKeywords) {
  const words = getKeywords(chunk.text);
  const wordSet = new Set(words);
  let score = 0;

  for (const kw of queryKeywords) {
    if (wordSet.has(kw)) {
      score += 1 + Math.log(1 + words.filter((w) => w === kw).length);
    }
    for (const w of wordSet) {
      if (w.startsWith(kw) || kw.startsWith(w)) score += 0.3;
    }
  }

  return score;
}


// Find the most relevant doc chunks for a user's question.

export async function getRelevantContext(query, product = "cloudnote", category = null, topN = 4) {
  const chunks = await getProductChunks(product);
  if (chunks.length === 0) return "";

  let target = chunks;
  if (category) {
    const filtered = chunks.filter(
      (c) => c.category && c.category.toLowerCase().includes(category.toLowerCase())
    );
    if (filtered.length > 0) target = filtered;
  }

  const keywords = getKeywords(query);
  const scored = target
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, keywords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  if (scored.length === 0) {
    return target.slice(0, 3).map((c) => c.text).join("\n\n---\n\n");
  }

  return scored.map((item) => item.chunk.text).join("\n\n---\n\n");
}
