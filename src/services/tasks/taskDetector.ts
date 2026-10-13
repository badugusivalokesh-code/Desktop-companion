import type {
  Task,
  TaskDetectionResult,
  TaskAmbiguityResult,
} from "../../types/task";
import {
  parseNaturalDateTime,
  parseNaturalRecurrence,
  cleanTitleFromDateTime,
} from "./dateTimeParser";
import { formatRecurrenceRule } from "./recurrence";

/**
 * Deterministic rule-based task detector for Desktop AI Companion.
 * V1 operates without calling Ollama to keep task interactions instant, reliable, and predictable.
 */

// Patterns indicating completion of a task
const COMPLETION_PATTERNS = [
  /^(?:i\s+)?(?:finished|completed|done\s+with)\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/i,
  /^mark\s+(?:the\s+)?(.+?)(?:\s+task)?\s+as\s+(?:done|completed|finished)\.?$/i,
  /^that\s+task\s+is\s+(?:done|completed|finished)\.?$/i,
  /^completed\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/i,
];

// Patterns indicating cancellation of a task
const CANCELLATION_PATTERNS = [
  /^cancel\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/i,
  /^don'?t\s+remind\s+me\s+(?:about|to)\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/i,
  /^(?:please\s+)?delete\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/i,
  /^(?:please\s+)?remove\s+(?:the\s+)?(.+?)(?:\s+task)?\.?$/i,
  /^(?:please\s+)?stop\s+(?:my\s+)?(.+?)(?:\s+reminder)?\.?$/i,
];

const PAUSE_PATTERNS = [
  /^(?:please\s+)?pause\s+(?:my\s+)?(.+?)(?:\s+reminder)?\.?$/i,
];

const RESUME_PATTERNS = [
  /^(?:please\s+)?resume\s+(?:my\s+)?(.+?)(?:\s+reminder)?\.?$/i,
];

// Patterns indicating task query intent
const QUERY_PATTERNS = [
  /^(?:what\s+are\s+my\s+tasks|show\s+(?:my\s+)?tasks|list\s+(?:my\s+)?tasks|my\s+tasks|what\s+do\s+i\s+need\s+to\s+do|what\s+tasks\s+do\s+i\s+have|any\s+(?:pending\s+)?tasks|any\s+(?:upcoming\s+)?reminders)\b/i,
];

// Patterns indicating explicit task creation intent
const CREATION_PREFIXES = [
  // "Remind me at 9:25 to call my friend" / "Remind me to call my friend at 9:25"
  /^(?:please\s+)?remind\s+me(?:\s+at\s+[^\s]+)?\s+(?:to|about)\s+/i,
  /^(?:please\s+)?remind\s+me\s+/i,
  // "Set a reminder to..." / "Set reminder for..."
  /^(?:please\s+)?set\s+(?:a\s+)?reminder\s+(?:to|for|about)\s+/i,
  // "Add task: ..." / "New task: ..."
  /^(?:please\s+)?(?:add|create|new)\s+task\s*:?\s+/i,
  /^task\s*:\s+/i,
  // "I need to..." / "I have to..." with timing
  /^(?:i\s+need\s+to|i\s+have\s+to|i\s+must)\s+/i,
  // "I have a meeting..." / "I have an appointment..."
  /^i\s+have\s+(?:a\s+|an\s+)?/i,
];

// Action verbs that indicate tasks when accompanied by date/time
const ACTION_VERBS = /^(?:finish|complete|call|email|send|prepare|write|submit|buy|clean|review|meet|schedule|pay|pickup|pick\s+up)\s+/i;

/**
 * Detects task intents (create, complete, cancel, query) from user text.
 */
