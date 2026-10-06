import React from "react";
import "./CompanionPanel.css";

export type PanelMode = "chat" | "settings";

interface CompanionPanelProps {
  /** Whether the panel is currently visible. */
  open: boolean;
  /** Which content to display. Defaults to "chat". */
  mode?: PanelMode;
  /** Called when the user clicks the close button. */
  onClose: () => void;
}

/**
 * CompanionPanel — compact floating panel.
 *
 * Phase 1: placeholder layout for both chat and settings modes.
 * Phase 2: wire "chat" mode up to the AI backend.
 */
const CompanionPanel: React.FC<CompanionPanelProps> = ({
  open,
  mode = "chat",
  onClose,
}) => {
  if (!open) return null;

  return (
    <div className="panel-overlay" aria-live="polite">
      <div
        className="companion-panel"
        role="dialog"
        aria-label={mode === "settings" ? "Settings" : "Desktop AI Companion panel"}
        aria-modal="false"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="panel-header">
          <h2 className="panel-title">
            {mode === "settings" ? "Settings" : "AI Companion"}
          </h2>
          <span className="panel-badge">Phase 1</span>
          <button
            className="panel-close"
            onClick={onClose}
            aria-label="Close panel"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        {mode === "chat" ? (
          <div className="panel-conversation">
            <div className="panel-bubble">Hello! I'm your desktop companion. 👋</div>
            <p className="panel-placeholder-hint">— AI chat coming in Phase 2 —</p>
          </div>
        ) : (
          <div className="panel-settings">
            <div className="settings-row">
              <span className="settings-icon">🎭</span>
              <span className="settings-label">Character</span>
              <span className="settings-value">Makima</span>
            </div>
            <div className="settings-row">
              <span className="settings-icon">🪟</span>
              <span className="settings-label">Always on top</span>
              <span className="settings-value">On</span>
            </div>
            <p className="panel-placeholder-hint">
              — Full settings coming in Phase 2 —
            </p>
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="panel-footer">
          <span className="panel-footer-note">Desktop AI Companion · v0.1</span>
        </div>
      </div>
    </div>
  );
};

export default CompanionPanel;
