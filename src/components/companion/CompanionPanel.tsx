import React from "react";
import type { ChatMessage } from "../../types/chat";
import { ChatPanel } from "../chat/ChatPanel";
import "./CompanionPanel.css";
import "../chat/chat.css";

export type PanelMode = "chat" | "settings";

interface CompanionPanelProps {
  /** Whether the panel is currently visible. */
  open: boolean;
  /** Which content to display. Defaults to "chat". */
  mode?: PanelMode;
  /** Called when the user clicks the close button. */
  onClose: () => void;
  /** In-memory chat messages */
  messages: ChatMessage[];
  /** Whether Makima is currently typing a response */
  isTyping: boolean;
  /** Callback to send a user message */
  onSendMessage: (content: string) => void;
  /** Callback to reset/clear conversation */
  onClearChat: () => void;
  /** Companion name to display */
  companionName?: string;
}

/**
 * CompanionPanel — manages chat conversation and settings views.
 *
 * In Phase 2:
 * - mode === "chat" renders the interactive ChatPanel.
 * - mode === "settings" renders the settings placeholder.
 */
const CompanionPanel: React.FC<CompanionPanelProps> = ({
  open,
  mode = "chat",
  onClose,
  messages,
  isTyping,
  onSendMessage,
  onClearChat,
  companionName = "Makima",
}) => {
  if (!open) return null;

  return (
    <div className="panel-overlay" aria-live="polite">
      {mode === "chat" ? (
        <div className="companion-chat-wrapper">
          <ChatPanel
            messages={messages}
            isTyping={isTyping}
            onSendMessage={onSendMessage}
            onClearChat={onClearChat}
            onClose={onClose}
            companionName={companionName}
          />
        </div>
      ) : (
        <div
          className="companion-panel"
          role="dialog"
          aria-label="Settings panel"
          aria-modal="false"
        >
          {/* ── Settings Header ────────────────────────────────────────── */}
          <div className="panel-header">
            <h2 className="panel-title">Settings</h2>
            <span className="panel-badge">Phase 2</span>
            <button
              className="panel-close"
              onClick={onClose}
              aria-label="Close settings"
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* ── Settings Body ──────────────────────────────────────────── */}
          <div className="panel-settings">
            <div className="settings-row">
              <span className="settings-icon">🎭</span>
              <span className="settings-label">Character</span>
              <span className="settings-value">Makima</span>
            </div>
            <div className="settings-row">
              <span className="settings-icon">💬</span>
              <span className="settings-label">Chat Engine</span>
              <span className="settings-value">Mock (Phase 2)</span>
            </div>
            <div className="settings-row">
              <span className="settings-icon">🪟</span>
              <span className="settings-label">Always on top</span>
              <span className="settings-value">On</span>
            </div>
            <p className="panel-placeholder-hint">
              — Local AI engine coming in Phase 3 —
            </p>
          </div>

          {/* ── Footer ────────────────────────────────────────────────── */}
          <div className="panel-footer">
            <span className="panel-footer-note">Desktop AI Companion · v0.2</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanionPanel;
