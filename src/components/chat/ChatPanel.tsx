import React from "react";
import type { ChatMessage, ConnectionStatus } from "../../types/chat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

interface ChatPanelProps {
  messages: ChatMessage[];
  isTyping: boolean;
  connectionStatus?: ConnectionStatus;
  onSendMessage: (content: string) => void;
  onClearChat: () => void;
  onClose: () => void;
  companionName?: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isTyping,
  connectionStatus = "connecting",
  onSendMessage,
  onClearChat,
  onClose,
  companionName = "Makima",
}) => {
  const getStatusDetails = () => {
    switch (connectionStatus) {
      case "online":
        return { label: "Local AI Online", className: "chat-status-dot--online" };
      case "offline":
        return { label: "Local AI Offline", className: "chat-status-dot--offline" };
      case "connecting":
      default:
        return { label: "Connecting", className: "chat-status-dot--connecting" };
    }
  };

  const status = getStatusDetails();

  return (
    <div className="chat-panel" role="region" aria-label="Conversation panel">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="chat-header">
        <div className="chat-header-info">
          <div className="chat-avatar-status">
            <span
              className={`chat-status-dot ${status.className}`}
              aria-hidden="true"
              title={status.label}
            />
          </div>
          <div className="chat-title-group">
            <h2 className="chat-title">{companionName}</h2>
            <span className="chat-subtitle">{status.label}</span>
          </div>
        </div>

        <div className="chat-header-actions">
          <button
            type="button"
            className="chat-action-btn chat-clear-btn"
            onClick={onClearChat}
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            <svg
              className="chat-action-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          <button
            type="button"
            className="chat-action-btn chat-close-btn"
            onClick={onClose}
            title="Close chat"
            aria-label="Close chat"
          >
            ✕
          </button>
        </div>
      </header>

      {/* ── Message Area ──────────────────────────────────────────────────── */}
      <div className="chat-body">
        <MessageList
          messages={messages}
          isTyping={isTyping}
          companionName={companionName}
        />
      </div>

      {/* ── Input Area ────────────────────────────────────────────────────── */}
      <footer className="chat-footer">
        <ChatInput onSend={onSendMessage} disabled={isTyping} />
      </footer>
    </div>
  );
};
