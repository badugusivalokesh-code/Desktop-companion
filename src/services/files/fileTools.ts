import type { ChatResponse } from "../../types/chat";
import type { ChatProvider } from "../chat/chatProvider";
import type { FileIntent } from "./fileIntent";
import {
  type FileService,
  type FileListResult,
  type FileReadResult,
  type FilenameSearchResult,
  type TextSearchResult,
} from "./fileService";

const MAX_EXCERPT_CHARS = 12_000;
const MAX_PREVIEW_CHARS = 240;

export interface FileToolDependencies {
  service: FileService;
  analyzer?: Pick<ChatProvider, "analyzeFileContext">;
}

export interface FileToolResult extends ChatResponse {}

function response(content: string, emotion: ChatResponse["emotion"] = "neutral"): FileToolResult {
  return { content, emotion };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "The approved folder could not be accessed.";
}

function accessFailure(error: unknown): FileToolResult {
  return response(`I could not access the approved folder: ${errorMessage(error)}`, "concerned");
}

function bounded(value: string, limit: number): { value: string; truncated: boolean } {
  return value.length > limit ? { value: value.slice(0, limit), truncated: true } : { value, truncated: false };
}

function listText(result: FileListResult, structure: boolean): string {
  const entries = result.entries.map((entry) => `${entry.kind === "directory" ? "[dir]" : "[file]"} ${entry.path}`);
  return [
    structure ? `Approved folder structure (root listing: ${result.directory}).` : `Files in approved folder (${result.directory}):`,
    entries.length ? entries.join("\n") : "No allowed source or text files were found here.",
    result.truncated ? "Results were truncated by the bounded listing limit." : "",
  ].filter(Boolean).join("\n");
}

function filenameText(query: string, result: FilenameSearchResult): string {
  return [
    `Filename search for “${query}”:`,
    result.matches.length ? result.matches.map((match) => `[${match.kind}] ${match.path}`).join("\n") : "No matching allowed files were found.",
    `Scanned ${result.scannedFiles} file${result.scannedFiles === 1 ? "" : "s"}; accessed ${result.accessedFiles.length}.`,
    result.skipped ? `Skipped ${result.skipped} file${result.skipped === 1 ? "" : "s"}.` : "",
    result.truncated ? "Results were truncated by the search limit." : "",
  ].filter(Boolean).join("\n");
}

function textSearchText(query: string, result: TextSearchResult): string {
  return [
    `Text search for “${query}”:`,
    result.matches.length
      ? result.matches.map((match) => `${match.path}:${match.line}:${match.column} — ${match.preview.slice(0, MAX_PREVIEW_CHARS)}`).join("\n")
      : "No matching text was found in the allowed file types.",
    `Scanned ${result.scannedFiles} file${result.scannedFiles === 1 ? "" : "s"}; accessed ${result.accessedFiles.length}.`,
    result.skipped ? `Skipped ${result.skipped} file${result.skipped === 1 ? "" : "s"}.` : "",
    result.truncated ? "Results were truncated; this is not proof that no other matches exist." : "",
  ].filter(Boolean).join("\n");
}

function readExcerpt(result: FileReadResult): string {
  const excerpt = bounded(result.content, MAX_EXCERPT_CHARS);
  return [
    `File: ${result.path}`,
    "<untrusted-file-content>",
    excerpt.value,
    "</untrusted-file-content>",
    result.truncated || excerpt.truncated ? "The file excerpt was truncated by the local safety limit." : "",
  ].filter(Boolean).join("\n");
}

/** Execute only a previously parsed, read-only file intent. */
export async function executeFileIntent(
  intent: FileIntent,
  request: string,
  dependencies: FileToolDependencies,
): Promise<FileToolResult> {
  if (intent.kind === "clarify") return response(intent.clarification || "Please clarify which file operation you want.");

  if (intent.kind === "list" || intent.kind === "structure") {
    try {
      const result = await dependencies.service.list(intent.path || "");
      return response(listText(result, intent.kind === "structure"));
    } catch (error: unknown) {
      return accessFailure(error);
    }
  }
  if (intent.kind === "filenameSearch") {
    try {
      const result = await dependencies.service.searchFilenames(intent.query || "");
      return response(filenameText(intent.query || "", result));
    } catch (error: unknown) {
      return accessFailure(error);
    }
  }
  if (intent.kind === "textSearch") {
    try {
      const result = await dependencies.service.searchText(intent.query || "");
      return response(textSearchText(intent.query || "", result));
    } catch (error: unknown) {
      return accessFailure(error);
    }
  }

  let result: FileReadResult;
  try {
    result = await dependencies.service.read(intent.path || "");
  } catch (error: unknown) {
    return accessFailure(error);
  }
  const excerpt = readExcerpt(result);
  if (!dependencies.analyzer?.analyzeFileContext) {
    return response(`${excerpt}\n\nI read the file, but this provider cannot explain local file contents.`, "concerned");
  }
  try {
    // Deliberately omit chat history. The analyzer gets only this request and
    // the bounded, explicitly accessed excerpt.
    const analyzed = await dependencies.analyzer.analyzeFileContext(excerpt, request);
    return response(`${analyzed.content}\n\nAccessed: ${result.path}${result.truncated ? " (read result truncated)" : ""}`, analyzed.emotion);
  } catch (error: unknown) {
    return response(`The local file explanation failed: ${errorMessage(error)}`, "concerned");
  }
}
