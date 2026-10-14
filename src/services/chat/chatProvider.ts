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
  sendMessage(
    message: string,
    history?: ChatMessage[],
    memoryContext?: string
  ): Promise<ChatResponse>;

  /**
   * Optional health/connectivity check for local runtime providers.
   */
  checkConnection?(): Promise<ConnectionStatus>;

  /** Optional local vision capability used by explicit screen awareness. */
  analyzeImage?(
    imageDataUrl: string,
    prompt: string,
    history?: ChatMessage[]
  ): Promise<ChatResponse>;

  /** Optional local-only analysis of explicitly selected, bounded file text. */
  analyzeFileContext?(
    context: string,
    request: string,
    /** Retained for provider compatibility; file analysis must ignore it. */
    history?: ChatMessage[]
  ): Promise<ChatResponse>;
}
