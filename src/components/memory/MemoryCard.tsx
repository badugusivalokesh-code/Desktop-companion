import React from "react";
import type { Memory, MemoryCategory } from "../../types/memory";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  fact: "Fact",
  preference: "Preference",
  routine: "Routine",
  goal: "Goal",
  temporary: "Temporary",
};

const CATEGORY_CSS: Record<MemoryCategory, string> = {
  fact: "memory-cat--fact",
  preference: "memory-cat--preference",
  routine: "memory-cat--routine",
  goal: "memory-cat--goal",
  temporary: "memory-cat--temporary",
};

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

function formatExpiry(expiresAt: number): string {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "Expired";
  const hours = Math.floor(remaining / 3_600_000);
  if (hours < 1) {
    const mins = Math.floor(remaining / 60_000);
    return `Expires in ${mins}m`;
  }
  if (hours < 24) return `Expires in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Expires in ${days}d`;
}

/* ─── component ───────────────────────────────────────────────────────────── */

interface MemoryCardProps {
  memory: Memory;
  onEdit: (memory: Memory) => void;
  onDelete: (memory: Memory) => void;
}

const MemoryCard: React.FC<MemoryCardProps> = ({ memory, onEdit, onDelete }) => {
  const category = memory.category as MemoryCategory;

  const importanceDots = Array.from({ length: 5 }, (_, i) => (
    <span
      key={i}
      className={`memory-importance-dot${i < memory.importance ? " memory-importance-dot--active" : ""}`}
      title={`Importance: ${memory.importance}/5`}
    />
  ));

  return (
    <div className="memory-card" role="listitem">
      {/* ── Top row: category pill + importance + actions ── */}
      <div className="memory-card-top">
        <span className={`memory-category-pill ${CATEGORY_CSS[category]}`}>
          {CATEGORY_LABELS[category]}
        </span>

        <span className="memory-importance-dots" aria-label={`Importance ${memory.importance} of 5`}>
          {importanceDots}
        </span>

        <div className="memory-card-actions">
          <button
            className="memory-action-btn"
            onClick={() => onEdit(memory)}
            title="Edit memory"
            aria-label="Edit memory"
            type="button"
          >
            ✏
          </button>
          <button
            className="memory-action-btn memory-action-btn--delete"
            onClick={() => onDelete(memory)}
            title="Delete memory"
            aria-label="Delete memory"
            type="button"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <p className="memory-card-content">{memory.content}</p>

      {/* ── Meta ── */}
      <div className="memory-card-meta">
        <span className="memory-card-date">
          {formatDate(memory.updated_at !== memory.created_at ? memory.updated_at : memory.created_at)}
        </span>
        {memory.expires_at !== null && memory.expires_at !== undefined && (
          <span className="memory-card-expiry">· {formatExpiry(memory.expires_at)}</span>
        )}
      </div>
    </div>
  );
};

export default MemoryCard;
