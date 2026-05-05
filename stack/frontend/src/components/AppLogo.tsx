import { useId } from "react";

type AppLogoProps = {
  className?: string;
  "aria-label"?: string;
  /** `matrix` — verde neon para o tema terminal. */
  variant?: "default" | "matrix";
};

/** Wordmark ZeroConf Prop — círculo ₿ + nome. */
export function AppLogo({
  className,
  "aria-label": ariaLabel,
  variant = "default",
}: AppLogoProps) {
  const glowFilterId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const isMx = variant === "matrix";
  const accent = isMx ? "#39FF14" : "#F7931A";
  const wordMain = isMx ? "#e8ffe8" : "#f8fafc";
  const wordItalic = isMx ? "#39FF14" : "#F7931A";
  const tagline = isMx ? "#6bdc6b" : "#bfdbfe";

  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 520 56"
      role="img"
      aria-label={ariaLabel}
    >
      {isMx ? (
        <defs>
          <filter id={glowFilterId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      ) : null}
      <circle
        cx="28"
        cy="28"
        r={isMx ? 25 : 26}
        fill={isMx ? "#041004" : accent}
        stroke={isMx ? accent : "none"}
        strokeWidth={isMx ? 1.5 : 0}
        filter={isMx ? `url(#${glowFilterId})` : undefined}
      />
      <text
        x="28"
        y="36"
        textAnchor="middle"
        fill={isMx ? accent : "#ffffff"}
        fontSize="26"
        fontWeight="700"
        fontFamily="'Share Tech Mono', ui-monospace, monospace"
      >
        ₿
      </text>
      <text
        x="64"
        y="34"
        fontFamily="'Share Tech Mono', ui-monospace, monospace"
        fontSize="22"
        fontWeight="700"
      >
        <tspan fill={wordMain}>ZeroConf </tspan>
        <tspan fill={wordItalic} fontStyle="italic">
          Prop
        </tspan>
      </text>
      <text
        x="64"
        y="50"
        fontFamily="'Share Tech Mono', ui-monospace, monospace"
        fontSize="11"
        fill={tagline}
        fontWeight="600"
        letterSpacing="0.12em"
      >
        BITCOIN CORE BACKEND
      </text>
      <g transform="translate(498 20)" aria-hidden>
        <circle className="app-logo-pulse-dot" cx="0" cy="0" r="3" fill={accent} />
        <circle className="app-logo-pulse-dot" cx="10" cy="0" r="3" fill={accent} />
        <circle className="app-logo-pulse-dot" cx="20" cy="0" r="3" fill={accent} />
      </g>
    </svg>
  );
}
