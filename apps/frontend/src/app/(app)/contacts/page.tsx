"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { ContactRow } from "@/lib/types";
import { formatTime } from "@/lib/format";

export default function ContactsPage() {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const data = await api.listContacts(q ? { search: q } : {});
      setRows(data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto p-4 md:p-8">
      <h1 className="mb-4 text-xl font-semibold text-gray-800">Contacts</h1>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
        <Search size={16} className="text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or email…"
          className="w-full text-sm outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Phone</th>
              <th className="hidden px-4 py-2 sm:table-cell">Email</th>
              <th className="px-4 py-2">Threads</th>
              <th className="hidden px-4 py-2 md:table-cell">Added</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  <Loader2 className="mx-auto animate-spin" size={16} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  No contacts found.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {c.name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{c.phone ?? "—"}</td>
                  <td className="hidden px-4 py-2 text-gray-600 sm:table-cell">
                    {c.email ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {c.conversationCount}
                  </td>
                  <td className="hidden px-4 py-2 text-gray-400 md:table-cell">
                    {formatTime(c.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
