import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { env } from "../env.js";

interface Provider {
  name: string;
  client: OpenAI;
  model: string;
}

// Fast per-request timeout and NO SDK-level retries — we do our own fast
// failover across providers/models so a throttled model never causes a
// minute-long wait.
const REQUEST_TIMEOUT_MS = 18000;

const providers: Provider[] = [];

if (env.OPENROUTER_API_KEY) {
  const openrouter = new OpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: env.OPENROUTER_BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/omniinbox",
      "X-Title": "OmniInbox",
    },
    maxRetries: 0,
    timeout: REQUEST_TIMEOUT_MS,
  });
  // Primary model first, then additional free models for availability.
  const models = [
    env.LLM_MODEL,
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "meta-llama/llama-3.2-3b-instruct:free",
  ].filter((m, i, a) => m && a.indexOf(m) === i);
  for (const model of models) {
    providers.push({ name: `openrouter:${model}`, client: openrouter, model });
  }
}

if (env.GROQ_API_KEY) {
  const groq = new OpenAI({
    apiKey: env.GROQ_API_KEY,
    baseURL: env.GROQ_BASE_URL,
    maxRetries: 0,
    timeout: REQUEST_TIMEOUT_MS,
  });
  providers.push({ name: `groq:${env.GROQ_MODEL}`, client: groq, model: env.GROQ_MODEL });
}

type CompletionOptions = Omit<
  ChatCompletionCreateParamsNonStreaming,
  "model" | "stream" | "messages"
> & { messages: ChatCompletionMessageParam[] };

function ensureProviders() {
  if (providers.length === 0) {
    throw new Error(
      "No LLM provider configured. Set OPENROUTER_API_KEY and/or GROQ_API_KEY.",
    );
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Non-streaming completion with fast failover across every provider/model.
 * Tries each provider once per round; up to `rounds` rounds with a short
 * delay, so a transient 429 wave can recover without a long wait.
 */
export async function chatComplete(
  opts: CompletionOptions,
  rounds = 2,
): Promise<string> {
  ensureProviders();
  let lastErr: unknown;
  for (let round = 0; round < rounds; round++) {
    for (const p of providers) {
      try {
        const res = await p.client.chat.completions.create({
          model: p.model,
          stream: false,
          ...opts,
        });
        const content = res.choices[0]?.message?.content;
        if (content && content.trim()) return content;
      } catch (err) {
        lastErr = err;
      }
    }
    if (round < rounds - 1) await sleep(1500);
  }
  throw lastErr ?? new Error("All LLM providers failed");
}

/**
 * Streaming completion with provider fallback. Fallback only kicks in if a
 * provider fails before emitting any tokens.
 */
export async function* chatStream(
  opts: CompletionOptions,
): AsyncGenerator<string> {
  ensureProviders();
  let lastErr: unknown;
  for (const p of providers) {
    let emitted = false;
    try {
      const stream = await p.client.chat.completions.create({
        model: p.model,
        stream: true,
        ...opts,
      });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          emitted = true;
          yield delta;
        }
      }
      if (emitted) return;
    } catch (err) {
      lastErr = err;
      if (emitted) throw err; // can't safely restart mid-stream
    }
  }
  if (!lastErr) return;
  throw lastErr;
}

export const activeProviders = providers.map((p) => p.name);
