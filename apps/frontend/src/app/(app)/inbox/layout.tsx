"use client";
import { usePathname } from "next/navigation";
import { ConversationList } from "@/components/ConversationList";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const threadOpen = pathname.startsWith("/inbox/");

  return (
    <div className="flex h-full w-full">
      {/* List: hidden on mobile when a thread is open */}
      <div className={`${threadOpen ? "hidden md:flex" : "flex"} h-full`}>
        <ConversationList />
      </div>
      {/* Thread area: hidden on mobile when no thread is open */}
      <div className={`${threadOpen ? "flex" : "hidden md:flex"} min-h-0 flex-1`}>
        {children}
      </div>
    </div>
  );
}
