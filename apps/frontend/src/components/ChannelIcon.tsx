import { MessageCircle, Mail, Smartphone } from "lucide-react";
import type { Channel } from "@/lib/types";

const MAP: Record<
  Channel,
  { Icon: typeof MessageCircle; color: string; label: string }
> = {
  WHATSAPP: { Icon: MessageCircle, color: "#25D366", label: "WhatsApp" },
  EMAIL: { Icon: Mail, color: "#2563EB", label: "Email" },
  SMS: { Icon: Smartphone, color: "#F97316", label: "SMS" },
};

export function ChannelIcon({
  channel,
  size = 18,
}: {
  channel: Channel;
  size?: number;
}) {
  const { Icon, color, label } = MAP[channel];
  return (
    <span title={label} className="inline-flex items-center" aria-label={label}>
      <Icon size={size} color={color} strokeWidth={2.2} />
    </span>
  );
}
