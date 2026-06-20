"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { ConversationListItem, Channel, ConversationStatus } from "@/lib/types";
import { ChannelIcon } from "./ChannelIcon";
import { StatusBadge } from "./StatusBadge";
import { timeAgo, sentimentEmoji, contactLabel } from "@/lib/format";

const CHANNELS: (Channel | "ALL")[] = ["ALL", "WHATSAPP", "EMAIL", "SMS"];
const STATUSES: (ConversationStatus | "ALL")[] = [
  "ALL",
  "OPEN",
  "PENDING",
  "SNOOZED",
  "CLOSED",
];

export function ConversationList() {
  const pathname = usePathname();
  const activeId = pathname.startsWith("/inbox/")
    ? pathname.split("/")[2]
    : null;

  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<Channel | "ALL">("ALL");
  const [status, setStatus] = useState<ConversationStatus | "ALL">("ALL");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const params: Record<string, string> = {};
    if (channel !== "ALL") params.channel = channel;
    if (status !== "ALL") params.status = status;
    try {
      const data = await api.listConversations(params);
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }, [channel, status]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Live updates via Socket.io — no polling.
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void load(), 250);
    };
    socket.on("new_message", refresh);
    socket.on("conversation_updated", refresh);
    return () => {
      socket.off("new_message", refresh);
      socket.off("conversation_updated", refresh);
    };
  }, [load]);

  return (
    <div className="flex h-full w-full flex-col border-r border-gray-200 bg-white md:w-80 lg:w-96">
      <div className="border-b border-gray-200 p-3">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">
          Conversations
        </h2>
        <div className="flex gap-2">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel | "ALL")}
            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs"
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c === "ALL" ? "All channels" : c}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as ConversationStatus | "ALL")
            }
            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "ALL" ? "All statuses" : s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-gray-400">
            <Loader2 className="animate-spin" size={16} /> Loading…
          </div>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">
            No conversations yet.
          </p>
        ) : (
          items.map((c) => (
            <Link
              key={c.id}
              href={`/inbox/${c.id}`}
              className={`block border-b border-gray-100 px-3 py-3 hover:bg-gray-50 ${
                activeId === c.id ? "bg-indigo-50" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <ChannelIcon channel={c.channel} />
                <span className="flex-1 truncate text-sm font-medium text-gray-800">
                  {contactLabel(c.contact)}
                </span>
                {c.sentiment && (
                  <span className="text-sm">
                    {sentimentEmoji(c.sentiment)}
                  </span>
                )}
                <span className="text-[10px] text-gray-400">
                  {timeAgo(c.updatedAt)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <p className="flex-1 truncate text-xs text-gray-500">
                  {c.lastMessage?.preview ?? "—"}
                </p>
                <StatusBadge status={c.status} />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
