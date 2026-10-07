import React, { useState } from "react";
import type { ChatMessage, ConnectionStatus } from "../../types/chat";
import { QuickChat } from "../chat/QuickChat";
import MemoryPanel from "../memory/MemoryPanel";
import TaskPanel from "../tasks/TaskPanel";
import { getLocalAIConfig } from "../../config/ai";
import "./CompanionPanel.css";
import "../chat/chat.css";

export type PanelMode = "chat" | "settings" | "memory" | "tasks";

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
 * CompanionPanel — manages compact chat input, settings, memory, and task views.
 *
 * Phase 3: chat / settings
 * Phase 5: adds memory sub-panel accessible from settings
 * Phase 6: adds tasks & reminders sub-panel accessible from settings
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
  // Local sub-navigation state: null = main settings, "memory" | "tasks" = sub-panels
  const [subView, setSubView] = useState<"memory" | "tasks" | null>(null);

  if (!open) return null;

  const currentMode = mode;
  const config = getLocalAIConfig();

  /* ── Chat mode ─────────────────────────────────────────────────────────── */
  if (currentMode === "chat") {
    return (
      <div className="panel-overlay panel-overlay--chat" aria-live="polite">
        <QuickChat
          messages={messages}
          isTyping={isTyping}
          connectionStatus={connectionStatus}
          onSendMessage={onSendMessage}
          onClose={onClose}
          companionName={companionName}
        />
      </div>
    );
  }

  /* ── Settings / Sub-panels mode ────────────────────────────────────────── */
  return (
    <div className="panel-overlay panel-overlay--settings" aria-live="polite">
      {/* Sub-panel views */}
      {currentMode === "memory" || subView === "memory" ? (
        <MemoryPanel onBack={() => setSubView(null)} />
      ) : currentMode === "tasks" || subView === "tasks" ? (
        <TaskPanel onBack={() => setSubView(null)} />
      ) : (
        /* Settings main view */
        <div
          className="companion-panel"
          role="dialog"
          aria-label="Settings panel"
          aria-modal="false"
        >
          {/* ── Settings Header ──────────────────────────────────────── */}
          <div className="panel-header">
            <h2 className="panel-title">Settings</h2>
            <span className="panel-badge">Phase 6</span>
            <button
              className="panel-close"
              onClick={onClose}
              aria-label="Close settings"
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* ── Settings Body ────────────────────────────────────────── */}
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

            {/* ── Memory navigation row ──────────────────────────────── */}
            <div
              className="settings-row settings-row--link"
              role="button"
              tabIndex={0}
              onClick={() => setSubView("memory")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setSubView("memory");
              }}
              aria-label="Open memory management"
              title="Open memory management"
            >
              <span className="settings-icon">🧠</span>
              <span className="settings-label">Memory</span>
              <span
                className="settings-value"
                style={{ fontSize: "9.5px", color: "rgba(160,185,255,0.5)" }}
              >
                Manage what Makima remembers
              </span>
              <span className="settings-nav-arrow">›</span>
            </div>

            {/* ── Tasks navigation row ───────────────────────────────── */}
            <div
              className="settings-row settings-row--link"
              role="button"
              tabIndex={0}
              onClick={() => setSubView("tasks")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setSubView("tasks");
              }}
              aria-label="Open task management"
              title="Open task management"
            >
              <span className="settings-icon">✅</span>
              <span className="settings-label">Tasks</span>
              <span
                className="settings-value"
                style={{ fontSize: "9.5px", color: "rgba(160,185,255,0.5)" }}
              >
                Manage your tasks and reminders
              </span>
              <span className="settings-nav-arrow">›</span>
            </div>

            <p className="panel-placeholder-hint">Target: {config.baseUrl}</p>
          </div>

          {/* ── Footer ──────────────────────────────────────────────── */}
          <div className="panel-footer">
            <span className="panel-footer-note">Desktop AI Companion · v0.4</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanionPanel;
