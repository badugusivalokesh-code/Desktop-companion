/**
 * Natural language date/time parser for Task & Reminder V1.
 *
 * Deterministic, lightweight, and uses local system time.
 * Supports:
 * - today, tomorrow, tonight
 * - morning, afternoon, evening, after lunch
 * - "at 9", "at 9:25", "at 9 AM", "at 9:25 PM", "10:30 am", etc.
 * - "in X minutes / hours"
 * - recurring schedules such as "every weekday at 6 PM"
 *
 * Does not invent timestamps when input is ambiguous.
 */

import type { RecurrenceRule } from "../../types/task";
import { calculateNextOccurrence, getLocalTimezone } from "./recurrence";

export interface ParsedDateTimeResult {
  timestamp: number | null;
  /** Substring in the original text that expressed the date/time */
  matchedSnippet: string;
  isReminder: boolean;
  hasTime: boolean;
}

export interface ParsedRecurrenceResult {
  rule: RecurrenceRule;
  timestamp: number | null;
  matchedSnippet: string;
  recurrenceTimezone: string;
  clarificationMessage?: string;
}

const WEEKDAY_INDEX: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

function findClockTime(text: string): {
  hour: number;
  minute: number;
  snippet: string;
  index: number;
} | null {
  const regex = /(?:\bat\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawHour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    const meridian = match[3]?.toLowerCase();
    const full = match[0].trim();
    const hasAt = /^at\s+/i.test(full);
    const hasColon = Boolean(match[2]);
    const hasMeridian = Boolean(meridian);
    if (rawHour > 23 || minute > 59 || (!hasAt && !hasColon && !hasMeridian)) continue;

    let hour = rawHour;
    if (meridian === "pm" && hour < 12) hour += 12;
    if (meridian === "am" && hour === 12) hour = 0;
    return { hour, minute, snippet: full, index: match.index };
  }
  return null;
}

