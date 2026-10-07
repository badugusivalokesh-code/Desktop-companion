import { parseNaturalDateTime } from "./dateTimeParser";
import { detectTaskIntent, resolveMatchingTask } from "./taskDetector";
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

console.log("\nALL 10 TEST SUITES PASSED SUCCESSFULLY!");
