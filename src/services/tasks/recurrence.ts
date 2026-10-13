import type { RecurrenceRule } from "../../types/task";

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function getLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zonedParts(date: Date, timezone: string): ZonedParts {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(date);
    const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return {
      year: value("year"),
      month: value("month"),
      day: value("day"),
      hour: value("hour"),
      minute: value("minute"),
    };
  } catch {
    const local = new Date(date);
    return {
      year: local.getFullYear(),
      month: local.getMonth() + 1,
      day: local.getDate(),
      hour: local.getHours(),
      minute: local.getMinutes(),
    };
  }
}

function timezoneOffsetMs(date: Date, timezone: string): number {
  const parts = zonedParts(date, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    0,
    0
  );
  return asUtc - date.getTime();
}

/** Converts a wall-clock time in an IANA timezone to an absolute timestamp. */
function zonedWallTimeToTimestamp(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): number {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = wallAsUtc;
  for (let i = 0; i < 3; i += 1) {
    candidate = wallAsUtc - timezoneOffsetMs(new Date(candidate), timezone);
  }
  return candidate;
}

function ruleMatches(rule: RecurrenceRule, date: Date): boolean {
  const weekday = isoWeekday(date);
  if (rule.kind === "daily") return true;
  if (rule.kind === "weekdays") return weekday <= 5;
  if (rule.kind === "weekly") return rule.weekdays.includes(weekday);
  return date.getUTCDate() === Math.min(rule.dayOfMonth, daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1));
}

function timeParts(time: string): { hour: number; minute: number } {
  const [rawHour, rawMinute] = time.split(":").map(Number);
  return {
    hour: Math.min(23, Math.max(0, rawHour || 0)),
    minute: Math.min(59, Math.max(0, rawMinute || 0)),
  };
}

/**
 * Calculates the first occurrence strictly after `after` using wall-clock
 * calendar arithmetic. Monthly dates clamp to the last day of short months.
 */
export function calculateNextOccurrence(
  rule: RecurrenceRule,
  after: Date = new Date(),
  timezone: string = getLocalTimezone()
): number | null {
  const current = zonedParts(after, timezone);
  const cursor = new Date(Date.UTC(current.year, current.month - 1, current.day));
  const { hour, minute } = timeParts(rule.time);

  // A valid recurrence must have an occurrence within a year. This also keeps
  // malformed weekly/monthly data from causing an unbounded loop.
  for (let offset = 0; offset <= 366; offset += 1) {
    if (ruleMatches(rule, cursor)) {
      const day =
        rule.kind === "monthly"
          ? Math.min(rule.dayOfMonth, daysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1))
          : cursor.getUTCDate();
      const candidate = zonedWallTimeToTimestamp(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth() + 1,
        day,
        hour,
        minute,
        timezone
      );
      if (candidate > after.getTime()) return candidate;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
}

export function formatRecurrenceRule(rule: RecurrenceRule): string {
  const [hour, minute] = rule.time.split(":").map(Number);
  const time = new Date(2000, 0, 1, hour || 0, minute || 0).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (rule.kind === "daily") return `Every day at ${time}`;
  if (rule.kind === "weekdays") return `Every weekday at ${time}`;
  if (rule.kind === "monthly") return `Monthly on the ${rule.dayOfMonth}${ordinalSuffix(rule.dayOfMonth)} at ${time}`;
  const days = [...rule.weekdays].sort((a, b) => a - b).map((day) => WEEKDAY_NAMES[day - 1]);
  return `Every ${days.join(", ")} at ${time}`;
}

function ordinalSuffix(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  return day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
}
