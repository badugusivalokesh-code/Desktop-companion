import type { CharacterEmotion } from "./character";

export type MessageRole = "user" | "companion";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  emotion?: CharacterEmotion;
}

export interface ChatResponse {
  content: string;
  emotion: CharacterEmotion;
}

