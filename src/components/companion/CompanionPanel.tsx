import React from "react";
import type { ChatMessage, ConnectionStatus } from "../../types/chat";
import { QuickChat } from "../chat/QuickChat";
import { getLocalAIConfig } from "../../config/ai";
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
  /** Live connection status to the local AI service */
  connectionStatus?: ConnectionStatus;
  /** Callback to send a user message */
  onSendMessage: (content: string) => void;
  /** Callback to reset/clear conversation */
  onClearChat: () => void;
  /** Companion name to display */
  companionName?: string;
}

/**
 * CompanionPanel — manages compact chat input and settings views.
 *
 * In Phase 3 UI Polish:
 * - mode === "chat" renders the compact single-line QuickChat floating above Makima.
 * - mode === "settings" displays local AI engine status and configuration.
 */
const CompanionPanel: React.FC<CompanionPanelProps> = ({
  open,
  mode = "chat",
  onClose,
  messages,
  isTyping,
  connectionStatus = "connecting",
  onSendMessage,
  onClearChat: _onClearChat,
  companionName = "Makima",
}) => {
  if (!open) return null;

  const config = getLocalAIConfig();

  return (
    <div
      className={`panel-overlay ${mode === "chat" ? "panel-overlay--chat" : "panel-overlay--settings"}`}
      aria-live="polite"
    >
      {mode === "chat" ? (
        <QuickChat
          messages={messages}
          isTyping={isTyping}
          connectionStatus={connectionStatus}
          onSendMessage={onSendMessage}
          onClose={onClose}
          companionName={companionName}
        />
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
            <span className="panel-badge">Phase 3</span>
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
              <span className="settings-icon">⚡</span>
              <span className="settings-label">Engine</span>
              <span className="settings-value">Ollama (Local)</span>
            </div>
            <div className="settings-row">
              <span className="settings-icon">🤖</span>
              <span className="settings-label">Model</span>
              <span className="settings-value">{config.model}</span>
            </div>
            <div className="settings-row">
              <span className="settings-icon">📡</span>
              <span className="settings-label">Status</span>
              <span
                className="settings-value"
                style={{
                  color:
                    connectionStatus === "online"
                      ? "#34d399"
                      : connectionStatus === "connecting"
                      ? "#f59e0b"
                      : "#ef4444",
                }}
              >
                {connectionStatus === "online"
                  ? "Connected"
                  : connectionStatus === "connecting"
                  ? "Connecting..."
                  : "Offline"}
              </span>
            </div>
            <p className="panel-placeholder-hint">
              Target: {config.baseUrl}
            </p>
          </div>

          {/* ── Footer ────────────────────────────────────────────────── */}
          <div className="panel-footer">
            <span className="panel-footer-note">Desktop AI Companion · v0.3</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanionPanel;
