import React, { useState, useCallback, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Character from "./components/character/Character";
import CompanionPanel, { type PanelMode } from "./components/companion/CompanionPanel";
import ContextMenu, { type ContextMenuAction } from "./components/ui/ContextMenu";
import type { CharacterEmotion } from "./types/character";
import "./App.css";

/**
 * App — root component for the floating desktop companion.
 *
 * Layout (transparent 320×620 Tauri window):
 *   ┌─────────────────────────────────────────┐
 *   │                                         │
 *   │         [Makima Full-body]              │  ← Anchored to bottom, floating
 *   │                                         │
 *   │     [CompanionPanel] / [ContextMenu]    │  ← Overlaid on interaction
 *   └─────────────────────────────────────────┘
 */

interface CtxState {
  open: boolean;
  x: number;
  y: number;
}

function App() {
  const [panelOpen, setPanelOpen]   = useState(false);
  const [panelMode, setPanelMode]   = useState<PanelMode>("chat");
  const [emotion,   setEmotion]     = useState<CharacterEmotion>("neutral");
  const [ctx,       setCtx]         = useState<CtxState>({ open: false, x: 0, y: 0 });

  // Refs for differentiating click vs drag on the character
  const isMouseDownRef = useRef(false);
  const dragTriggeredRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  /** Show an emotion briefly, then return to neutral. */
  const flashEmotion = (e: CharacterEmotion, ms = 1400) => {
    setEmotion(e);
    setTimeout(() => setEmotion("neutral"), ms);
  };

  /* ── Character click vs drag handling ─────────────────────────────────── */

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only track left-click
    const target = e.target as HTMLElement;

    // Do not initiate window drag if clicking inside panel or context menu
    if (target.closest(".companion-panel") || target.closest(".context-menu")) {
      return;
    }

    isMouseDownRef.current = true;
    dragTriggeredRef.current = false;
    startPosRef.current = { x: e.screenX, y: e.screenY };
  };

  const handleMouseMove = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMouseDownRef.current || dragTriggeredRef.current) return;

    if (e.buttons === 1) {
      const dx = e.screenX - startPosRef.current.x;
      const dy = e.screenY - startPosRef.current.y;
      // Start native Tauri window dragging once moved past threshold
      if (Math.hypot(dx, dy) > 4) {
        dragTriggeredRef.current = true;
        try {
          await getCurrentWindow().startDragging();
        } catch {
          // Native drag is best-effort
        }
      }
    }
  };

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
  };

  useEffect(() => {
    const onGlobalMouseUp = () => {
      isMouseDownRef.current = false;
    };
    window.addEventListener("mouseup", onGlobalMouseUp);
    return () => window.removeEventListener("mouseup", onGlobalMouseUp);
  }, []);

  /* ── Character left-click → open chat panel ───────────────────────────── */

  const handleCharacterClick = () => {
    // If the mouse gesture was a drag, skip toggling the panel
    if (dragTriggeredRef.current) {
      dragTriggeredRef.current = false;
      return;
    }
    setPanelMode("chat");
    setPanelOpen((prev) => !prev);
    flashEmotion("happy");
  };

  /* ── Right-click → show context menu ─────────────────────────────────── */

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Close the panel so it doesn't overlap with the menu
    setPanelOpen(false);
    setCtx({ open: true, x: e.clientX, y: e.clientY });
  };

  const closeCtx = useCallback(() => {
    setCtx((prev) => ({ ...prev, open: false }));
  }, []);

  /* ── Context menu actions ─────────────────────────────────────────────── */

  const contextMenuItems: ContextMenuAction[] = [
    {
      label: "Hide",
      icon: "👁",
      onClick: async () => {
        setPanelOpen(false);
        try {
          await getCurrentWindow().hide();
        } catch (err) {
          console.warn("[Companion] Could not hide window:", err);
        }
      },
    },
    { separator: true, label: "" },
    {
      label: "Settings",
      icon: "⚙️",
      onClick: () => {
        setPanelMode("settings");
        setPanelOpen(true);
      },
    },
    { separator: true, label: "" },
    {
      label: "Exit",
      icon: "✕",
      danger: true,
      onClick: async () => {
        try {
          await getCurrentWindow().close();
        } catch (err) {
          console.warn("[Companion] Could not close window:", err);
        }
      },
    },
  ];

  /* ── Render ───────────────────────────────────────────────────────────── */

  return (
    <div
      className="app-shell"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
    >
      {/* Character — Makima artwork */}
      <Character
        emotion={emotion}
        onClick={handleCharacterClick}
      />

      {/* Companion panel — chat or settings */}
      <CompanionPanel
        open={panelOpen}
        mode={panelMode}
        onClose={() => setPanelOpen(false)}
      />

      {/* Right-click context menu */}
      {ctx.open && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={contextMenuItems}
          onClose={closeCtx}
        />
      )}
    </div>
  );
}

export default App;
