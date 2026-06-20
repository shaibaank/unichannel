"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Loader2,
  Send,
  Sparkles,
  FileText,
} from "lucide-react";
import { api, streamDraft } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type {
  ConversationDetail,
  ConversationStatus,
  Message,
} from "@/lib/types";
import { ChannelIcon } from "./ChannelIcon";
import { StatusBadge } from "./StatusBadge";
import { contactLabel, formatTime, sentimentEmoji } from "@/lib/format";

const STATUS_OPTIONS: ConversationStatus[] = [
  "OPEN",
  "PENDING",
  "SNOOZED",
  "CLOSED",
];

export function Thread({ id }: { id: string }) {
  const [conv, setConv] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const data = await api.getConversation(id);
    setConv(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Live updates for this conversation.
  useEffect(() => {
    const socket = getSocket();
    const onNew = (payload: { conversationId: string }) => {
      if (payload.conversationId === id) void load();
    };
    const onUpdated = (payload: { conversationId: string }) => {
      if (payload.conversationId === id) void load();
    };
    socket.on("new_message", onNew);
    socket.on("conversation_updated", onUpdated);
    return () => {
      socket.off("new_message", onNew);
      socket.off("conversation_updated", onUpdated);
    };
  }, [id, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages.length]);

  async function onSend() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await api.reply(id, body);
      setText("");
      await load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function onDraft() {
    if (drafting) return;
    setDrafting(true);
    setText("");
    try {
      await streamDraft(id, (chunk) => setText((prev) => prev + chunk));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  async function onStatusChange(status: ConversationStatus) {
    await api.updateConversation(id, { status });
    await load();
  }

  async function onSummarize() {
    if (summarizing) return;
    setSummarizing(true);
    try {
      await api.summarize(id);
      await load();
    } finally {
      setSummarizing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-gray-400">
        <Loader2 className="animate-spin" size={16} /> Loading…
      </div>
    );
  }
  if (!conv) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
        Conversation not found.
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-gray-50">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <Link href="/inbox" className="md:hidden">
          <ArrowLeft size={20} className="text-gray-500" />
        </Link>
        <ChannelIcon channel={conv.channel} size={20} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-gray-800">
              {contactLabel(conv.contact)}
            </span>
            {conv.sentiment && <span>{sentimentEmoji(conv.sentiment)}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
            <span>{conv.channel}</span>
            {conv.assignedTo && <span>· {conv.assignedTo}</span>}
            {conv.tags.map((t) => (
              <span
                key={t.id}
                className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600"
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
        <StatusBadge status={conv.status} />
        <select
          value={conv.status}
          onChange={(e) => onStatusChange(e.target.value as ConversationStatus)}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </header>

      {conv.summary && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <strong>Summary:</strong> {conv.summary}
        </div>
      )}

      {/* Messages */}
      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {conv.messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <footer className="border-t border-gray-200 bg-white p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Type a reply…"
          className="w-full resize-none rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-indigo-500"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSend();
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={onDraft}
            disabled={drafting}
            className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
          >
            {drafting ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <Sparkles size={14} />
            )}
            Draft with AI
          </button>
          <button
            onClick={onSummarize}
            disabled={summarizing}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-60"
          >
            {summarizing ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <FileText size={14} />
            )}
            Summarize
          </button>
          <button
            onClick={onSend}
            disabled={sending || !text.trim()}
            className="ml-auto flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {sending ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <Send size={14} />
            )}
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const outbound = message.direction === "OUTBOUND";
  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          outbound
            ? "bg-indigo-600 text-white"
            : "bg-white text-gray-800 border border-gray-200"
        }`}
      >
        {message.sentBy === "BOT" && (
          <div
            className={`mb-1 flex items-center gap-1 text-[10px] font-semibold ${
              outbound ? "text-indigo-100" : "text-gray-400"
            }`}
          >
            <Bot size={12} /> Bot
          </div>
        )}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <div
          className={`mt-1 text-[10px] ${
            outbound ? "text-indigo-200" : "text-gray-400"
          }`}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
