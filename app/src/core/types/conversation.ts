import type { ChatMessage } from './provider.js';

export interface Conversation {
  id:        string;   // UUID
  title:     string;   // auto-generated from first user message
  messages:  ChatMessage[];
  providerId: string;
  model:     string;
  createdAt: number;   // epoch ms
  updatedAt: number;   // epoch ms
}

export interface ConversationSummary {
  id:        string;
  title:     string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}
