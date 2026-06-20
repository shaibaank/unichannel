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

// Primary: OpenRouter. Fallback: Groq. Both are OpenAI-compatible; only the
// model slug differs per provider.
const providers: Provider[] = [];

if (env.OPENROUTER_API_KEY) {
  providers.push({
    name: "openrouter",
    model: env.LLM_MODEL,
    client: new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: env.OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/omniinbox",
        "X-Title": "OmniInbox",
      },
    }),
  });
}

if (env.GROQ_API_KEY) {
  providers.push({
    name: "groq",
    model: env.GROQ_MODEL,
    client: new OpenAI({
      apiKey: env.GROQ_API_KEY,
      baseURL: env.GROQ_BASE_URL,
    }),
  });
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

/** Non-streaming completion with automatic provider fallback. */
export async function chatComplete(opts: CompletionOptions): Promise<string> {
  ensureProviders();
  let lastErr: unknown;
  for (const p of providers) {
    try {
      const res = await p.client.chat.completions.create({
        model: p.model,
        stream: false,
        ...opts,
      });
      return res.choices[0]?.message?.content ?? "";
    } catch (err) {
      lastErr = err;
    }
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
      return;
    } catch (err) {
      lastErr = err;
      if (emitted) throw err; // can't safely restart mid-stream
    }
  }
  throw lastErr ?? new Error("All LLM providers failed");
}

export const activeProviders = providers.map((p) => p.name);