export function detectTaskIntent(
  text: string,
  referenceDate: Date = new Date()
): TaskDetectionResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { intent: "none", confidence: 0 };
  }

  // 1. Check for Query intent
  for (const pattern of QUERY_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        intent: "query",
        confidence: 0.95,
      };
    }
  }

  // 2. Check for Completion intent.
  for (const pattern of COMPLETION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        intent: "complete",
        targetQuery: cleanActionTarget(match[1] || ""),
        confidence: 0.95,
      };
    }
  }

  // 3. Cancellation, pause, and resume are handled before creation parsing.
  for (const pattern of CANCELLATION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        intent: "cancel",
        targetQuery: cleanActionTarget(match[1] || ""),
        confidence: 0.95,
      };
    }
  }
  for (const pattern of PAUSE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        intent: "pause",
        targetQuery: cleanActionTarget(match[1] || ""),
        confidence: 0.95,
      };
    }
  }
  for (const pattern of RESUME_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        intent: "resume",
        targetQuery: cleanActionTarget(match[1] || ""),
        confidence: 0.95,
      };
    }
  }

  // 4. Recurrence takes precedence over the one-time date parser.
  const parsedRecurrence = parseNaturalRecurrence(trimmed, referenceDate);
  if (parsedRecurrence?.clarificationMessage) {
    return {
      intent: "clarify",
      confidence: 0.95,
      clarificationMessage: parsedRecurrence.clarificationMessage,
    };
  }
  const parsedTime = parsedRecurrence
    ? null
    : parseNaturalDateTime(trimmed, referenceDate);

  for (const prefix of CREATION_PREFIXES) {
    if (!prefix.test(trimmed)) continue;
    const body = trimmed.replace(prefix, "").trim();
    const parsed = parsedRecurrence ?? parsedTime;
    const cleanedTitle = cleanTitleFromDateTime(
      body,
      parsed ? parsed.matchedSnippet : ""
    );
    if (!cleanedTitle) continue;

    if (parsedRecurrence) {
      return {
        intent: "create",
        title: cleanedTitle,
        reminderAt: parsedRecurrence.timestamp,
        dueAt: null,
        recurrence: parsedRecurrence.rule,
        recurrenceTimezone: parsedRecurrence.recurrenceTimezone,
        confidence: 0.95,
        confirmationMessage: buildRecurrenceConfirmation(
          cleanedTitle,
          parsedRecurrence.rule
        ),
      };
    }

    const isReminder = parsedTime?.isReminder ?? /remind/i.test(trimmed);
    const timestamp = parsedTime?.timestamp ?? null;
    return {
      intent: "create",
      title: cleanedTitle,
      reminderAt: isReminder ? timestamp : null,
      dueAt: isReminder ? null : timestamp,
      confidence: 0.95,
      confirmationMessage: buildConfirmationMessage(cleanedTitle, timestamp, isReminder),
    };
  }

  if (parsedTime && ACTION_VERBS.test(trimmed)) {
    const cleanedTitle = cleanTitleFromDateTime(trimmed, parsedTime.matchedSnippet);
    if (cleanedTitle) {
      const isReminder = parsedTime.isReminder;
      return {
        intent: "create",
        title: cleanedTitle,
        reminderAt: isReminder ? parsedTime.timestamp : null,
        dueAt: isReminder ? null : parsedTime.timestamp,
        confidence: 0.9,
        confirmationMessage: buildConfirmationMessage(cleanedTitle, parsedTime.timestamp, isReminder),
      };
    }
  }

  return { intent: "none", confidence: 0 };
}

function cleanActionTarget(rawTarget: string): string {
  return rawTarget
    .replace(/\btask\b/gi, "")
    .replace(/\b(reminder|daily|weekly|weekdays?|monthly|every)\b/gi, "")
    .replace(/^the\s+/i, "")
    .replace(/^[:\-\s,.]+|[:\-\s,.]+$/g, "")
    .trim();
}

function buildRecurrenceConfirmation(
  title: string,
  rule: import("../../types/task").RecurrenceRule
): string {
  return `I'll remind you ${formatRecurrenceRule(rule).toLowerCase()} to ${title.toLowerCase()}.`;
}


/**
 * Builds a natural, concise confirmation message from Makima.
 */
