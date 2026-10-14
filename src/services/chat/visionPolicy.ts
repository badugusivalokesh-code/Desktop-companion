const MAX_ENCODED_JPEG_BYTES = 4 * 1024 * 1024;

/** Return a root-only loopback HTTP origin, or refuse the vision request. */
export function localVisionBaseUrl(baseUrl: string): string | null {
  if (typeof baseUrl !== "string" || !/^http:\/\//i.test(baseUrl) || baseUrl !== baseUrl.trim()) {
    return null;
  }
  const match = /^http:\/\/([^/?#]*)([^?#]*)([?#].*)?$/i.exec(baseUrl);
  if (!match || (match[2] !== "" && match[2] !== "/") || match[3] || match[1].includes("@")) {
    return null;
  }
  try {
    const url = new URL(baseUrl);
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase()) ||
      url.username || url.password
    ) {
      return null;
    }
    // Reject URL parser host canonicalization (including alternate IP spellings).
    const authorityHost = match[1].replace(/:\d+$/, "").toLowerCase();
    if (!["localhost", "127.0.0.1", "[::1]"].includes(authorityHost)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Only simple local Ollama names are eligible for image processing. */
export function isLocalVisionModel(model: unknown): model is string {
  return (
    typeof model === "string" &&
    /^[a-z0-9][a-z0-9_.-]*(?::[a-z0-9][a-z0-9_.-]*)?$/i.test(model) &&
    !/(?:cloud|remote)/i.test(model)
  );
}

export function isLocalShowMetadata(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const show = data as Record<string, unknown>;
  // Any non-empty remote target means Ollama may relay the image elsewhere.
  const isEmpty = (value: unknown) =>
    value === undefined || value === null || (typeof value === "string" && value.trim() === "");
  return isEmpty(show.remote_model) && isEmpty(show.remote_host);
}

/** Validate the JPEG payload before it is placed in a request body. */
export function jpegBase64FromDataUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_ENCODED_JPEG_BYTES + 23) return null;
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const encoded = match[1];
  if (encoded.length > MAX_ENCODED_JPEG_BYTES || encoded.length % 4 !== 0) return null;
  try {
    const bytes = atob(encoded);
    if (
      bytes.length < 5 ||
      bytes.charCodeAt(0) !== 0xff ||
      bytes.charCodeAt(1) !== 0xd8 ||
      bytes.charCodeAt(2) !== 0xff ||
      bytes.charCodeAt(bytes.length - 2) !== 0xff ||
      bytes.charCodeAt(bytes.length - 1) !== 0xd9
    ) return null;
    return encoded;
  } catch {
    return null;
  }
}
