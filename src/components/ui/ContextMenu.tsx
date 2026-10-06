import React, { useEffect, useRef } from "react";
import "./ContextMenu.css";

export interface ContextMenuAction {
  label: string;
  icon?: string;
  /** Render as a visual separator instead of a button. */
  separator?: true;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface ContextMenuProps {
  /** Client-space X position for the top-left corner of the menu. */
  x: number;
  /** Client-space Y position for the top-left corner of the menu. */
  y: number;
  items: ContextMenuAction[];
  onClose: () => void;
}

/**
 * ContextMenu — compact right-click context menu.
 *
 * Closes automatically when the user clicks outside or presses Escape.
 * Menu position is clamped so it never extends below the window bottom.
 */
const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  /* Close on outside click */
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [onClose]);

  /* Close on Escape */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /*
   * Clamp position so the menu doesn't overflow below the window.
   * We estimate menu height (~28px per item) conservatively.
   */
  const estimatedHeight = items.length * 32;
  const clampedY = Math.min(y, window.innerHeight - estimatedHeight - 8);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: x, top: clampedY }}
      role="menu"
      aria-label="Companion options"
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="ctx-separator" role="separator" />
        ) : (
          <button
            key={i}
            className={`ctx-item${item.danger ? " ctx-item--danger" : ""}`}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onClick?.();
            }}
          >
            {item.icon && (
              <span className="ctx-icon" aria-hidden="true">
                {item.icon}
              </span>
            )}
            <span className="ctx-label">{item.label}</span>
          </button>
        )
      )}
    </div>
  );
};

export default ContextMenu;

