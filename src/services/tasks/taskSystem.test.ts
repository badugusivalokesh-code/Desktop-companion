import { parseNaturalDateTime, parseNaturalRecurrence } from "./dateTimeParser";
import { detectTaskIntent, resolveMatchingTask } from "./taskDetector";
import { calculateNextOccurrence } from "./recurrence";
import {
  getPendingTasks,
  formatCompactTaskContext,
} from "./taskRetriever";
import type { Task } from "../../types/task";

function assert(cond: unknown, msg?: string): asserts cond {
  if (!cond) throw new Error(msg || "Assertion failed");
}

function strictEqual<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${String(expected)}, got ${String(actual)}`);
  }
}

console.log("=== Running Task & Reminder V1 Test Suite ===");

// Fixed reference date: Wednesday Oct 7, 2026, 09:00:00 AM local
const refDate = new Date(2026, 9, 7, 9, 0, 0);

// Test 1: Date/Time parser - "at 9:25"
{
  const res = parseNaturalDateTime("Remind me at 9:25 to call my friend", refDate);
  assert(res !== null, "Expected parsed date/time for 'at 9:25'");
  const d = new Date(res.timestamp!);
  strictEqual(d.getHours(), 9);
  strictEqual(d.getMinutes(), 25);
  strictEqual(res.isReminder, true);
  console.log("✔ Test 1: 'at 9:25' parsed correctly");
}

// Test 2: Date/Time parser - "tomorrow at 10 AM"
{
  const res = parseNaturalDateTime("I have a meeting tomorrow at 10 AM", refDate);
  assert(res !== null, "Expected parsed date/time for 'tomorrow at 10 AM'");
  const d = new Date(res.timestamp!);
  strictEqual(d.getDate(), 8); // tomorrow
  strictEqual(d.getHours(), 10);
  strictEqual(d.getMinutes(), 0);
  console.log("✔ Test 2: 'tomorrow at 10 AM' parsed correctly");
}

// Test 3: Date/Time parser - "after lunch"
{
  const res = parseNaturalDateTime("Finish the SOS sheets after lunch", refDate);
  assert(res !== null, "Expected parsed date/time for 'after lunch'");
  const d = new Date(res.timestamp!);
  strictEqual(d.getDate(), 7); // today
  strictEqual(d.getHours(), 14); // 2:00 PM
  strictEqual(d.getMinutes(), 0);
  console.log("✔ Test 3: 'after lunch' parsed correctly");
}

// Test 4: Task Detector - Create "Remind me at 9:25 to call my friend."
{
  const intent = detectTaskIntent("Remind me at 9:25 to call my friend.", refDate);
  strictEqual(intent.intent, "create");
  strictEqual(intent.title, "Call my friend");
  assert(intent.reminderAt !== null && intent.reminderAt !== undefined);
  const d = new Date(intent.reminderAt!);
  strictEqual(d.getHours(), 9);
  strictEqual(d.getMinutes(), 25);
  console.log("✔ Test 4: Detect create task 'Remind me at 9:25 to call my friend'");
}

// Test 5: Task Detector - Create "I have a meeting tomorrow at 10 AM."
{
  const intent = detectTaskIntent("I have a meeting tomorrow at 10 AM.", refDate);
  strictEqual(intent.intent, "create");
  strictEqual(intent.title, "Meeting");
  assert(intent.dueAt !== null && intent.dueAt !== undefined);
  const d = new Date(intent.dueAt!);
  strictEqual(d.getDate(), 8);
  strictEqual(d.getHours(), 10);
  console.log("✔ Test 5: Detect create task 'I have a meeting tomorrow at 10 AM'");
}

// Test 6: Task Detector - Create "Finish the SOS sheets after lunch."
{
  const intent = detectTaskIntent("Finish the SOS sheets after lunch.", refDate);
  strictEqual(intent.intent, "create");
  strictEqual(intent.title, "Finish the SOS sheets");
  assert(intent.dueAt !== null && intent.dueAt !== undefined);
  console.log("✔ Test 6: Detect create task 'Finish the SOS sheets after lunch'");
}

// Test 7: Task Detector - Complete commands
{
  const r1 = detectTaskIntent("I finished the call my friend task.");
  strictEqual(r1.intent, "complete");
  strictEqual(r1.targetQuery, "call my friend");

  const r2 = detectTaskIntent("Mark the React task as done.");
  strictEqual(r2.intent, "complete");
  strictEqual(r2.targetQuery, "React");

  const r3 = detectTaskIntent("That task is completed.");
  strictEqual(r3.intent, "complete");
  strictEqual(r3.targetQuery, "");
  console.log("✔ Test 7: Detect complete commands");
}

// Test 8: Task Detector - Cancel commands
{
  const r1 = detectTaskIntent("Cancel the React task.");
  strictEqual(r1.intent, "cancel");
  strictEqual(r1.targetQuery, "React");

  const r2 = detectTaskIntent("Don't remind me about the React task.");
  strictEqual(r2.intent, "cancel");
  strictEqual(r2.targetQuery, "React");
  console.log("✔ Test 8: Detect cancel commands");
}

// Test 9: Ambiguity resolution
{
  const sampleTasks: Task[] = [
    {
      id: "1",
      title: "Call my friend",
      status: "pending",
      dueAt: null,
      reminderAt: 1000,
      createdAt: 1000,
      updatedAt: 1000,
      source: "explicit",
    },
    {
      id: "2",
      title: "Fix React login bug",
      status: "pending",
      dueAt: null,
      reminderAt: null,
      createdAt: 1000,
      updatedAt: 1000,
      source: "explicit",
    },
    {
      id: "3",
      title: "Deploy React app",
      status: "pending",
      dueAt: null,
      reminderAt: null,
      createdAt: 1000,
      updatedAt: 1000,
      source: "explicit",
    },
  ];

  // Unique match
  const match1 = resolveMatchingTask("call my friend", sampleTasks);
  assert(!match1.ambiguity.isAmbiguous);
  strictEqual(match1.task?.id, "1");

  // Ambiguous match ("React" matches 2 tasks)
  const match2 = resolveMatchingTask("React", sampleTasks);
  assert(match2.ambiguity.isAmbiguous);
  strictEqual(match2.task, null);
  strictEqual(match2.ambiguity.matchingTasks.length, 2);

  // No match
  const match3 = resolveMatchingTask("Kotlin project", sampleTasks);
  assert(!match3.ambiguity.isAmbiguous);
  strictEqual(match3.task, null);

  console.log("✔ Test 9: Ambiguity resolution handles 1 match, multiple matches, and 0 matches");
}

// Test 10: Task Retriever and Compact Context formatting
{
  const now = refDate.getTime();
  const tasks: Task[] = [
    {
      id: "t1",
      title: "Finish SOS sheets",
      status: "pending",
      dueAt: now + 6 * 3600 * 1000, // today 3:00 PM
      reminderAt: null,
      createdAt: now,
      updatedAt: now,
      source: "explicit",
    },
    {
      id: "t2",
      title: "Call friend",
      status: "pending",
      dueAt: null,
      reminderAt: now + 25 * 60 * 1000, // reminder 9:25 AM
      createdAt: now,
      updatedAt: now,
      source: "explicit",
    },
    {
      id: "t3",
      title: "Completed old item",
      status: "completed",
      dueAt: null,
      reminderAt: null,
      createdAt: now - 10000,
      updatedAt: now,
      source: "explicit",
    },
  ];

  const pending = getPendingTasks(tasks);
  strictEqual(pending.length, 2);

  const contextStr = formatCompactTaskContext("What are my tasks for today?", tasks);
  assert(contextStr.includes("[Task Context]"));
  assert(contextStr.includes("Finish SOS sheets"));
  assert(contextStr.includes("Call friend"));
  console.log("✔ Test 10: Compact task context formatted correctly:\n" + contextStr);
}

console.log("\nBASE TASK TEST SUITES PASSED SUCCESSFULLY!");

// Test 11: Recurrence parser and detector
{
  const daily = detectTaskIntent("Remind me every day at 8 AM to exercise.", refDate);
  strictEqual(daily.intent, "create");
  strictEqual(daily.title, "Exercise");
  strictEqual(daily.recurrence?.kind, "daily");
  strictEqual(daily.recurrence?.time, "08:00");

  const weekly = parseNaturalRecurrence("Remind me every Monday and Wednesday at 9 AM to plan my week", refDate);
  assert(weekly !== null && weekly.rule.kind === "weekly");
  strictEqual(weekly.rule.weekdays.join(","), "1,3");

  const weekdays = parseNaturalRecurrence("Remind me every weekday at 6 PM to study", refDate);
  assert(weekdays !== null && weekdays.rule.kind === "weekdays");
  strictEqual(weekdays.rule.time, "18:00");

  const monthly = parseNaturalRecurrence("Remind me on the 15th of every month at 10 AM to pay my bill", refDate);
  assert(monthly !== null && monthly.rule.kind === "monthly");
  strictEqual(monthly.rule.dayOfMonth, 15);
  console.log("✔ Test 11: Daily, selected weekday, weekday, and monthly recurrence parsed");
}

// Test 12: Ambiguous recurrence asks for missing scheduling information
{
  const ambiguous = detectTaskIntent("Remind me every day to exercise", refDate);
  strictEqual(ambiguous.intent, "clarify");
  assert(ambiguous.clarificationMessage?.includes("time"));
  console.log("✔ Test 12: Ambiguous recurring schedule requests clarification");
}

// Test 13: Next occurrence calculation, month-end clamping, and DST-safe wall time
{
  const monthly31 = calculateNextOccurrence(
    { kind: "monthly", dayOfMonth: 31, time: "09:00" },
    new Date("2026-02-01T00:00:00.000Z"),
    "UTC"
  );
  assert(monthly31 !== null);
  strictEqual(new Date(monthly31!).toISOString(), "2026-02-28T09:00:00.000Z");

  const dailyNewYork = calculateNextOccurrence(
    { kind: "daily", time: "09:00" },
    new Date("2026-03-07T15:00:00.000Z"),
    "America/New_York"
  );
  assert(dailyNewYork !== null && dailyNewYork > new Date("2026-03-07T15:00:00.000Z").getTime());
  const localParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(dailyNewYork!));
  assert(localParts.endsWith("09:00"));
  console.log("✔ Test 13: Monthly 31st clamps to month end and DST keeps 9 AM wall time");
}

// Test 14: Recurrence lifecycle commands are distinguishable from cancellation
{
  strictEqual(detectTaskIntent("Stop my daily exercise reminder").intent, "cancel");
  strictEqual(detectTaskIntent("Pause my daily exercise reminder").intent, "pause");
  strictEqual(detectTaskIntent("Resume my daily exercise reminder").intent, "resume");
  console.log("✔ Test 14: Stop, pause, and resume intents remain distinct");
}
