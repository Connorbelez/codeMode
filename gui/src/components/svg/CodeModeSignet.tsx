/**
 * CodeMode Signet - Icon only (curly braces + lightning bolt)
 * Created by Connor Belez
 */
interface CodeModeSignetProps {
  size?: number;
  color?: string;
  animated?: boolean;
}

export default function CodeModeSignet({
  size = 32,
  color = "currentColor",
  animated = false,
}: CodeModeSignetProps) {
  const animationId = animated ? "lightning-pulse" : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Left brace { */}
      <path
        d="M8 4 Q4 4, 4 8 L4 12 Q4 14, 2 14 Q4 14, 4 16 L4 24 Q4 28, 8 28"
        stroke={color === "currentColor" ? "url(#brace-gradient)" : color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Right brace } */}
      <path
        d="M24 4 Q28 4, 28 8 L28 12 Q28 14, 30 14 Q28 14, 28 16 L28 24 Q28 28, 24 28"
        stroke={color === "currentColor" ? "url(#brace-gradient)" : color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Lightning bolt ⚡ */}
      <path
        d="M18 7 L12 16 H15.5 L13 25 L21 14 H17 Z"
        fill={color === "currentColor" ? "url(#lightning-gradient)" : color}
        className={animationId}
      />

      <defs>
        {/* Gradient for braces */}
        <linearGradient id="brace-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00ff00">
            {animated && (
              <animate
                attributeName="stop-color"
                values="#00ff00;#7fff00;#00ced1;#00ff00"
                dur="3s"
                repeatCount="indefinite"
              />
            )}
          </stop>
          <stop offset="50%" stopColor="#00ced1">
            {animated && (
              <animate
                attributeName="stop-color"
                values="#00ced1;#1e90ff;#00ff00;#00ced1"
                dur="3s"
                repeatCount="indefinite"
              />
            )}
          </stop>
          <stop offset="100%" stopColor="#1e90ff">
            {animated && (
              <animate
                attributeName="stop-color"
                values="#1e90ff;#00ff00;#7fff00;#1e90ff"
                dur="3s"
                repeatCount="indefinite"
              />
            )}
          </stop>
        </linearGradient>

        {/* Gradient for lightning bolt */}
        <linearGradient
          id="lightning-gradient"
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#adff2f" />
          <stop offset="50%" stopColor="#00ff00" />
          <stop offset="100%" stopColor="#00bfff" />
        </linearGradient>
      </defs>

      <style>
        {animated &&
          `
          .lightning-pulse {
            animation: pulse 1.5s ease-in-out infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `}
      </style>
    </svg>
  );
}
