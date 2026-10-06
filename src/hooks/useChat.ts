import { useState, useCallback, useRef } from "react";
import type { ChatMessage, ChatResponse } from "../types/chat";
import type { CharacterEmotion } from "../types/character";
import { mockChatProvider, type ChatProvider } from "../services/chat/mockChatProvider";

export interface UseChatOptions {
  provider?: ChatProvider;
  onEmotionChange?: (emotion: CharacterEmotion) => void;
  initialGreeting?: string;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isTyping: boolean;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
}

const DEFAULT_GREETING = "Hello. What are you working on today?";

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const {
    provider = mockChatProvider,
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

  // Keep a ref of current messages to prevent race conditions during async replies
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

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
        const response: ChatResponse = await provider.sendMessage(trimmed, messagesRef.current);

        const companionMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: "companion",
          content: response.content,
          timestamp: Date.now(),
          emotion: response.emotion,
        };

        setMessages((prev) => [...prev, companionMsg]);

        // Notify character layer of emotion update
        if (response.emotion && onEmotionChange) {
          onEmotionChange(response.emotion);
        }
      } catch (err) {
        console.error("[useChat] Error generating response:", err);
      } finally {
        setIsTyping(false);
      }
    },
    [isTyping, onEmotionChange, provider]
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
    sendMessage,
    clearChat,
  };
}

