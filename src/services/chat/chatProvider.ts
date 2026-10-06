import type { ChatMessage, ChatResponse, ConnectionStatus } from "../../types/chat";

/**
 * Standard provider interface for desktop companion conversations.
 *
 * Implemented by:
 * - LocalAIProvider: Communicates with local Ollama runtime over HTTP.
 * - MockChatProvider: Fallback and testing provider with simulated delays.
 */
export interface ChatProvider {
  /**
   * Sends a user message along with prior conversation history,
   * returning an in-character response and associated character emotion.
   */
  sendMessage(message: string, history?: ChatMessage[]): Promise<ChatResponse>;

  /**
   * Optional health/connectivity check for local runtime providers.
   */
  checkConnection?(): Promise<ConnectionStatus>;
}

