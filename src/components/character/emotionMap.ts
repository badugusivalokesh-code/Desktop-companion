import type { CharacterEmotion } from "../../types/character";

/**
 * Maps each emotion to descriptors used by the character layer.
 *
 * `cssClass` — applied to the character root for per-emotion CSS hooks.
 *              Useful for tinting overlays, border accents, etc.
 * `label`    — human-readable string for aria-label and debug output.
 *
 * Note: SVG-specific fields (eyeStyle, mouthPath, blushAlpha) were removed
 * when the character switched from procedural SVG to image assets. If an
 * animated overlay approach is added in a later phase, extend this interface.
 */
export interface EmotionDescriptor {
  cssClass: string;
  label: string;
}

export const emotionMap: Record<CharacterEmotion, EmotionDescriptor> = {
  neutral:      { cssClass: "emotion-neutral",      label: "Neutral"      },
  happy:        { cssClass: "emotion-happy",         label: "Happy"        },
  satisfied:    { cssClass: "emotion-satisfied",     label: "Satisfied"    },
  amused:       { cssClass: "emotion-amused",        label: "Amused"       },
  concerned:    { cssClass: "emotion-concerned",     label: "Concerned"    },
  sad:          { cssClass: "emotion-sad",           label: "Sad"          },
  disappointed: { cssClass: "emotion-disappointed",  label: "Disappointed" },
  surprised:    { cssClass: "emotion-surprised",     label: "Surprised"    },
  annoyed:      { cssClass: "emotion-annoyed",       label: "Annoyed"      },
};
