/**
 * Supported memory categories in Desktop AI Companion.
 */
export type MemoryCategory = "fact" | "preference" | "routine" | "goal" | "temporary";

export interface Memory {
  id: string;
  category: MemoryCategory;
  content: string;
  importance: number;
  source: string;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
}

export interface CreateMemoryInput {
  category: MemoryCategory;
  content: string;
  importance?: number;
  expires_at?: number | null;
}

export interface UpdateMemoryInput {
  id: string;
  content?: string;
  category?: MemoryCategory;
  importance?: number;
}

export interface MemoryDetectionResult {
  isMemoryIntent: boolean;
  cleanContent: string;
  category: MemoryCategory;
  targetIdToUpdate?: string;
  confirmationMessage: string;
}

