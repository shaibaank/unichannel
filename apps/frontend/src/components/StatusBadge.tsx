import type { ConversationStatus } from "@/lib/types";

const STYLES: Record<ConversationStatus, string> = {
  OPEN: "bg-green-100 text-green-700",
  PENDING: "bg-amber-100 text-amber-700",
  SNOOZED: "bg-purple-100 text-purple-700",
  CLOSED: "bg-gray-200 text-gray-600",
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
