import { getToken, clearSession } from "./auth";
import type {
  ConversationDetail,
  ConversationListItem,
  ContactRow,
  Paginated,
  Settings,
  User,
} from "./types";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BACKEND_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "Unauthorized");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ user: User }>("/auth/me"),

  listConversations: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<Paginated<ConversationListItem>>(
      `/conversations${qs ? `?${qs}` : ""}`,
    );
  },

  getConversation: (id: string) =>
    request<ConversationDetail>(`/conversations/${id}`),

  updateConversation: (
    id: string,
    body: {
      status?: string;
      assignedTo?: string | null;
      tags?: string[];
    },
  ) =>
    request<unknown>(`/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  reply: (id: string, body: string) =>
    request<unknown>(`/conversations/${id}/reply`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  summarize: (id: string) =>
    request<{ summary: string | null }>(`/conversations/${id}/summarize`, {
      method: "POST",
    }),

  classify: (id: string) =>
    request<{ sentiment: string; intent: string; urgency: string }>(
      `/conversations/${id}/classify`,
      { method: "POST" },
    ),

  listContacts: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<Paginated<ContactRow>>(`/contacts${qs ? `?${qs}` : ""}`);
  },

  getSettings: () => request<Settings>("/settings"),

  updateSettings: (body: Partial<Settings>) =>
    request<Settings>("/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  whatsappStatus: () =>
    request<{ instance: string; state: string; exists: boolean }>(
      "/channels/whatsapp/status",
    ),

  whatsappConnect: () =>
    request<{ state: string; qr: string | null; pairingCode: string | null }>(
      "/channels/whatsapp/connect",
      { method: "POST" },
    ),

  whatsappLogout: () =>
    request<{ ok: boolean }>("/channels/whatsapp/logout", { method: "POST" }),
};

/**
 * Streams the AI draft for a conversation, invoking `onChunk` for each token.
 */
export async function streamDraft(
  conversationId: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const token = getToken();
  const res = await fetch(
    `${BACKEND_URL}/conversations/${conversationId}/draft`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!res.ok || !res.body) {
    throw new Error("Failed to start draft stream");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}

export { ApiError };
