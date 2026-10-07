import type { Memory } from "../../types/memory";

/**
 * Extracts normalized query tokens for lexical relevance scoring.
 */
function tokenizeQuery(text: string): string[] {
  const stopWords = new Set([
    "a", "an", "the", "what", "is", "are", "do", "does", "i", "my", "me", "you", "your",
    "can", "could", "should", "would", "tell", "explain", "how", "to", "in", "on", "at",
    "for", "of", "with", "about"
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/**
 * Scores a memory against user query tokens.
 */
function scoreMemoryRelevance(memory: Memory, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;

  const contentLower = memory.content.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    if (contentLower.includes(token)) {
      score += 2;
    }
  }

  // Boost preferences if query mentions preference terms
  if (
    memory.category === "preference" &&
    queryTokens.some((t) => ["prefer", "preference", "like", "favorite", "theme", "color", "font"].includes(t))
  ) {
    score += 3;
  }

  // Boost routines if query mentions time/routine terms
  if (
    memory.category === "routine" &&
    queryTokens.some((t) => ["time", "when", "usually", "schedule", "routine", "work", "hours"].includes(t))
  ) {
    score += 3;
  }

  return score;
}

/**
 * Selects up to 3–5 relevant, unexpired memories within an ~80 token budget.
 *
 * Rules:
 * 1. Always include the latest active GOAL (if one exists).
 * 2. Include relevant FACT, PREFERENCE, ROUTINE, TEMPORARY memories based on query token matches.
 * 3. Never include expired memories.
 * 4. Maximum 3–5 items total.
 * 5. Returns a compact "[User Context]" string, or empty string if no relevant memories exist.
 */
export function formatRelevantMemories(
  userQuery: string,
  allMemories: Memory[]
): string {
  if (allMemories.length === 0) return "";

  const now = Date.now();
  // Filter out any expired memories
  const activeMemories = allMemories.filter(
    (m) => m.expires_at === null || m.expires_at > now
  );

  if (activeMemories.length === 0) return "";

  const selectedMemories: Memory[] = [];
  const selectedIds = new Set<string>();

  // Rule 1: Always include active GOAL if one exists
  const activeGoal = activeMemories.find((m) => m.category === "goal");
  if (activeGoal) {
    selectedMemories.push(activeGoal);
    selectedIds.add(activeGoal.id);
  }

  // Tokenize user message
  const queryTokens = tokenizeQuery(userQuery);

  // Score remaining memories
  const scored = activeMemories
    .filter((m) => !selectedIds.has(m.id))
    .map((m) => ({
      memory: m,
      score: scoreMemoryRelevance(m, queryTokens),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.memory.created_at - a.memory.created_at);

  // Take top relevant memories up to max limit of 4 (allowing 1 for goal -> total 5 max)
  for (const item of scored) {
    if (selectedMemories.length >= 4) break;
    selectedMemories.push(item.memory);
    selectedIds.add(item.memory.id);
  }

  // If query is an open-ended question ("What theme do I prefer?", "Who am I?"),
  // and no scored memory matched, check if category keywords match
  if (selectedMemories.length === (activeGoal ? 1 : 0)) {
    const queryLower = userQuery.toLowerCase();
    if (queryLower.includes("theme") || queryLower.includes("prefer")) {
      const pref = activeMemories.find((m) => m.category === "preference" && !selectedIds.has(m.id));
      if (pref) selectedMemories.push(pref);
    }
    if (queryLower.includes("who") || queryLower.includes("job") || queryLower.includes("work")) {
      const fact = activeMemories.find((m) => m.category === "fact" && !selectedIds.has(m.id));
      if (fact) selectedMemories.push(fact);
    }
  }

  // If nothing selected (or only a goal when user is asking something unrelated), check relevance
  if (selectedMemories.length === 0) {
    return "";
  }

  // Build compact formatted block
  const lines = selectedMemories.map((m) => `- ${m.content.trim()}`);

  return `[User Context]\n${lines.join("\n")}`;
}

