import type { Memory, MemoryCategory, MemoryDetectionResult } from "../../types/memory";

/**
 * Prefix patterns indicating explicit user intent to record a memory.
 * Ordinary conversational statements without these triggers are NEVER saved.
 */
const EXPLICIT_TRIGGERS: Array<{ pattern: RegExp; stripPrefix: RegExp }> = [
  {
    pattern: /^(?:please\s+)?remember(?:\s+that|\s*:|\s+to|\s+me)?\s+/i,
    stripPrefix: /^(?:please\s+)?remember(?:\s+that|\s*:|\s+to|\s+me)?\s+/i,
  },
  {
    pattern: /^(?:please\s+)?keep\s+in\s+mind(?:\s+that|\s*:)?\s+/i,
    stripPrefix: /^(?:please\s+)?keep\s+in\s+mind(?:\s+that|\s*:)?\s+/i,
  },
  {
    pattern: /^(?:please\s+)?don'?t\s+forget(?:\s+that|\s*:)?\s+/i,
    stripPrefix: /^(?:please\s+)?don'?t\s+forget(?:\s+that|\s*:)?\s+/i,
  },
  {
    pattern: /^(?:please\s+)?note\s+that\s+/i,
    stripPrefix: /^(?:please\s+)?note\s+that\s+/i,
  },
  {
    pattern: /^note:\s+/i,
    stripPrefix: /^note:\s+/i,
  },
];

/**
 * Deterministic category inference rules applied to extracted memory content.
 */
export function inferCategory(content: string): MemoryCategory {
  const lower = content.toLowerCase();

  // Temporary indicators
  if (
    lower.includes("today") ||
    lower.includes("for now") ||
    lower.includes("right now") ||
    lower.includes("this morning") ||
    lower.includes("this evening") ||
    lower.includes("currently feeling") ||
    lower.includes("feeling tired") ||
    lower.includes("feeling exhausted")
  ) {
    return "temporary";
  }

  // Goal indicators
  if (
    lower.includes("building") ||
    lower.includes("my goal") ||
    lower.includes("working on creating") ||
    lower.includes("aiming to") ||
    lower.includes("planning to finish")
  ) {
    return "goal";
  }

  // Preference indicators
  if (
    lower.startsWith("i prefer") ||
    lower.includes("i prefer") ||
    lower.includes("my favorite") ||
    lower.includes("my preferred") ||
    lower.includes("i like ") ||
    lower.includes("i love ")
  ) {
    return "preference";
  }

  // Routine indicators
  if (
    lower.includes("i usually") ||
    lower.includes("i typically") ||
    lower.includes("every day") ||
    lower.includes("every night") ||
    lower.includes("at night") ||
    lower.includes("in the morning") ||
    lower.includes("on weekends") ||
    lower.includes("daily")
  ) {
    return "routine";
  }

  // Default fallback
  return "fact";
}

/**
 * Extracts key semantic tokens to find overlapping / conflicting memories for updates.
 */
function extractCoreTokens(text: string): string[] {
  const stopWords = new Set([
    "i", "a", "an", "the", "that", "this", "is", "am", "are", "to", "in", "on", "at", "for", "my", "me", "and", "or", "of", "with"
  ]);
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

/**
 * Checks whether an incoming memory should update an existing memory rather than duplicate.
 * e.g., "I prefer dark mode" vs "I prefer light mode".
 */
export function findMemoryToUpdate(
  newContent: string,
  category: MemoryCategory,
  existingMemories: Memory[]
): Memory | null {
  const newTokens = new Set(extractCoreTokens(newContent));
  const newLower = newContent.toLowerCase();

  for (const existing of existingMemories) {
    // Only match against the same category
    if (existing.category !== category) continue;

    const existingLower = existing.content.toLowerCase();

    // Exact match
    if (existingLower === newLower) {
      return existing;
    }

    // Preference contradictions (e.g. theme/mode preferences)
    if (category === "preference") {
      const isThemePref =
        (newLower.includes("theme") || newLower.includes("mode")) &&
        (existingLower.includes("theme") || existingLower.includes("mode"));
      if (isThemePref) return existing;

      const isEditorPref =
        (newLower.includes("editor") || newLower.includes("ide")) &&
        (existingLower.includes("editor") || existingLower.includes("ide"));
      if (isEditorPref) return existing;
    }

    // Goal replacements (e.g. "building X" vs "building Y")
    if (category === "goal" && (newLower.includes("building") && existingLower.includes("building"))) {
      return existing;
    }

    // High token overlap in small phrases
    const existingTokens = extractCoreTokens(existing.content);
    const overlap = existingTokens.filter((t) => newTokens.has(t)).length;
    if (existingTokens.length > 0 && overlap / existingTokens.length >= 0.7) {
      return existing;
    }
  }

  return null;
}

/**
 * Selects an in-character confirmation phrase.
 */
function getConfirmationMessage(category: MemoryCategory): string {
  switch (category) {
    case "preference":
      return "I'll remember that.";
    case "goal":
      return "Noted. I'll keep your goal in mind.";
    case "routine":
      return "Understood. I'll remember your routine.";
    case "temporary":
      return "I've noted that for today.";
    case "fact":
    default:
      return "Understood. I'll keep that in mind.";
  }
}

/**
 * Detects whether the user's message is an explicit memory command.
 * Returns detection details or isMemoryIntent: false.
 */
export function detectMemoryIntent(
  rawMessage: string,
  existingMemories: Memory[] = []
): MemoryDetectionResult {
  const trimmed = rawMessage.trim();

  let matchedTrigger: (typeof EXPLICIT_TRIGGERS)[0] | null = null;
  for (const trigger of EXPLICIT_TRIGGERS) {
    if (trigger.pattern.test(trimmed)) {
      matchedTrigger = trigger;
      break;
    }
  }

  if (!matchedTrigger) {
    return {
      isMemoryIntent: false,
      cleanContent: "",
      category: "fact",
      confirmationMessage: "",
    };
  }

  // Strip prefix
  let cleanContent = trimmed.replace(matchedTrigger.stripPrefix, "").trim();

  // Strip optional trailing periods or quotes
  cleanContent = cleanContent.replace(/^["']|["']$/g, "").trim();
  cleanContent = cleanContent.replace(/[.!?]+$/, "").trim();

  // Capitalize first letter and append period for clean persistence
  if (cleanContent.length > 0) {
    cleanContent = cleanContent.charAt(0).toUpperCase() + cleanContent.slice(1) + ".";
  }

  if (!cleanContent) {
    return {
      isMemoryIntent: false,
      cleanContent: "",
      category: "fact",
      confirmationMessage: "",
    };
  }

  const category = inferCategory(cleanContent);
  const memoryToUpdate = findMemoryToUpdate(cleanContent, category, existingMemories);

  return {
    isMemoryIntent: true,
    cleanContent,
    category,
    targetIdToUpdate: memoryToUpdate?.id,
    confirmationMessage: getConfirmationMessage(category),
  };
}

