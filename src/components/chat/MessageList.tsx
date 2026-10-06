import React, { useEffect, useRef } from "react";
import type { ChatMessage } from "../../types/chat";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

interface MessageListProps {
  messages: ChatMessage[];
  isTyping?: boolean;
  companionName?: string;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isTyping = false,
  companionName = "Makima",
}) => {
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div
      className="chat-message-list"
      role="log"
      aria-label="Conversation messages"
      aria-live="polite"
    >
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} companionName={companionName} />
      ))}
      {isTyping && <TypingIndicator name={companionName} />}
      <div ref={listEndRef} />
    </div>
  );
};

