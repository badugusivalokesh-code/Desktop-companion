import React from "react";

interface TypingIndicatorProps {
  name?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ name = "Makima" }) => {
  return (
    <div className="typing-indicator" aria-live="polite" aria-label={`${name} is typing`}>
      <div className="typing-header">
        <span className="typing-name">{name}</span>
      </div>
      <div className="typing-bubble">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
};

