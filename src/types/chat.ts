import type { CharacterEmotion } from "./character";

export type MessageRole = "user" | "companion";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  emotion?: CharacterEmotion;
  /** File-derived responses stay visible in this chat but are not reused as model context. */
  excludeFromProviderContext?: boolean;
}

export interface ChatResponse {
  content: string;
  emotion: CharacterEmotion;
}

export type ConnectionStatus = "connecting" | "online" | "offline";
