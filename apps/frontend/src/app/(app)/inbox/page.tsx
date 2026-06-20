import { MessagesSquare } from "lucide-react";

export default function InboxEmptyState() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-gray-400">
      <MessagesSquare size={48} strokeWidth={1.5} />
      <p className="mt-3 text-sm">Select a conversation to get started.</p>
    </div>
  );
}
