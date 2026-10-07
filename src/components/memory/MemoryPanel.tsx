import React, { useState, useEffect, useCallback } from "react";
import type { Memory } from "../../types/memory";
import { memoryService } from "../../services/memory/memoryService";
import MemoryCard from "./MemoryCard";
import MemoryEditor from "./MemoryEditor";
import "./memory.css";

/* ─── Confirmation state ─────────────────────────────────────────────────── */

type ConfirmAction =
  | { type: "delete"; memory: Memory }
  | { type: "clear" };

/* ─── Component ──────────────────────────────────────────────────────────── */

interface MemoryPanelProps {
  onBack: () => void;
}

const MemoryPanel: React.FC<MemoryPanelProps> = ({ onBack }) => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Which memory is being edited (overlay)
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);

  // Pending confirmation action
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actioning, setActioning] = useState(false);

  /* ── Load memories ── */
  const loadMemories = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await memoryService.listMemories();
    // listMemories already filters expired ones via the backend
    setMemories(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  /* ── Edit ── */
  const handleEditRequest = (memory: Memory) => {
    setConfirmAction(null); // close any open confirm
    setEditingMemory(memory);
  };

  const handleEditorSaved = (updated: Memory) => {
    setMemories((prev) =>
      prev.map((m) => (m.id === updated.id ? updated : m))
    );
    setEditingMemory(null);
  };

  const handleEditorCancel = () => setEditingMemory(null);

  /* ── Delete ── */
  const handleDeleteRequest = (memory: Memory) => {
    setConfirmAction({ type: "delete", memory });
  };

  const handleDeleteConfirm = async () => {
    if (!confirmAction || confirmAction.type !== "delete") return;
    const { memory } = confirmAction;
    setActioning(true);
    const ok = await memoryService.deleteMemory(memory.id);
    setActioning(false);
    setConfirmAction(null);
    if (ok) {
      setMemories((prev) => prev.filter((m) => m.id !== memory.id));
    } else {
      setLoadError("Failed to delete memory. Please try again.");
    }
  };

  /* ── Clear all ── */
  const handleClearRequest = () => {
    setConfirmAction({ type: "clear" });
  };

  const handleClearConfirm = async () => {
    if (!confirmAction || confirmAction.type !== "clear") return;
    setActioning(true);
    const ok = await memoryService.clearMemories();
    setActioning(false);
    setConfirmAction(null);
    if (ok) {
      setMemories([]);
    } else {
      setLoadError("Failed to clear memories. Please try again.");
    }
  };

  /* ── Cancel confirm ── */
  const handleConfirmCancel = () => setConfirmAction(null);

  /* ── Render ── */
  return (
    <div className="companion-panel" role="dialog" aria-label="Memory management panel" aria-modal="false">
      <div className="memory-panel" style={{ position: "relative" }}>

        {/* ── Editor overlay ─────────────────────────────────────────── */}
        {editingMemory && (
          <MemoryEditor
            memory={editingMemory}
            onSaved={handleEditorSaved}
            onCancel={handleEditorCancel}
          />
        )}

        {/* ── Confirmation overlay ────────────────────────────────────── */}
        {confirmAction && (
          <div className="memory-confirm-overlay" role="alertdialog" aria-modal="true">
            {confirmAction.type === "delete" ? (
              <>
                <p className="memory-confirm-title">Delete memory?</p>
                <p className="memory-confirm-hint">
                  "{confirmAction.memory.content.slice(0, 60)}{confirmAction.memory.content.length > 60 ? "…" : ""}"
                  <br />This cannot be undone.
                </p>
              </>
            ) : (
              <>
                <p className="memory-confirm-title">Clear all memories?</p>
                <p className="memory-confirm-hint">
                  This will permanently delete all {memories.length} stored{" "}
                  {memories.length === 1 ? "memory" : "memories"}. This cannot be undone.
                </p>
              </>
            )}
            <div className="memory-confirm-buttons">
              <button
                className="memory-confirm-btn memory-confirm-btn--cancel"
                onClick={handleConfirmCancel}
                disabled={actioning}
                type="button"
              >
                Cancel
              </button>
              <button
                className="memory-confirm-btn memory-confirm-btn--danger"
                onClick={confirmAction.type === "delete" ? handleDeleteConfirm : handleClearConfirm}
                disabled={actioning}
                type="button"
              >
                {actioning ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="memory-header">
          <button
            className="memory-back-btn"
            onClick={onBack}
            aria-label="Back to Settings"
            type="button"
          >
            ‹
          </button>
          <h2 className="memory-title">Memory</h2>
          {!loading && memories.length > 0 && (
            <span className="memory-count-badge">{memories.length}</span>
          )}
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className="memory-body" role="list" aria-label="Stored memories">
          {loading ? (
            <div className="memory-status-row">
              <span className="memory-spinner" aria-hidden="true" />
              Loading…
            </div>
          ) : loadError ? (
            <div className="memory-status-row memory-status-row--error">
              {loadError}
            </div>
          ) : memories.length === 0 ? (
            <div className="memory-empty">
              <span className="memory-empty-icon" aria-hidden="true">🧠</span>
              <p className="memory-empty-title">No memories yet</p>
              <p className="memory-empty-hint">
                Tell Makima to remember something — e.g.{" "}
                <em>"Remember that I prefer dark mode."</em>
              </p>
            </div>
          ) : (
            memories.map((mem) => (
              <MemoryCard
                key={mem.id}
                memory={mem}
                onEdit={handleEditRequest}
                onDelete={handleDeleteRequest}
              />
            ))
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="memory-footer">
          <button
            className="memory-clear-btn"
            onClick={handleClearRequest}
            disabled={loading || memories.length === 0 || !!confirmAction}
            type="button"
            title="Clear all stored memories"
            aria-label="Clear all memories"
          >
            Clear all
          </button>
          <span className="memory-footer-note">SQLite · persistent</span>
        </div>
      </div>
    </div>
  );
};

export default MemoryPanel;
