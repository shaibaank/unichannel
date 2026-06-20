import { prisma } from "../lib/prisma.js";
import { env } from "../env.js";

const SINGLETON_ID = "singleton";

/**
 * Returns the settings singleton, creating it on first access. Defaults are
 * seeded from environment variables so the very first boot matches .env.
 */
export async function getSettings() {
  const existing = await prisma.setting.findUnique({
    where: { id: SINGLETON_ID },
    select: {
      id: true,
      autoReplyEnabled: true,
      llmSystemPrompt: true,
      whatsappEnabled: true,
      emailEnabled: true,
      smsEnabled: true,
      updatedAt: true,
    },
  });
  if (existing) return existing;

  return prisma.setting.create({
    data: {
      id: SINGLETON_ID,
      autoReplyEnabled: env.AUTO_REPLY_ENABLED,
      llmSystemPrompt: env.LLM_SYSTEM_PROMPT,
    },
    select: {
      id: true,
      autoReplyEnabled: true,
      llmSystemPrompt: true,
      whatsappEnabled: true,
      emailEnabled: true,
      smsEnabled: true,
      updatedAt: true,
    },
  });
}

export interface UpdateSettingsInput {
  autoReplyEnabled?: boolean;
  llmSystemPrompt?: string;
  whatsappEnabled?: boolean;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
}

export async function updateSettings(input: UpdateSettingsInput) {
  await getSettings(); // ensure row exists
  return prisma.setting.update({
    where: { id: SINGLETON_ID },
    data: input,
    select: {
      id: true,
      autoReplyEnabled: true,
      llmSystemPrompt: true,
      whatsappEnabled: true,
      emailEnabled: true,
      smsEnabled: true,
      updatedAt: true,
    },
  });
}

/** Always read the live system prompt from the DB (never hardcoded). */
export async function getSystemPrompt(): Promise<string> {
  const s = await getSettings();
  return s.llmSystemPrompt;
}
