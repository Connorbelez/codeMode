/**
 * CodeMode Logo - Full wordmark with lightning bolt icon
 * Created by Connor Belez
 */
import { useId } from "react";

interface CodeModeLogoProps {
  width?: number;
  height?: number;
  color?: string;
  variant?: "full" | "icon-only" | "wordmark-only";
}

export default function CodeModeLogo({
  width = 180,
  height = 32,
  color = "currentColor",
  variant = "full",
}: CodeModeLogoProps) {
  // Generate unique IDs for gradients to prevent collisions
  const lightningGradientId = useId();
  const textGradientId = useId();
  const iconGradientId = useId();
  if (variant === "icon-only") {
    return (
      <svg
        width={height}
        height={height}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Left brace */}
        <path
          d="M8 4 Q4 4, 4 8 L4 12 Q4 14, 2 14 Q4 14, 4 16 L4 24 Q4 28, 8 28"
          stroke={`url(#${lightningGradientId})`}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Right brace */}
        <path
          d="M24 4 Q28 4, 28 8 L28 12 Q28 14, 30 14 Q28 14, 28 16 L28 24 Q28 28, 24 28"
          stroke={`url(#${lightningGradientId})`}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Lightning bolt */}
        <path
          d="M18 8 L13 16 L16 16 L14 24 L20 14 L17 14 Z"
          fill={`url(#${lightningGradientId})`}
        />
        <defs>
          <linearGradient
            id={lightningGradientId}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#00ff00" />
            <stop offset="33%" stopColor="#7fff00" />
            <stop offset="66%" stopColor="#00ced1" />
            <stop offset="100%" stopColor="#1e90ff" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (variant === "wordmark-only") {
    return (
      <svg
        width={width}
        height={height}
        viewBox="0 0 180 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <text
          x="0"
          y="24"
          fontFamily="Inter, system-ui, -apple-system, sans-serif"
          fontSize="24"
          fontWeight="600"
          fill={`url(#${textGradientId})`}
        >
          CodeMode
        </text>
        <defs>
          <linearGradient id={textGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00ff00" />
            <stop offset="50%" stopColor="#00ced1" />
            <stop offset="100%" stopColor="#1e90ff" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  // Full logo with icon + wordmark
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 180 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Icon */}
      <g transform="translate(0, 0)">
        {/* Left brace */}
        <path
          d="M8 4 Q4 4, 4 8 L4 12 Q4 14, 2 14 Q4 14, 4 16 L4 24 Q4 28, 8 28"
          stroke={`url(#${iconGradientId})`}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Right brace */}
        <path
          d="M24 4 Q28 4, 28 8 L28 12 Q28 14, 30 14 Q28 14, 28 16 L28 24 Q28 28, 24 28"
          stroke={`url(#${iconGradientId})`}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Lightning bolt */}
        <path
          d="M18 8 L13 16 L16 16 L14 24 L20 14 L17 14 Z"
          fill={`url(#${iconGradientId})`}
        />
      </g>

      {/* Wordmark */}
      <text
        x="38"
        y="24"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontSize="22"
        fontWeight="600"
        fill={`url(#${textGradientId})`}
      >
        CodeMode
      </text>

      <defs>
        <linearGradient id={iconGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00ff00" />
          <stop offset="33%" stopColor="#7fff00" />
          <stop offset="66%" stopColor="#00ced1" />
          <stop offset="100%" stopColor="#1e90ff" />
        </linearGradient>
        <linearGradient id={textGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00ff00" />
          <stop offset="50%" stopColor="#00ced1" />
          <stop offset="100%" stopColor="#1e90ff" />
        </linearGradient>
      </defs>
    </svg>
  );
}
