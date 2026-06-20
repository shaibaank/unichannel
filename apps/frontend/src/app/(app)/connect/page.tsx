"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

type State = "open" | "connecting" | "close" | "unknown" | "loading";

export default function ConnectPage() {
  const [state, setState] = useState<State>("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.whatsappStatus();
      setState((s.state as State) ?? "unknown");
    } catch {
      setState("unknown");
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Live QR refresh + connection state via Socket.io (no polling).
  useEffect(() => {
    const socket = getSocket();
    const onQr = (p: { base64: string | null; pairingCode: string | null }) => {
      if (p.base64) setQr(p.base64);
      if (p.pairingCode) setPairingCode(p.pairingCode);
      setState("connecting");
    };
    const onStatus = (p: { state: string }) => {
      setState((p.state as State) ?? "unknown");
      if (p.state === "open") {
        setQr(null);
        setPairingCode(null);
      }
    };
    socket.on("whatsapp_qr", onQr);
    socket.on("whatsapp_status", onStatus);
    return () => {
      socket.off("whatsapp_qr", onQr);
      socket.off("whatsapp_status", onStatus);
    };
  }, []);

  async function connect() {
    setWorking(true);
    setError(null);
    try {
      const res = await api.whatsappConnect();
      setState((res.state as State) ?? "connecting");
      setQr(res.qr);
      setPairingCode(res.pairingCode);
    } catch (err) {
      setError((err as Error).message || "Failed to connect");
    } finally {
      setWorking(false);
    }
  }

  async function disconnect() {
    setWorking(true);
    try {
      await api.whatsappLogout();
      setQr(null);
      setPairingCode(null);
      setState("close");
    } catch (err) {
      setError((err as Error).message || "Failed to log out");
    } finally {
      setWorking(false);
    }
  }

  const connected = state === "open";

  return (
    <div className="mx-auto h-full max-w-xl overflow-y-auto p-4 md:p-8">
      <div className="mb-6 flex items-center gap-2">
        <MessageCircle size={22} color="#25D366" />
        <h1 className="text-xl font-semibold text-gray-800">Connect WhatsApp</h1>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        {/* Status row */}
        <div className="mb-5 flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              connected
                ? "bg-green-500"
                : state === "connecting"
                  ? "bg-amber-400"
                  : "bg-gray-300"
            }`}
          />
          <span className="text-sm font-medium text-gray-700">
            {state === "loading"
              ? "Checking status…"
              : connected
                ? "Connected"
                : state === "connecting"
                  ? "Waiting for scan…"
                  : "Not connected"}
          </span>
          <button
            onClick={refreshStatus}
            className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {connected ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 size={56} className="text-green-500" />
            <p className="text-sm text-gray-600">
              Your WhatsApp is linked. Incoming messages will appear in the
              inbox automatically.
            </p>
            <button
              onClick={disconnect}
              disabled={working}
              className="mt-2 rounded-lg border border-red-200 px-4 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {qr ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr}
                  alt="WhatsApp QR code"
                  className="h-64 w-64 rounded-lg border border-gray-200"
                />
                <p className="text-center text-sm text-gray-600">
                  Open <strong>WhatsApp</strong> on your phone ▸{" "}
                  <strong>Settings</strong> ▸ <strong>Linked devices</strong> ▸{" "}
                  <strong>Link a device</strong>, then scan this code.
                </p>
                {pairingCode && (
                  <p className="text-xs text-gray-500">
                    Or use pairing code:{" "}
                    <span className="font-mono font-semibold text-gray-700">
                      {pairingCode}
                    </span>
                  </p>
                )}
                <button
                  onClick={connect}
                  disabled={working}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:underline disabled:opacity-60"
                >
                  <RefreshCw size={13} /> Generate a new code
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-sm text-gray-500">
                  Link your WhatsApp account to start receiving messages in the
                  inbox.
                </p>
                <button
                  onClick={connect}
                  disabled={working}
                  className="flex items-center gap-2 rounded-lg bg-[#25D366] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1ebe5b] disabled:opacity-60"
                >
                  {working ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <MessageCircle size={16} />
                  )}
                  Connect WhatsApp
                </button>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
