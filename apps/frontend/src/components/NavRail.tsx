"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Inbox, Users, Settings, LogOut, QrCode } from "lucide-react";
import { clearSession } from "@/lib/auth";

const ITEMS = [
  { href: "/inbox", label: "Inbox", Icon: Inbox },
  { href: "/contacts", label: "Contacts", Icon: Users },
  { href: "/connect", label: "Connect", Icon: QrCode },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function NavRail() {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearSession();
    router.push("/login");
  }

  return (
    <nav
      className="flex shrink-0 items-center gap-1 border-gray-200 bg-white
                 md:h-full md:w-16 md:flex-col md:border-r md:py-4
                 max-md:fixed max-md:bottom-0 max-md:left-0 max-md:z-20 max-md:w-full
                 max-md:justify-around max-md:border-t max-md:py-2"
    >
      <div className="mb-2 hidden md:block">
        <Inbox className="text-indigo-600" />
      </div>
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-[10px] font-medium
              ${active ? "bg-indigo-50 text-indigo-600" : "text-gray-500 hover:bg-gray-100"}`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        );
      })}
      <button
        onClick={logout}
        title="Log out"
        className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-[10px] font-medium text-gray-500 hover:bg-gray-100 md:mt-auto"
      >
        <LogOut size={20} />
        <span>Logout</span>
      </button>
    </nav>
  );
}
