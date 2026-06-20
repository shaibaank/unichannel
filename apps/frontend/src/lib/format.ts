export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString();
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function sentimentEmoji(sentiment: string | null): string {
  switch (sentiment) {
    case "POSITIVE":
      return "😊";
    case "NEGATIVE":
      return "😟";
    case "NEUTRAL":
      return "😐";
    default:
      return "";
  }
}

export function contactLabel(contact: {
  name: string | null;
  phone: string | null;
  email: string | null;
}): string {
  return contact.name || contact.phone || contact.email || "Unknown";
}
