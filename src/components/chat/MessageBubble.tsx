import React from "react";
import type { ChatMessage } from "../../types/chat";

interface MessageBubbleProps {
  message: ChatMessage;
  companionName?: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  companionName = "Makima",
}) => {
  const isUser = message.role === "user";
  const senderLabel = isUser ? "You" : companionName;

  const timeString = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`chat-msg-row ${isUser ? "chat-msg-row--user" : "chat-msg-row--companion"}`}
    >
      <div className="chat-msg-sender">
        <span>{senderLabel}</span>
        <span className="chat-msg-time">{timeString}</span>
      </div>
      <div
        className={`chat-msg-bubble ${isUser ? "chat-msg-bubble--user" : "chat-msg-bubble--companion"}`}
      >
        <p className="chat-msg-text">{message.content}</p>
      </div>
    </div>
  );
};

