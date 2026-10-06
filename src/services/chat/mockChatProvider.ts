import type { ChatMessage, ChatResponse, ConnectionStatus } from "../../types/chat";
import type { ChatProvider } from "./chatProvider";

export type { ChatProvider };

/**
 * Mock response rule mapping keyword patterns to in-character replies and emotions.
 */
interface MockRule {
  pattern: RegExp;
  content: string;
  emotion: ChatResponse["emotion"];
}

const MOCK_RULES: MockRule[] = [
  {
    pattern: /\b(hello|hi|hey|greetings|morning|afternoon|evening)\b/i,
    content: "Hello. What are you working on?",
    emotion: "neutral",
  },
  {
    pattern: /\b(finish|finished|done|completed|task done)\b/i,
    content: "Good. One less thing to worry about.",
    emotion: "satisfied",
  },
  {
    pattern: /\b(tired|exhausted|sleepy|drained|burnout|need a break)\b/i,
    content: "Then take a short break before continuing.",
    emotion: "concerned",
  },
  {
    pattern: /\b(thank|thanks|appreciate|helpful)\b/i,
    content: "You're welcome. Keep up the momentum.",
    emotion: "happy",
  },
  {
    pattern: /\b(joke|funny|laugh|meme|haha|hehe)\b/i,
    content: "I don't usually tell jokes, but you seem easily amused.",
    emotion: "amused",
  },
  {
    pattern: /\b(who are you|your name|what are you)\b/i,
    content: "I'm Makima. I will be assisting you from your desktop.",
    emotion: "neutral",
  },
  {
    pattern: /\b(sad|unhappy|depressed|down|upset|cry)\b/i,
    content: "Focus on what you can control right now.",
    emotion: "sad",
  },
  {
    pattern: /\b(annoy|annoyed|bother|irritated|frustrated|angry)\b/i,
    content: "Complaining won't make your work finish itself.",
    emotion: "annoyed",
  },
  {
    pattern: /\b(wow|amazing|unbelievable|surprise|surprised|really\?)\b/i,
    content: "Is that really so unexpected?",
    emotion: "surprised",
  },
  {
    pattern: /\b(help|assist|what can you do)\b/i,
    content: "I'm keeping watch over your workspace. Let me know when you need guidance.",
    emotion: "neutral",
  },
];

const DEFAULT_RESPONSES: ChatResponse[] = [
  { content: "I'm listening. Tell me more.", emotion: "neutral" },
  { content: "Stay focused on your objective.", emotion: "neutral" },
  { content: "I see. Let's proceed steadily.", emotion: "satisfied" },
  { content: "Understood. Keep going.", emotion: "neutral" },
];

/**
 * MockChatProvider
 *
 * Simulates an in-character AI response with a short delay (500ms - 800ms).
 * Kept for testing, offline demonstrations, and fallback.
 */
export class MockChatProvider implements ChatProvider {
  private responseIndex = 0;

  async sendMessage(message: string, _history?: ChatMessage[]): Promise<ChatResponse> {
    const trimmed = message.trim();

    // Check matched rules
    for (const rule of MOCK_RULES) {
      if (rule.pattern.test(trimmed)) {
        await this.delay(550 + Math.random() * 250);
        return {
          content: rule.content,
          emotion: rule.emotion,
        };
      }
    }

    // Default rotational response
    await this.delay(600 + Math.random() * 200);
    const fallback = DEFAULT_RESPONSES[this.responseIndex % DEFAULT_RESPONSES.length];
    this.responseIndex++;
    return fallback;
  }

  async checkConnection(): Promise<ConnectionStatus> {
    return "online";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Singleton instance used for testing and fallback */
export const mockChatProvider = new MockChatProvider();
