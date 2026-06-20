import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";

// Load the repo-root .env when running outside Docker (dev / migrations).
// In containers, env vars come from docker-compose `env_file`, so a missing
// file here is fine.
try {
  const here = dirname(fileURLToPath(import.meta.url));
  const rootEnv = resolve(here, "../../../.env");
  if (existsSync(rootEnv) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(rootEnv);
  }
} catch {
  // ignore — rely on process.env
}

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  BACKEND_PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  JWT_SECRET: z.string().default("dev_insecure_secret_change_me"),

  // Evolution API (WhatsApp)
  EVOLUTION_API_URL: z.string().default("http://localhost:8080"),
  EVOLUTION_API_KEY: z.string().default(""),
  EVOLUTION_INSTANCE_NAME: z.string().default("omni-inbox"),
  // URL Evolution (in Docker) should call back to reach this backend.
  WHATSAPP_WEBHOOK_URL: z
    .string()
    .default("http://host.docker.internal:3001/webhook/whatsapp"),

  // Email
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.coerce.number().default(993),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),

  // Twilio (optional)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  // LLM via OpenRouter (primary) with Groq fallback
  OPENROUTER_API_KEY: z.string().default(""),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  LLM_MODEL: z.string().default("meta-llama/llama-3.3-70b-instruct"),
  GROQ_API_KEY: z.string().default(""),
  GROQ_BASE_URL: z.string().default("https://api.groq.com/openai/v1"),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),

  // App
  AUTO_REPLY_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  LLM_SYSTEM_PROMPT: z
    .string()
    .default(
      "You are a helpful customer support agent. Be concise, friendly, and professional.",
    ),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
