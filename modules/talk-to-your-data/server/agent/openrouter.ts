// OpenRouter client (OpenAI-compatible). Gated on OPENROUTER_API_KEY: if unset the chat
// feature is disabled and the route reports "not configured" rather than crashing — same
// pattern as the optional OIDC auth. Per MI-stack rules the key is a PER-APP key with a
// monthly cap (see /stack §14), injected via Coolify env; it is server-side only and never
// sent to the client.
//
// ── TEMPLATE: nothing here is app-specific except the two HTTP headers below. ──
import OpenAI from "openai";

const KEY = process.env.OPENROUTER_API_KEY;

export const openrouterReady = !!KEY;

export const client = KEY
  ? new OpenAI({
      apiKey: KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        // __EDIT__: your app's public URL + name (OpenRouter shows these in usage analytics).
        "HTTP-Referer": process.env.APP_PUBLIC_URL || "https://__YOUR_APP__.mi2.com.mx",
        "X-Title": process.env.APP_NAME || "__your-app__",
      },
    })
  : null;

// Cheap-first with explicit fallback. These defaults are real, current OpenRouter IDs (1M
// context, tool calling). Override per-deploy via env. We send ONE `model` per request and
// fall back in code (callModel in loop.ts) — do NOT pass model+models together, some
// providers reject it.
//
// DeepSeek primary: cheap AND reliable at tool calling. Gemini flash-lite is the cheapest but
// frequently returns MALFORMED_FUNCTION_CALL on tool turns, so it's demoted to LAST fallback.
// (See loop.ts synthesize() for why we still force the final answer with NO tools.)
export const MODEL_PRIMARY = process.env.AGENT_MODEL_PRIMARY || "deepseek/deepseek-v4-flash";
export const MODEL_FALLBACKS = (
  process.env.AGENT_MODEL_FALLBACKS || "openai/gpt-4.1-mini,google/gemini-2.5-flash-lite"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
export const MODELS = [MODEL_PRIMARY, ...MODEL_FALLBACKS];

export const AGENT_MAX_ITERATIONS = Number(process.env.AGENT_MAX_ITERATIONS ?? 8);
export const AGENT_DAILY_COST_CAP_USD = Number(process.env.AGENT_DAILY_COST_CAP_USD ?? 5);
