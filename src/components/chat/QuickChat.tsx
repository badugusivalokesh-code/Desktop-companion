import React, { useState, useRef, useEffect, useCallback } from "react";
import type { ChatMessage, ConnectionStatus } from "../../types/chat";
import { TypingIndicator } from "./TypingIndicator";
import "./QuickChat.css";

interface QuickChatProps {
  messages: ChatMessage[];
  isTyping: boolean;
  connectionStatus?: ConnectionStatus;
  onSendMessage: (content: string) => void;
  onClose: () => void;
  companionName?: string;
}

/**
 * QuickChat — compact single-line chat bar that floats above Makima.
 *
 * Requirements:
 * - Single-line input with placeholder "Talk to Makima..."
 * - Automatically focused when opened
 * - Enter sends, Escape closes/hides the input
 * - Empty input cannot send
 * - Typing indicator appears while awaiting response
 * - Displays the real latest response in a compact speech bubble
 * - Conversation history is maintained internally by useChat but not rendered as a large panel
 */
export const QuickChat: React.FC<QuickChatProps> = ({
  messages,
  isTyping,
  connectionStatus = "connecting",
  onSendMessage,
  onClose,
  companionName = "Makima",
}) => {
  const [text, setText] = useState("");
  const [dismissedMsgId, setDismissedMsgId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Automatically focus the input when opened
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // When Makima finishes typing, re-focus the input
  useEffect(() => {
    if (!isTyping) {
      inputRef.current?.focus();
    }
  }, [isTyping]);

  // Find the latest response from the companion, excluding initial greeting unless user has chatted
  const hasUserMessages = messages.some((m) => m.role === "user");
  const latestCompanionMsg = [...messages]
    .reverse()
    .find((m) => m.role === "companion" && (!m.id.endsWith("-init") || hasUserMessages));

  const showResponseBubble =
    hasUserMessages &&
    latestCompanionMsg &&
    latestCompanionMsg.id !== dismissedMsgId &&
    !isTyping;

  const canSend = text.trim().length > 0 && !isTyping;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSendMessage(text.trim());
    setText("");
    setDismissedMsgId(null);
  }, [canSend, onSendMessage, text]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSend();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [handleSend, onClose]
  );

  const statusClass =
    connectionStatus === "online"
      ? "quick-chat-status--online"
      : connectionStatus === "offline"
      ? "quick-chat-status--offline"
      : "quick-chat-status--connecting";

  return (
    <div className="quick-chat-wrapper" role="region" aria-label="Quick chat with Makima">
      {/* ── Single-line input bar ────────────────────────────────────────── */}
      <div className={`quick-input-bar ${statusClass}`}>
        <span
          className={`quick-status-dot ${statusClass}`}
          title={
            connectionStatus === "online"
              ? "Local AI Online"
              : connectionStatus === "offline"
              ? "Local AI Offline"
              : "Connecting..."
          }
        />
        <input
          ref={inputRef}
          type="text"
          className="quick-input-field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Talk to Makima..."
          disabled={isTyping}
          aria-label="Talk to Makima..."
          autoComplete="off"
          spellCheck={false}
        />
        {canSend && (
          <button
            type="button"
            className="quick-send-btn"
            onClick={handleSend}
            title="Send (Enter)"
            aria-label="Send message"
          >
            ↵
          </button>
        )}
      </div>

      {/* ── Typing indicator ─────────────────────────────────────────────── */}
      {isTyping && (
        <div className="quick-typing-bubble" aria-live="polite">
          <TypingIndicator name={companionName} />
        </div>
      )}

      {/* ── Latest response bubble (compact floating speech bubble) ───────── */}
      {showResponseBubble && latestCompanionMsg && (
        <div className="quick-response-bubble" aria-live="polite">
          <div className="quick-response-header">
            <span className="quick-response-name">{companionName}</span>
            <button
              type="button"
              className="quick-response-dismiss"
              onClick={() => setDismissedMsgId(latestCompanionMsg.id)}
              title="Dismiss"
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
          <p className="quick-response-text">{latestCompanionMsg.content}</p>
        </div>
      )}
    </div>
  );
};
