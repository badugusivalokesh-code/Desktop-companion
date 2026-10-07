import type { ChatMessage, ChatResponse, ConnectionStatus } from "../../types/chat";
import type { ChatProvider } from "./chatProvider";
import {
  getLocalAIConfig,
  type LocalAIConfig,
  MAKIMA_SYSTEM_PROMPT,
  isValidEmotion,
} from "../../config/ai";

interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatResponse {
  model?: string;
  message?: {
    role: string;
    content: string;
  };
  done?: boolean;
  error?: string;
}

interface OllamaTagsResponse {
  models?: Array<{
    name: string;
    model: string;
  }>;
}

/**
 * LocalAIProvider
 *
 * Communicates with a local Ollama HTTP API server (default: http://localhost:11434).
 * Converts conversation history into Ollama chat format, parses structured
 * JSON emotion outputs, and provides resilient error handling for local execution.
 */
export class LocalAIProvider implements ChatProvider {
  private config: LocalAIConfig;

  constructor(customConfig?: Partial<LocalAIConfig>) {
    this.config = {
      ...getLocalAIConfig(),
      ...customConfig,
    };
  }

  /**
   * Checks whether the local Ollama instance is reachable.
   */
  async checkConnection(): Promise<ConnectionStatus> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        return "online";
      }
      return "offline";
    } catch {
      return "offline";
    }
  }

  /**
   * Verifies if the configured model is installed locally in Ollama.
   */
  async isModelAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });

      if (!res.ok) return false;
      const data: OllamaTagsResponse = await res.json();
      const models = data.models || [];

      const target = this.config.model.toLowerCase();
      return models.some((m) => {
        const name = (m.name || m.model || "").toLowerCase();
        return name === target || name.startsWith(`${target}:`) || target.startsWith(`${name}:`);
      });
    } catch {
      return false;
    }
  }

  /**
   * Sends the user's message along with conversation history to Ollama.
   */
  async sendMessage(
    message: string,
    history?: ChatMessage[],
    memoryContext?: string
  ): Promise<ChatResponse> {
    const trimmed = message.trim();
    if (!trimmed) {
      return {
        content: "...",
        emotion: "neutral",
      };
    }

    // Build the system prompt with optional memory context
    const systemContent = memoryContext
      ? `${MAKIMA_SYSTEM_PROMPT}\n\n${memoryContext}`
      : MAKIMA_SYSTEM_PROMPT;

    // Build the messages payload
    const messages: OllamaChatMessage[] = [
      { role: "system", content: systemContent },
    ];

    // Include recent history (up to last 4 messages: 2 exchanges) to keep context small on CPU
    if (history && history.length > 0) {
      const recent = history.slice(-4);
      for (const msg of recent) {
        messages.push({
          role: msg.role === "companion" ? "assistant" : "user",
          content: msg.content,
        });
      }
    }

    // Append the current message
    messages.push({ role: "user", content: trimmed });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          stream: false,
          format: "json",
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_predict: 120,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle HTTP status errors gracefully
      if (!response.ok) {
        if (response.status === 404) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = typeof errData.error === "string" ? errData.error : "";
          if (errMsg.includes("not found")) {
            return {
              content: `The model "${this.config.model}" is not installed in Ollama. Run "ollama pull ${this.config.model}" in your terminal to install it.`,
              emotion: "concerned",
            };
          }
        }

        return {
          content: `Local AI service returned HTTP status ${response.status}. Please check that your local model is running.`,
          emotion: "concerned",
        };
      }

      const data: OllamaChatResponse = await response.json();
      const rawText = data.message?.content || "";

      return this.parseResponse(rawText);
    } catch (err: unknown) {
      return this.handleError(err);
    }
  }

  /**
   * Robustly parses model output, extracting { content, emotion } with safe fallbacks.
   */
  private parseResponse(raw: string): ChatResponse {
    const trimmed = raw.trim();

    // 1. Attempt direct JSON parse
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        const content = typeof parsed.content === "string" ? parsed.content.trim() : "";
        const emotion = isValidEmotion(parsed.emotion) ? parsed.emotion : "neutral";

        if (content) {
          return { content, emotion };
        }
      }
    } catch {
      // Fall through to regex extraction
    }

    // 2. Attempt extracting JSON block enclosed in markdown or braces
    try {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed && typeof parsed === "object") {
          const content = typeof parsed.content === "string" ? parsed.content.trim() : "";
          const emotion = isValidEmotion(parsed.emotion) ? parsed.emotion : "neutral";
          if (content) {
            return { content, emotion };
          }
        }
      }
    } catch {
      // Fall through to plain text extraction
    }

    // 3. Fallback: treat raw output as plain text
    // Clean up any stray JSON artifacts
    let cleanContent = trimmed
      .replace(/^```(json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .replace(/^\{\s*"content"\s*:\s*"?/i, "")
      .replace(/"?\s*,\s*"emotion"\s*:[\s\S]*$/i, "")
      .replace(/^"/, "")
      .replace(/"$/, "")
      .trim();

    if (!cleanContent) {
      cleanContent = "I'm listening. Tell me what you're working on.";
    }

    return {
      content: cleanContent,
      emotion: "neutral",
    };
  }

  /**
   * Translates network and runtime exceptions into friendly in-character responses.
   */
  private handleError(err: unknown): ChatResponse {
    if (err instanceof Error) {
      // Abort / Timeout error
      if (err.name === "AbortError") {
        return {
          content:
            "The local AI took too long to respond. The model may still be loading into system memory.",
          emotion: "concerned",
        };
      }

      // Network unreachable / Connection refused
      // "fetch failed" = Node/Tauri runtime; "Failed to fetch" = browser; "NetworkError" = Firefox
      if (
        err.message.toLowerCase().includes("fetch failed") ||
        err.message.toLowerCase().includes("failed to fetch") ||
        err.message.includes("NetworkError") ||
        err.message.includes("connection refused") ||
        err.message.includes("ECONNREFUSED")
      ) {
        return {
          content: `I can't reach the local AI service. Please make sure Ollama is running locally at ${this.config.baseUrl}.`,
          emotion: "concerned",
        };
      }
    }

    return {
      content:
        "I was unable to communicate with the local AI service. Please verify that Ollama is running and try again.",
      emotion: "concerned",
    };
  }
}

/** Default singleton instance */
export const localAIProvider = new LocalAIProvider();

