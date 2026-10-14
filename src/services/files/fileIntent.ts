export type FileIntentKind = "list" | "structure" | "read" | "filenameSearch" | "textSearch" | "clarify";

export interface FileIntent {
  kind: FileIntentKind;
  /** A relative path exactly as requested. It is deliberately not normalized. */
  path?: string;
  /** A search term exactly as requested, including its case. */
  query?: string;
  clarification?: string;
}

function stripSentenceEnd(value: string): string {
  return value.trim().replace(/[.!?,;:]+$/, "").trim();
}

function quotedOrBare(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    if (trimmed[trimmed.length - 1] !== quote || trimmed.length < 2) return null;
    return trimmed.slice(1, -1);
  }
  return stripSentenceEnd(trimmed);
}

function clarification(message: string): FileIntent {
  return { kind: "clarify", clarification: message };
}

function isRefusal(value: string): boolean {
  // A file request is observational only. Do not route commands or mutations to it.
  return /\b(?:write|change|edit|modify|delete|remove|rename|move|create|save|overwrite|run|execute|shell|terminal|command|install|uninstall)\b/i.test(value) ||
    /\b(?:and|then|also)\s+(?:list|show|read|open|search|find|write|change|edit|run|execute)\b/i.test(value) ||
    /^\s*(?:please\s+)?(?:do\s+not|don't|dont|never|not)\b/i.test(value);
}

function isQuotedWholeRequest(value: string): boolean {
  const first = value[0];
  return (first === '"' || first === "'") && value[value.length - 1] === first;
}

/**
 * Deterministic, anchored parser for the small set of read-only file requests.
 * It intentionally returns null for conversational guesses and mutations.
 */
export function detectFileIntent(text: string): FileIntent | null {
  const value = text.trim();
  if (!value || isQuotedWholeRequest(value) || isRefusal(value)) return null;

  // This is the one natural-language exception where a missing subject is
  // useful feedback rather than permission to guess.
  if (/^find\s+where\s+(?:(?:the|this)\s+)?function\s+is\s+defined[.!?]?$/i.test(value)) {
    return clarification("Which function name should I search for?");
  }

  // A request for a named symbol is a literal text search. Do not claim to
  // have found a definition merely because the wording says “defined”.
  const defined = value.match(/^find\s+where\s+(.+?)\s+is\s+defined[.!?]?$/i);
  if (defined) {
    const query = quotedOrBare(defined[1]);
    return query ? { kind: "textSearch", query } : clarification("Which function or symbol name should I search for?");
  }

  // Root/relative listings are intentionally separate from structure so the
  // caller can label the bounded root-only view accurately.
  const structure = value.match(/^(?:please\s+)?(?:show|list|describe|summari[sz]e)\s+(?:the\s+)?folder\s+structure(?:\s+(?:of|in|for)\s+(.+?))?[.!?]?$/i);
  if (structure) {
    const path = structure[1] ? quotedOrBare(structure[1]) : undefined;
    return structure[1] && !path ? clarification("Which folder structure should I list?") : { kind: "structure", path: path || undefined };
  }

  const list = value.match(/^(?:please\s+)?(?:list|show)\s+(?:the\s+)?(?:files|contents)(?:\s+(?:in|under|at)\s+(.+?))?[.!?]?$/i);
  if (list) {
    const requested = list[1] ? quotedOrBare(list[1]) : undefined;
    // “selected/approved project folder” names the already approved root, not
    // a relative path supplied by the user.
    if (requested && /^(?:my\s+)?(?:selected|approved)(?:\s+project)?\s+folder$/i.test(requested)) {
      return { kind: "list" };
    }
    return list[1] && !requested ? clarification("Which folder should I list?") : { kind: "list", path: requested || undefined };
  }
  if (/^(?:please\s+)?(?:list|show)\s+(?:the\s+)?files?\s*$/i.test(value)) return { kind: "list" };

  const filename = value.match(/^(?:please\s+)?(?:find|search)\s+(?:for\s+)?(?:files?\s+)?(?:named|called)\s+(.+?)[.!?]?$/i);
  if (filename) {
    const query = quotedOrBare(filename[1]);
    return query ? { kind: "filenameSearch", query } : clarification("What filename should I search for?");
  }
  if (/^(?:please\s+)?(?:find|search)\s+(?:for\s+)?(?:files?\s+)?(?:named|called)\s*$/i.test(value)) {
    return clarification("What filename should I search for?");
  }

  const search = value.match(/^(?:please\s+)?(?:search|find)\s+(?:(?:this|the)\s+)?(?:project|codebase|files?)?\s*(?:for\s+)(?:(?:usages?|references?|occurrences?)\s+of\s+)?(.+?)[.!?]?$/i);
  if (search) {
    const query = quotedOrBare(search[1]);
    return query ? { kind: "textSearch", query } : clarification("What text should I search for?");
  }
  if (/^(?:please\s+)?(?:search|find)\b/i.test(value)) {
    return clarification("Should I search filenames or file text, and what should I search for?");
  }

  // Keep the package-dependency phrasing explicit and deterministic.
  if (/^(?:please\s+)?(?:read|explain|show|open)\s+package\s+(?:the\s+)?dependencies[.!?]?$/i.test(value)) {
    return { kind: "read", path: "package.json" };
  }

  const read = value.match(/^(?:please\s+)?(?:read|open|explain|summari[sz]e|show)\s+(?:the\s+)?(?:(?:code|contents?)\s+(?:in|of)\s+)?(.+?)(?:\s+and\s+(?:explain|describe|summari[sz]e)\b.*)?[.!?]?$/i);
  if (read) {
    const requested = quotedOrBare(read[1]);
    if (!requested) return clarification("Which file should I read?");
    // Preserve ../ and unsupported extensions here: the backend must reject
    // them rather than the parser silently converting them to a safe basename.
    return { kind: "read", path: requested };
  }
  if (/^(?:please\s+)?(?:read|open|explain|summari[sz]e|show)\b/i.test(value)) {
    return clarification("Which file should I read?");
  }

  return null;
}
