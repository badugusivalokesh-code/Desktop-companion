import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatMessage, ChatResponse, ConnectionStatus } from "../types/chat";
import type { CharacterEmotion } from "../types/character";
import { localAIProvider, type ChatProvider } from "../services/chat";
import type { Memory } from "../types/memory";
import { memoryService } from "../services/memory/memoryService";
import { detectMemoryIntent } from "../services/memory/memoryDetector";
import { formatRelevantMemories } from "../services/memory/memoryRetriever";

export interface UseChatOptions {
  provider?: ChatProvider;
  onEmotionChange?: (emotion: CharacterEmotion) => void;
  initialGreeting?: string;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isTyping: boolean;
  connectionStatus: ConnectionStatus;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  refreshConnection: () => Promise<void>;
}

const DEFAULT_GREETING = "Hello. What are you working on today?";

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const {
    provider = localAIProvider,
    onEmotionChange,
    initialGreeting = DEFAULT_GREETING,
  } = options;

  const createInitialMessage = (): ChatMessage => ({
    id: `msg-${Date.now()}-init`,
    role: "companion",
    content: initialGreeting,
    timestamp: Date.now(),
    emotion: "neutral",
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => [createInitialMessage()]);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");

  // Keep a ref of current messages to prevent race conditions during async replies
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const refreshConnection = useCallback(async () => {
    if (provider.checkConnection) {
      try {
        const status = await provider.checkConnection();
        setConnectionStatus(status);
      } catch {
        setConnectionStatus("offline");
      }
    } else {
      setConnectionStatus("online");
    }
  }, [provider]);

  // Initial connection check & memory cleanup on mount
  useEffect(() => {
    refreshConnection();
    memoryService.cleanupExpired().catch(() => {});
  }, [refreshConnection]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };

      // Add user message immediately
      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      try {
        // Step 1: Query existing active memories
        let existingMemories: Memory[] = [];
        try {
          existingMemories = await memoryService.listMemories();
        } catch (memErr) {
          console.warn("[useChat] Could not load memories:", memErr);
        }

        // Step 2: Check for explicit memory intent
        const memoryDetection = detectMemoryIntent(trimmed, existingMemories);

        if (memoryDetection.isMemoryIntent) {
          // Explicit memory command: save or update memory and return in-character confirmation
          try {
            if (memoryDetection.targetIdToUpdate) {
              await memoryService.updateMemory({
                id: memoryDetection.targetIdToUpdate,
                content: memoryDetection.cleanContent,
                category: memoryDetection.category,
              });
            } else {
              await memoryService.createMemory({
                content: memoryDetection.cleanContent,
                category: memoryDetection.category,
              });
            }
          } catch (saveErr) {
            console.error("[useChat] Error persisting memory:", saveErr);
          }

          // Return concise confirmation directly without calling Ollama
          const companionMsg: ChatMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: "companion",
            content: memoryDetection.confirmationMessage,
            timestamp: Date.now(),
            emotion: "satisfied",
          };

          setMessages((prev) => [...prev, companionMsg]);
          if (onEmotionChange) {
            onEmotionChange("satisfied");
          }
          return;
        }

        // Step 3: Normal conversation — retrieve relevant memory context
        let memoryContext = "";
        try {
          memoryContext = formatRelevantMemories(trimmed, existingMemories);
        } catch (retrievalErr) {
          console.warn("[useChat] Memory retrieval failed:", retrievalErr);
        }

        // Step 4: Dispatch to LocalAIProvider with memory context
        const response: ChatResponse = await provider.sendMessage(
          trimmed,
          messagesRef.current,
          memoryContext || undefined
        );

        const companionMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: "companion",
          content: response.content,
          timestamp: Date.now(),
          emotion: response.emotion,
        };

        setMessages((prev) => [...prev, companionMsg]);

        // Refresh connection state in case it changed
        refreshConnection();

        // Notify character layer of emotion update
        if (response.emotion && onEmotionChange) {
          onEmotionChange(response.emotion);
        }
      } catch (err) {
        console.error("[useChat] Error generating response:", err);
        setConnectionStatus("offline");
      } finally {
        setIsTyping(false);
      }
    },
    [isTyping, onEmotionChange, provider, refreshConnection]
  );

  const clearChat = useCallback(() => {
    setMessages([createInitialMessage()]);
    setIsTyping(false);
    if (onEmotionChange) {
      onEmotionChange("neutral");
    }
  }, [initialGreeting, onEmotionChange]);

  return {
    messages,
    isTyping,
    connectionStatus,
    sendMessage,
    clearChat,
    refreshConnection,
  };
}
