export type Channel = "WHATSAPP" | "EMAIL" | "SMS";
export type ConversationStatus = "OPEN" | "CLOSED" | "PENDING" | "SNOOZED";
export type Direction = "INBOUND" | "OUTBOUND";
export type SentBy = "HUMAN" | "BOT" | "AGENT";
export type Role = "ADMIN" | "AGENT";

export interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface Tag {
  id: string;
  name: string;
}

export interface ConversationListItem {
  id: string;
  channel: Channel;
  status: ConversationStatus;
  sentiment: string | null;
  assignedTo: string | null;
  summary: string | null;
  updatedAt: string;
  contact: Contact;
  tags: Tag[];
  lastMessage: {
    preview: string;
    direction: Direction;
    timestamp: string;
  } | null;
}

export interface Message {
  id: string;
  direction: Direction;
  body: string;
  mediaUrl: string | null;
  sentBy: SentBy;
  timestamp: string;
}

export interface ConversationDetail {
  id: string;
  channel: Channel;
  status: ConversationStatus;
  sentiment: string | null;
  assignedTo: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  contact: Contact;
  tags: Tag[];
  messages: Message[];
}

export interface Paginated<T> {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
}

export interface ContactRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string;
  conversationCount: number;
}

export interface Settings {
  id: string;
  autoReplyEnabled: boolean;
  llmSystemPrompt: string;
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  role: Role;
}
