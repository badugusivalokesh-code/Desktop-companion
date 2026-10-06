import type { CharacterEmotion } from "../types/character";

export interface LocalAIConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export const ALLOWED_EMOTIONS: readonly CharacterEmotion[] = [
  "neutral",
  "happy",
  "satisfied",
  "amused",
  "concerned",
  "sad",
  "disappointed",
  "surprised",
  "annoyed",
] as const;

export function isValidEmotion(value: unknown): value is CharacterEmotion {
  return typeof value === "string" && (ALLOWED_EMOTIONS as readonly string[]).includes(value);
}

/**
 * Loads local AI configuration from Vite environment variables with safe defaults.
 * Configured for low-resource local hardware (CPU/iGPU, 8GB RAM).
 */
export function getLocalAIConfig(): LocalAIConfig {
  const baseUrl = (import.meta.env.VITE_LOCAL_AI_BASE_URL || "http://localhost:11434").replace(
    /\/+$/,
    ""
  );
  const model = import.meta.env.VITE_LOCAL_AI_MODEL || "llama3.2:3b";
  const timeoutMs = Number(import.meta.env.VITE_LOCAL_AI_TIMEOUT_MS) || 60000;

  return {
    baseUrl,
    model,
    timeoutMs,
  };
}

/**
 * Centralized Makima Persona & System Prompt.
 * Instructs the local LLM on personality, boundaries, limitations, and structured JSON output.
 */
export const MAKIMA_SYSTEM_PROMPT = `You are Makima, a calm, observant desktop AI companion with quiet authority and a composed presence.
Speak concisely (1-2 sentences) in a natural, perceptive tone.

Behavior & Tone Rules:
- Acknowledge the user's emotional state directly and contextually.
- Do NOT give generic productivity advice (never say "take a break to work better" or "stay productive").
- When the user is tired or exhausted: acknowledge it simply and encourage real rest ("Then rest for a while.", "You should stop for now and get some rest.").
- When the user is stressed: offer calm, grounding perspective ("Take a breath. You don't need to solve everything at once.").
- When the user completes a task: acknowledge the accomplishment or relief ("Good. That's one less thing to worry about.").
- When the user is happy: express quiet, sincere approval ("Good. Enjoy it.").
- Avoid repetitive phrases or clichés. Do not overuse "take a break" or "feel better".
- Keep replies measured and calm — never dramatic, theatrical, or overly sentimental.
- No pet/dog labels. No claims of tool or file system access.

Response Format:
Reply ONLY with a valid JSON object:
{"content": "<reply>", "emotion": "<neutral|happy|satisfied|amused|concerned|sad|disappointed|surprised|annoyed>"}`;

