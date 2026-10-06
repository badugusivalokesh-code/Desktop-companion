/**
 * Makima character asset map.
 *
 * Vite resolves all matching images at build time via import.meta.glob.
 * If an emotion-specific image is absent the component falls back to neutral.
 * If neutral is also absent the component shows a "drop artwork here" prompt.
 *
 * Supported extensions: png, webp, jpg, jpeg, gif
 * Required file:        neutral.png  (or neutral.webp / neutral.jpg …)
 */
import type { CharacterEmotion } from "../../../types/character";

/**
 * All images in this directory, keyed by relative path.
 * Vite eagerly resolves them to hashed asset URLs at build time.
 * If the directory has no matching files, this is an empty object — no error.
 */
const modules = import.meta.glob<string>(
  "./*.{png,webp,jpg,jpeg,gif}",
  { eager: true, query: "?url", import: "default" }
);

/**
 * Resolve the URL for a given emotion stem (e.g. "happy").
 * Tries each supported extension in preference order.
 * Returns an empty string when no matching file exists.
 */
const resolve = (stem: string): string => {
  for (const ext of ["png", "webp", "jpg", "jpeg", "gif"]) {
    const key = `./${stem}.${ext}`;
    if (modules[key]) return modules[key];
  }
  return "";
};

const neutral = resolve("neutral");

/**
 * Resolved asset URLs for every emotion.
 * Falls back to neutral when an emotion-specific image is missing.
 */
export const characterAssets: Record<CharacterEmotion, string> = {
  neutral:      neutral,
  happy:        resolve("happy")        || neutral,
  satisfied:    resolve("satisfied")    || neutral,
  amused:       resolve("amused")       || neutral,
  concerned:    resolve("concerned")    || neutral,
  sad:          resolve("sad")          || neutral,
  disappointed: resolve("disappointed") || neutral,
  surprised:    resolve("surprised")    || neutral,
  annoyed:      resolve("annoyed")      || neutral,
};

/**
 * `true` when at least the neutral artwork file is present.
 * Used by the Character component to decide whether to render the image
 * or show the "add artwork" placeholder.
 */
export const hasArtwork: boolean = neutral !== "";

