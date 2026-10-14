import { detectFileIntent } from "./fileIntent";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const list = detectFileIntent("List the files in my selected project folder.");
assert(list?.kind === "list" && !list.path, "Approved-root listing should be detected");

const structure = detectFileIntent("Show the folder structure.");
assert(structure?.kind === "structure", "Structure requests should be distinct");

const read = detectFileIntent("Read package.json and explain the dependencies.");
assert(read?.kind === "read" && read.path === "package.json", "Dependency read request should be detected");

const app = detectFileIntent("Explain the code in src/App.tsx.");
assert(app?.kind === "read" && app.path === "src/App.tsx", "Path and case must be preserved");

const text = detectFileIntent("Search this project for usages of useEffect.");
assert(text?.kind === "textSearch" && text.query === "useEffect", "Text search term case must be preserved");

const names = detectFileIntent("Find files named App.tsx");
assert(names?.kind === "filenameSearch" && names.query === "App.tsx", "Filename query case must be preserved");

const missingFunction = detectFileIntent("Find where this function is defined");
assert(missingFunction?.kind === "clarify", "Missing function name should ask for clarification");

const literalDefinition = detectFileIntent("Find where useFoo is defined");
assert(literalDefinition?.kind === "textSearch" && literalDefinition.query === "useFoo", "Definitions must search literally");

const quotedPath = detectFileIntent('Read "src/My File.tsx"');
assert(quotedPath?.kind === "read" && quotedPath.path === "src/My File.tsx", "Quoted path whitespace must be preserved");

const traversal = detectFileIntent("Read ../package.json");
assert(traversal?.kind === "read" && traversal.path === "../package.json", "Traversal must reach backend rejection intact");

assert(!detectFileIntent('"Read package.json"'), "Quoted requests must not execute");
assert(!detectFileIntent("Please change package.json"), "Write requests must not be file-read intents");
assert(!detectFileIntent("Run shell command to read package.json"), "Shell requests must not execute");

console.log("File intent tests passed.");
