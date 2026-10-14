import { executeFileIntent } from "./fileTools";
import type { FileService } from "./fileService";
import type { FileIntent } from "./fileIntent";
import { LocalAIProvider } from "../chat/localAIProvider";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runTests(): Promise<void> {
const service: FileService = {
  selectFolder: async () => ({ path: "/project" }),
  revokeFolder: async () => {},
  getApprovedFolder: async () => ({ path: "/project" }),
  list: async () => ({ directory: ".", entries: [{ path: "src/App.tsx", name: "App.tsx", kind: "file", sizeBytes: 10 }], truncated: false }),
  read: async () => ({ path: "src/App.tsx", content: "export const value = 1;\n", truncated: false }),
  searchFilenames: async () => ({ matches: [{ path: "src/App.tsx", kind: "file" }], truncated: false, skipped: 1, scannedFiles: 3, accessedFiles: ["src/App.tsx"] }),
  searchText: async () => ({ matches: [{ path: "src/App.tsx", line: 1, column: 14, preview: "export const value = 1;" }], truncated: true, skipped: 2, scannedFiles: 4, accessedFiles: ["src/App.tsx"] }),
};

const list = await executeFileIntent({ kind: "structure" }, "Show the folder structure", { service });
assert(list.content.includes("root listing") && list.content.includes("[file] src/App.tsx"), "Structure output should be bounded and labelled");

const filenames = await executeFileIntent({ kind: "filenameSearch", query: "App.tsx" }, "Find files named App.tsx", { service });
assert(filenames.content.includes("Scanned 3 files") && filenames.content.includes("Skipped 1 file"), "Filename metadata should be rendered");

const text = await executeFileIntent({ kind: "textSearch", query: "value" }, "Search for value", { service });
assert(text.content.includes("src/App.tsx:1:14") && text.content.includes("not proof"), "Text paths and truncation qualification should be rendered");

let seenContext = "";
let seenRequest = "";
const analyzed = await executeFileIntent({ kind: "read", path: "src/App.tsx" }, "Explain this file", {
  service,
  analyzer: {
    analyzeFileContext: async (context, request, history) => {
      seenContext = context;
      seenRequest = request;
      assert(history === undefined, "File analysis must not receive chat history");
      return { content: "It exports a value.", emotion: "satisfied" };
    },
  },
});
assert(analyzed.emotion === "satisfied" && analyzed.content.includes("Accessed: src/App.tsx"), "Read analysis should return ChatResponse-compatible output");
assert(seenContext.includes("<untrusted-file-content>") && seenRequest === "Explain this file", "Analyzer receives bounded untrusted context and request");

const denied = await executeFileIntent({ kind: "read", path: "../secret.txt" }, "Read it", {
  service: { ...service, read: async () => { throw new Error("path is outside the approved folder"); } },
});
assert(denied.emotion === "concerned" && denied.content.includes("outside the approved folder"), "Access failures should be reported directly");

const clarify = await executeFileIntent({ kind: "clarify", clarification: "Which file?" } satisfies FileIntent, "", { service });
assert(clarify.content === "Which file?", "Clarification should not access the service");

const originalFetch = globalThis.fetch;
const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
globalThis.fetch = async (input, init) => {
  fetchCalls.push({ url: String(input), init });
  if (String(input).endsWith("/api/show")) return jsonResponse({ capabilities: ["completion"], remote_model: null, remote_host: null });
  return jsonResponse({ message: { content: JSON.stringify({ content: "Safe local explanation", emotion: "neutral" }) } });
};
const provider = new LocalAIProvider({ baseUrl: "http://127.0.0.1:11434", model: "local-model", timeoutMs: 100 });
const untrustedContext = "x".repeat(20_000);
const localResult = await provider.analyzeFileContext(untrustedContext, "r".repeat(3_000), [{ id: "history", role: "user", content: "must not be sent", timestamp: 0 }]);
assert(localResult.content === "Safe local explanation" && fetchCalls.length === 2, "Verified local analysis should call show then chat");
const chatPayload = JSON.parse(String(fetchCalls[1].init?.body));
assert(chatPayload.model === "local-model" && chatPayload.messages.length === 2, "File analysis must omit arbitrary history");
assert(chatPayload.messages[1].content.includes("x".repeat(12_000)) && !chatPayload.messages[1].content.includes("x".repeat(12_001)), "Context must be capped at 12k characters");
assert(chatPayload.messages[1].content.includes("r".repeat(2_000)) && !chatPayload.messages[1].content.includes("r".repeat(2_001)), "Request prompt must be capped at 2k characters");

fetchCalls = [];
const remoteUrl = new LocalAIProvider({ baseUrl: "https://remote.invalid", model: "local-model", timeoutMs: 100 });
await remoteUrl.analyzeFileContext("secret", "explain");
assert(fetchCalls.length === 0, "Remote URL must not be contacted");
const remoteModel = new LocalAIProvider({ baseUrl: "http://localhost:11434", model: "my-model:cloud", timeoutMs: 100 });
await remoteModel.analyzeFileContext("secret", "explain");
assert(fetchCalls.length === 0, "Cloud model name must not be contacted");

globalThis.fetch = async () => jsonResponse({ capabilities: ["completion"], remote_model: "cloud-route" });
const deniedMetadata = await provider.analyzeFileContext("secret", "explain");
assert(deniedMetadata.emotion === "concerned", "Remote metadata must deny file analysis");

globalThis.fetch = async (input, init) => {
  if (String(input).endsWith("/api/show")) return jsonResponse({ capabilities: ["completion"], remote_model: null, remote_host: null });
  return new Promise<Response>((_resolve, reject) => {
    const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    // The provider's timeout must cancel this request; this never reaches a network.
    init?.signal?.addEventListener("abort", abort, { once: true });
  });
};
const timeoutResult = await new LocalAIProvider({ baseUrl: "http://localhost:11434", model: "local-model", timeoutMs: 5 }).analyzeFileContext("secret", "explain");
assert(timeoutResult.emotion === "concerned" && timeoutResult.content.toLowerCase().includes("too long"), "Timeouts must be reported safely");
globalThis.fetch = originalFetch;

console.log("File tool tests passed.");
}

void runTests();
