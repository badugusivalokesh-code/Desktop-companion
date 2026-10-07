import React, { useState, useEffect, useRef } from "react";
import type { Memory, MemoryCategory, UpdateMemoryInput } from "../../types/memory";
import { memoryService } from "../../services/memory/memoryService";

const CATEGORIES: MemoryCategory[] = ["fact", "preference", "routine", "goal", "temporary"];
const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  fact: "Fact",
  preference: "Preference",
  routine: "Routine",
  goal: "Goal",
  temporary: "Temporary",
};

interface MemoryEditorProps {
  memory: Memory;
  onSaved: (updated: Memory) => void;
  onCancel: () => void;
}

const MemoryEditor: React.FC<MemoryEditorProps> = ({ memory, onSaved, onCancel }) => {
  const [content, setContent] = useState(memory.content);
  const [category, setCategory] = useState<MemoryCategory>(memory.category as MemoryCategory);
  const [importance, setImportance] = useState<number>(memory.importance);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on open
  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  const isContentEmpty = content.trim().length === 0;

  const handleSave = async () => {
    if (isContentEmpty || saving) return;
    setError(null);
    setSaving(true);

    const input: UpdateMemoryInput = {
      id: memory.id,
      content: content.trim(),
      category,
      importance,
    };

    const updated = await memoryService.updateMemory(input);
    setSaving(false);

    if (updated) {
      onSaved(updated);
    } else {
      setError("Failed to save. Please try again.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
    // Ctrl/Cmd + Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div className="memory-editor" role="dialog" aria-label="Edit memory" onKeyDown={handleKeyDown}>
      {/* ── Header ── */}
      <div className="memory-editor-header">
        <button
          className="memory-back-btn"
          onClick={onCancel}
          aria-label="Cancel edit"
          type="button"
        >
          ‹
        </button>
        <h3 className="memory-editor-title">Edit Memory</h3>
      </div>

      {/* ── Body ── */}
      <div className="memory-editor-body">
        {/* Content */}
        <div className="memory-editor-field">
          <label className="memory-editor-label" htmlFor="mem-edit-content">Content</label>
          <textarea
            id="mem-edit-content"
            ref={textareaRef}
            className={`memory-editor-textarea${isContentEmpty ? " is-invalid" : ""}`}
            value={content}
            onChange={(e) => { setContent(e.target.value); setError(null); }}
            rows={3}
            placeholder="Memory content..."
            maxLength={500}
          />
          {isContentEmpty && (
            <span className="memory-editor-error">Content cannot be empty.</span>
          )}
        </div>

        {/* Category */}
        <div className="memory-editor-field">
          <label className="memory-editor-label" htmlFor="mem-edit-category">Category</label>
          <select
            id="mem-edit-category"
            className="memory-editor-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as MemoryCategory)}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        {/* Importance */}
        <div className="memory-editor-field">
          <label className="memory-editor-label" htmlFor="mem-edit-importance">
            Importance
          </label>
          <div className="memory-editor-importance">
            <input
              id="mem-edit-importance"
              type="range"
              className="memory-editor-slider"
              min={1}
              max={5}
              value={importance}
              onChange={(e) => setImportance(Number(e.target.value))}
            />
            <span className="memory-editor-importance-value">{importance}</span>
          </div>
        </div>

        {error && <span className="memory-editor-error">{error}</span>}
      </div>

      {/* ── Footer ── */}
      <div className="memory-editor-footer">
        <button
          className="memory-editor-btn memory-editor-btn--cancel"
          onClick={onCancel}
          type="button"
          disabled={saving}
        >
          Cancel
        </button>
        <button
          className="memory-editor-btn memory-editor-btn--save"
          onClick={handleSave}
          type="button"
          disabled={saving || isContentEmpty}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
};

export default MemoryEditor;
