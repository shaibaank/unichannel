"use client";
import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { api } from "@/lib/api";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api.getSettings().then(setSettings);
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.updateSettings({
        autoReplyEnabled: settings.autoReplyEnabled,
        llmSystemPrompt: settings.llmSystemPrompt,
        whatsappEnabled: settings.whatsappEnabled,
        emailEnabled: settings.emailEnabled,
        smsEnabled: settings.smsEnabled,
      });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        <Loader2 className="animate-spin" size={16} />
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto p-4 md:p-8">
      <h1 className="mb-6 text-xl font-semibold text-gray-800">Settings</h1>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <Toggle
          label="Enable auto-reply"
          description="Let the bot draft and send replies automatically for non-urgent messages."
          checked={settings.autoReplyEnabled}
          onChange={(v) => setSettings({ ...settings, autoReplyEnabled: v })}
        />
      </section>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <label className="mb-2 block text-sm font-semibold text-gray-700">
          LLM system prompt
        </label>
        <textarea
          value={settings.llmSystemPrompt}
          onChange={(e) =>
            setSettings({ ...settings, llmSystemPrompt: e.target.value })
          }
          rows={5}
          className="w-full resize-none rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-indigo-500"
        />
        <p className="mt-1 text-xs text-gray-400">
          Used for all reply drafts and auto-replies. Changes apply immediately,
          no redeploy needed.
        </p>
      </section>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Active channels
        </h2>
        <Toggle
          label="WhatsApp"
          checked={settings.whatsappEnabled}
          onChange={(v) => setSettings({ ...settings, whatsappEnabled: v })}
        />
        <Toggle
          label="Email"
          checked={settings.emailEnabled}
          onChange={(v) => setSettings({ ...settings, emailEnabled: v })}
        />
        <Toggle
          label="SMS"
          checked={settings.smsEnabled}
          onChange={(v) => setSettings({ ...settings, smsEnabled: v })}
        />
      </section>

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="animate-spin" size={16} />
        ) : saved ? (
          <Check size={16} />
        ) : null}
        {saved ? "Saved" : "Save changes"}
      </button>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-2">
      <span>
        <span className="block text-sm font-medium text-gray-800">{label}</span>
        {description && (
          <span className="block text-xs text-gray-400">{description}</span>
        )}
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-indigo-600" : "bg-gray-300"
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}
