/**
 * All supported emotion states for the desktop companion character.
 * Phase 2 will drive these states from AI analysis; for now they are
 * set manually or default to "neutral".
 */
export type CharacterEmotion =
  | "neutral"
  | "happy"
  | "satisfied"
  | "amused"
  | "concerned"
  | "sad"
  | "disappointed"
  | "surprised"
  | "annoyed";

/** Props accepted by any component that renders/reacts to emotion. */
export interface CharacterEmotionProps {
  emotion: CharacterEmotion;
}

