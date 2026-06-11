import { callGroq } from "./providers/groq.js";
import { callOpenAI } from "./providers/openai.js";

export async function callAI(messages) {
  const providers = [];
  if (process.env.GROQ_API_KEY) {
    providers.push({ name: "groq", fn: callGroq });
  }
  if (process.env.OPENAI_API_KEY) {
    providers.push({ name: "openai", fn: callOpenAI });
  }

  // Fallback to trying both to yield configuration error details if none are set
  if (providers.length === 0) {
    providers.push({ name: "groq", fn: callGroq });
    providers.push({ name: "openai", fn: callOpenAI });
  }

  let lastError;

  for (const provider of providers) {
    try {
      const text = await provider.fn(messages);
      return { text, provider: provider.name };
    } catch (err) {
      console.warn(`${provider.name} failed: ${err.message}`);
      lastError = err;
    }
  }

  throw new Error("AI service temporarily unavailable. Please try again.");
}