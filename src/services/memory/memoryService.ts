import { invoke } from "@tauri-apps/api/core";
import type {
  Memory,
  MemoryCategory,
  CreateMemoryInput,
  UpdateMemoryInput,
} from "../../types/memory";

/**
 * MemoryService — frontend abstraction over Tauri IPC for SQLite persistence.
 *
 * Ensures:
 * - UI and useChat never execute raw SQL.
 * - IPC errors are caught gracefully and never crash the application.
 */
class MemoryService {
  /**
   * Creates a new memory in SQLite via Tauri backend.
   */
  async createMemory(input: CreateMemoryInput): Promise<Memory | null> {
    try {
      const memory = await invoke<Memory>("memory_create", {
        category: input.category,
        content: input.content.trim(),
        importance: input.importance ?? 1,
        expiresAt: input.expires_at ?? null,
      });
      return memory;
    } catch (err) {
      console.error("[MemoryService] Failed to create memory:", err);
      return null;
    }
  }

  /**
   * Lists stored memories, optionally filtered by category.
   * By default, expired temporary memories are excluded.
   */
  async listMemories(
    category?: MemoryCategory,
    includeExpired: boolean = false
  ): Promise<Memory[]> {
    try {
      const memories = await invoke<Memory[]>("memory_list", {
        category: category ?? null,
        includeExpired,
      });
      return memories;
    } catch (err) {
      console.error("[MemoryService] Failed to list memories:", err);
      return [];
    }
  }

  /**
   * Updates an existing memory.
   */
  async updateMemory(input: UpdateMemoryInput): Promise<Memory | null> {
    try {
      const memory = await invoke<Memory>("memory_update", {
        id: input.id,
        content: input.content ?? null,
        category: input.category ?? null,
        importance: input.importance ?? null,
      });
      return memory;
    } catch (err) {
      console.error("[MemoryService] Failed to update memory:", err);
      return null;
    }
  }

  /**
   * Deletes a memory by its ID.
   */
  async deleteMemory(id: string): Promise<boolean> {
    try {
      return await invoke<boolean>("memory_delete", { id });
    } catch (err) {
      console.error("[MemoryService] Failed to delete memory:", err);
      return false;
    }
  }

  /**
   * Clears all stored memories.
   */
  async clearMemories(): Promise<boolean> {
    try {
      return await invoke<boolean>("memory_clear");
    } catch (err) {
      console.error("[MemoryService] Failed to clear memories:", err);
      return false;
    }
  }

  /**
   * Cleans up expired temporary memories.
   */
  async cleanupExpired(): Promise<number> {
    try {
      return await invoke<number>("memory_cleanup_expired");
    } catch (err) {
      console.error("[MemoryService] Failed to cleanup expired memories:", err);
      return 0;
    }
  }
}

export const memoryService = new MemoryService();