/** Parses supported recurring schedule phrases without changing one-time parsing. */
export function parseNaturalRecurrence(
  text: string,
  referenceDate: Date = new Date()
): ParsedRecurrenceResult | null {
  const lower = text.toLowerCase();
  const timezone = getLocalTimezone();
  let rule: RecurrenceRule | null = null;
  let scheduleStart = -1;
  let scheduleEnd = -1;

  const monthlyMatch = lower.match(
    /\b(?:on\s+the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+of\s+every\s+month\b/
  );
  if (monthlyMatch) {
    const day = Number(monthlyMatch[1]);
    if (day >= 1 && day <= 31) {
      rule = { kind: "monthly", dayOfMonth: day, time: "00:00" };
      scheduleStart = monthlyMatch.index ?? 0;
      scheduleEnd = scheduleStart + monthlyMatch[0].length;
    }
  }

  const weekdaysMatch = lower.match(/\bevery\s+weekdays?\b/);
  if (!rule && weekdaysMatch) {
    rule = { kind: "weekdays", time: "00:00" };
    scheduleStart = weekdaysMatch.index ?? 0;
    scheduleEnd = scheduleStart + weekdaysMatch[0].length;
  }

  const dailyMatch = lower.match(/\bevery\s+(?:day|daily)\b/);
  if (!rule && dailyMatch) {
    rule = { kind: "daily", time: "00:00" };
    scheduleStart = dailyMatch.index ?? 0;
    scheduleEnd = scheduleStart + dailyMatch[0].length;
  }

  if (!rule && /\bevery\b/.test(lower)) {
    const weekdayMatches = [...lower.matchAll(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g)];
    const everyIndex = lower.indexOf("every");
    const selected = weekdayMatches
      .filter((match) => match.index !== undefined && match.index > everyIndex)
      .map((match) => WEEKDAY_INDEX[match[1]])
      .filter((day, index, all) => all.indexOf(day) === index);
    if (selected.length > 0) {
      rule = { kind: "weekly", weekdays: selected, time: "00:00" };
      scheduleStart = everyIndex;
      scheduleEnd = (weekdayMatches[selected.length - 1]?.index ?? everyIndex) +
        (weekdayMatches[selected.length - 1]?.[0].length ?? 0);
    } else if (/\bevery\s+(?:week|month|weekend|weekday)/.test(lower)) {
      return {
        rule: { kind: "daily", time: "00:00" },
        timestamp: null,
        matchedSnippet: lower.match(/\bevery\b.*$/)?.[0] ?? "every",
        recurrenceTimezone: timezone,
        clarificationMessage: "Which days and time should I use for that recurring reminder?",
      };
    }
  }

  if (!rule) return null;

  const clock = findClockTime(text);
  if (!clock) {
    return {
      rule,
      timestamp: null,
      matchedSnippet: text.slice(scheduleStart, scheduleEnd),
      recurrenceTimezone: timezone,
      clarificationMessage: "What time should I use for that recurring reminder?",
    };
  }

  const time = `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
  rule = { ...rule, time };
  const end = Math.max(scheduleEnd, clock.index + clock.snippet.length);
  const matchedSnippet = text.slice(Math.min(scheduleStart, clock.index), end).trim();
  return {
    rule,
    timestamp: calculateNextOccurrence(rule, referenceDate, timezone),
    matchedSnippet,
    recurrenceTimezone: timezone,
  };
}

export function parseNaturalDateTime(
  text: string,
  referenceDate: Date = new Date()
): ParsedDateTimeResult | null {
  const lower = text.toLowerCase();

  // 1. Check relative duration: "in 15 minutes", "in 2 hours", "in an hour"
  const relativeMatch = lower.match(
    /\bin\s+(\d+|a|an)\s+(minute|minutes|min|mins|hour|hours|hr|hrs)\b/
  );
  if (relativeMatch) {
    const rawVal = relativeMatch[1];
    const val = rawVal === "a" || rawVal === "an" ? 1 : parseInt(rawVal, 10);
    const unit = relativeMatch[2];
    const msMultiplier = unit.startsWith("h") ? 60 * 60 * 1000 : 60 * 1000;
    const targetMs = referenceDate.getTime() + val * msMultiplier;
    return {
      timestamp: targetMs,
      matchedSnippet: relativeMatch[0],
      isReminder: true,
      hasTime: true,
    };
  }

  // 2. Identify day offset
  let dayOffset = 0;
  let daySnippet = "";
  let baseHour: number | null = null;
  let baseMinute: number | null = null;

  if (/\btomorrow\b/.test(lower)) {
    dayOffset = 1;
    daySnippet = "tomorrow";
  } else if (/\btoday\b/.test(lower)) {
    dayOffset = 0;
    daySnippet = "today";
  } else if (/\btonight\b/.test(lower)) {
    dayOffset = 0;
    daySnippet = "tonight";
    baseHour = 20; // 8:00 PM
    baseMinute = 0;
  } else if (/\bafter\s+lunch\b/.test(lower)) {
    dayOffset = 0;
    daySnippet = "after lunch";
    baseHour = 14; // 2:00 PM
    baseMinute = 0;
  } else if (/\bthis\s+morning\b/.test(lower)) {
    dayOffset = 0;
    daySnippet = "this morning";
    baseHour = 9;
    baseMinute = 0;
  } else if (/\bthis\s+afternoon\b/.test(lower)) {
    dayOffset = 0;
    daySnippet = "this afternoon";
    baseHour = 14;
    baseMinute = 0;
  } else if (/\bthis\s+evening\b/.test(lower)) {
    dayOffset = 0;
    daySnippet = "this evening";
    baseHour = 18;
    baseMinute = 0;
  }

  // 3. Search for explicit clock time:
  // e.g., "at 9:25", "at 9", "at 9 AM", "at 9:25 PM", "at 10:00", "9:25 AM", "10 AM", "3:30 pm"
  const timeRegex =
    /(?:\bat\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi;

  let explicitHour: number | null = null;
  let explicitMinute: number | null = null;
  let matchedTimeSnippet = "";

  // Scan for valid clock times (filter out numbers like years or unrelated numbers)
  let m: RegExpExecArray | null;
  while ((m = timeRegex.exec(text)) !== null) {
    const rawH = parseInt(m[1], 10);
    const rawM = m[2] ? parseInt(m[2], 10) : 0;
    const meridian = m[3]?.toLowerCase();

    // Must be a plausible hour (1-12 or 0-23)
    if (rawH > 23 || rawM > 59) continue;

    // If no meridian and no "at" prefix and no colon, avoid matching random single numbers like "2" or "10"
    const matchedFull = m[0].trim();
    const hasAt = /^at\s+/i.test(matchedFull);
    const hasColon = !!m[2];
    const hasMeridian = !!meridian;

    if (!hasAt && !hasColon && !hasMeridian) {
      // Avoid treating plain numbers as times
      continue;
    }

    let h = rawH;
    if (meridian === "pm" && h < 12) {
      h += 12;
    } else if (meridian === "am" && h === 12) {
      h = 0;
    } else if (!meridian && h < 12 && hasAt && !hasColon) {
      // If user says "at 9" without AM/PM:
      // If 9 AM has already passed today, assume 9 PM (21:00) if upcoming, or next occurrence
      const refH = referenceDate.getHours();
      if (h < refH && h + 12 > refH) {
        h += 12;
      }
    }

    explicitHour = h;
    explicitMinute = rawM;
    matchedTimeSnippet = matchedFull;
    break;
  }

  // If neither explicit clock time nor day/part-of-day period matched, return null
  if (explicitHour === null && baseHour === null) {
    if (daySnippet) {
      // Just "tomorrow" or "today" without specific time
      const target = new Date(referenceDate);
      target.setDate(target.getDate() + dayOffset);
      // Default to 09:00 AM on that day
      target.setHours(9, 0, 0, 0);
      return {
        timestamp: target.getTime(),
        matchedSnippet: daySnippet,
        isReminder: false,
        hasTime: false,
      };
    }
    return null;
  }

  const finalHour = explicitHour !== null ? explicitHour : baseHour!;
  const finalMinute = explicitMinute !== null ? explicitMinute : baseMinute!;

  const target = new Date(referenceDate);
  target.setDate(target.getDate() + dayOffset);
  target.setHours(finalHour, finalMinute, 0, 0);

  // If no explicit day offset was given, and the target time is already in the past today:
  // e.g. "at 9:25" and current time is 10:00:
  if (dayOffset === 0 && !daySnippet && target.getTime() <= referenceDate.getTime()) {
    // If it's earlier than now and no meridian was specified, try +12h (e.g. 9am passed -> 9pm)
    if (finalHour < 12 && !matchedTimeSnippet.toLowerCase().includes("am")) {
      const pmTarget = new Date(target);
      pmTarget.setHours(finalHour + 12, finalMinute, 0, 0);
      if (pmTarget.getTime() > referenceDate.getTime()) {
        target.setTime(pmTarget.getTime());
      } else {
        // Both passed today, so roll over to tomorrow
        target.setDate(target.getDate() + 1);
      }
    } else {
      // Explicit AM or 24h that passed today -> roll over to tomorrow
      target.setDate(target.getDate() + 1);
    }
  }

  // Combine snippets for title cleaning
  const combinedSnippet = [daySnippet, matchedTimeSnippet]
    .filter(Boolean)
    .join(" ");

  return {
    timestamp: target.getTime(),
    matchedSnippet: combinedSnippet,
    isReminder: lower.includes("remind") || lower.includes("reminder"),
    hasTime: true,
  };
}

/**
 * Strips matched date/time phrases, connectors, and punctuation from task title.
 */
export function cleanTitleFromDateTime(
  title: string,
  matchedSnippet: string
): string {
  let cleaned = title;
  if (matchedSnippet) {
    // Remove the exact snippet or components
    const words = matchedSnippet.split(/\s+/).filter(Boolean);
    for (const w of words) {
      const re = new RegExp(`\\b${escapeRegExp(w)}\\b`, "gi");
      cleaned = cleaned.replace(re, " ");
    }
  }

  // Clean trailing/leading prepositions & connectors like "tomorrow at", "at", "on", "for", "by"
  cleaned = cleaned
    .replace(/\b(tomorrow|today|tonight|morning|afternoon|evening|after lunch|every|daily|weekdays?|monthly|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
    .replace(/\b(at|on|for|by|in|due)\b\s*$/i, "")
    .replace(/^\s*\b(at|on|for|by|in|due)\b/i, "")
    .replace(/^\s*\b(to|about|for)\b\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[:\-\s,.]+|[:\-\s,.]+$/g, "")
    .trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