function buildConfirmationMessage(
  title: string,
  timestamp: number | null,
  isReminder: boolean
): string {
  if (timestamp) {
    const dateObj = new Date(timestamp);
    const now = new Date();
    const isToday = dateObj.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = dateObj.toDateString() === tomorrow.toDateString();

    const timeStr = dateObj.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    const dayPrefix = isToday ? "" : isTomorrow ? "tomorrow at " : `${dateObj.toLocaleDateString([], { month: "short", day: "numeric" })} at `;

    if (isReminder) {
      return `I'll remind you ${dayPrefix}${timeStr} to ${title.toLowerCase()}.`;
    } else {
      return `I've noted that down: "${title}", due ${dayPrefix}${timeStr}.`;
    }
  }

  return `I've added "${title}" to your tasks.`;
}

/**
 * Resolves which task from a list matches a user's completion/cancellation target query.
 * Handles ambiguity safely without guessing.
 */
export function resolveMatchingTask(
  targetQuery: string,
  pendingTasks: Task[]
): { task: Task | null; ambiguity: TaskAmbiguityResult } {
  const query = (targetQuery || "").trim().toLowerCase();

  // If no specific query was given (e.g. "That task is completed"):
  if (!query) {
    if (pendingTasks.length === 1) {
      return {
        task: pendingTasks[0],
        ambiguity: {
          isAmbiguous: false,
          matchingTasks: [pendingTasks[0]],
          clarificationMessage: "",
        },
      };
    }
    if (pendingTasks.length > 1) {
      const listStr = pendingTasks
        .slice(0, 3)
        .map((t) => `"${t.title}"`)
        .join(", ");
      return {
        task: null,
        ambiguity: {
          isAmbiguous: true,
          matchingTasks: pendingTasks,
          clarificationMessage: `You have multiple pending tasks (${listStr}). Which one did you mean?`,
        },
      };
    }
    return {
      task: null,
      ambiguity: {
        isAmbiguous: false,
        matchingTasks: [],
        clarificationMessage: "You don't have any pending tasks right now.",
      },
    };
  }

  // Exact title match (case-insensitive)
  const exact = pendingTasks.find(
    (t) => t.title.toLowerCase() === query
  );
  if (exact) {
    return {
      task: exact,
      ambiguity: {
        isAmbiguous: false,
        matchingTasks: [exact],
        clarificationMessage: "",
      },
    };
  }

  // Substring matches: "call my friend" matches "Call my friend", "React" matches "Finish React app"
  const substrMatches = pendingTasks.filter((t) => {
    const titleLower = t.title.toLowerCase();
    return titleLower.includes(query) || query.includes(titleLower);
  });

  if (substrMatches.length === 1) {
    return {
      task: substrMatches[0],
      ambiguity: {
        isAmbiguous: false,
        matchingTasks: substrMatches,
        clarificationMessage: "",
      },
    };
  }

  if (substrMatches.length > 1) {
    const listStr = substrMatches
      .slice(0, 3)
      .map((t) => `"${t.title}"`)
      .join(", ");
    return {
      task: null,
      ambiguity: {
        isAmbiguous: true,
        matchingTasks: substrMatches,
        clarificationMessage: `I found multiple matching tasks (${listStr}). Which one did you mean?`,
      },
    };
  }

  // Token overlap fallback
  const queryWords = query.split(/\s+/).filter((w) => w.length > 2);
  const tokenMatches = pendingTasks.filter((t) => {
    const titleLower = t.title.toLowerCase();
    return queryWords.some((w) => titleLower.includes(w));
  });

  if (tokenMatches.length === 1) {
    return {
      task: tokenMatches[0],
      ambiguity: {
        isAmbiguous: false,
        matchingTasks: tokenMatches,
        clarificationMessage: "",
      },
    };
  }

  if (tokenMatches.length > 1) {
    const listStr = tokenMatches
      .slice(0, 3)
      .map((t) => `"${t.title}"`)
      .join(", ");
    return {
      task: null,
      ambiguity: {
        isAmbiguous: true,
        matchingTasks: tokenMatches,
        clarificationMessage: `Which task do you mean? Options: ${listStr}.`,
      },
    };
  }

  return {
    task: null,
    ambiguity: {
      isAmbiguous: false,
      matchingTasks: [],
      clarificationMessage: `I couldn't find a pending task matching "${targetQuery}".`,
    },
  };
}
