import React, { useState } from "react";
import "./Character.css";
import type { CharacterEmotion } from "../../types/character";
import { emotionMap } from "./emotionMap";
import { characterAssets, hasArtwork } from "../../assets/character/makima";

interface CharacterProps {
  /** Current emotional state of the companion. Defaults to "neutral". */
  emotion?: CharacterEmotion;
  /** Called when the user left-clicks the character. */
  onClick?: () => void;
  /** Extra CSS class names forwarded to the root element. */
  className?: string;
}

/**
 * Character — image-based desktop companion component.
 *
 * Renders the character artwork supplied in src/assets/character/makima/.
 * Falls back gracefully:
 *   emotion-specific image → neutral image → placeholder prompt
 *
 * The emotion prop drives a CSS class on the root element so per-emotion
 * styling (tints, overlays, transitions) can be added in Character.css
 * without touching this component.
 *
 * To swap character artwork: drop new PNG files into the asset directory
 * and rebuild. No code changes required.
 */
const Character: React.FC<CharacterProps> = ({
  emotion = "neutral",
  onClick,
  className = "",
}) => {
  const [imgError, setImgError] = useState(false);
  const descriptor = emotionMap[emotion];
  const src = characterAssets[emotion];

  // Show placeholder when no artwork has been added yet, or if image fails to load
  const showPlaceholder = !hasArtwork || imgError;

  return (
    <div
      className={`character-root ${descriptor.cssClass} ${className}`}
      onClick={onClick}
      role="button"
      aria-label={`Desktop companion — ${descriptor.label}`}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      <div className="character-float">
        {showPlaceholder ? (
          /* ── No-artwork placeholder ──────────────────────────────────── */
          <div className="character-placeholder">
            <div className="placeholder-icon">◈</div>
            <p className="placeholder-text">
              Add your artwork to
              <br />
              <code>src/assets/character/makima/</code>
              <br />
              <span className="placeholder-hint">neutral.png required</span>
            </p>
          </div>
        ) : (
          /* ── Character image ─────────────────────────────────────────── */
          <img
            className="character-img"
            src={src}
            alt={`Companion — ${descriptor.label}`}
            draggable={false}
            onError={() => setImgError(true)}
          />
        )}
      </div>
    </div>
  );
};

export default Character;
