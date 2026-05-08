import { useId } from "react";

type AppLogoProps = {
  className?: string;
  "aria-label"?: string;
  /** `professional` — design fintech sofisticado. `matrix` — estilo terminal (legado). */
  variant?: "default" | "matrix" | "professional";
};

/** Wordmark ZeroConf Prop — Logo profissional fintech. */
export function AppLogo({
  className,
  "aria-label": ariaLabel,
  variant = "professional",
}: AppLogoProps) {
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const glowId = `${gradientId}-glow`;
  
  // Professional fintech palette
  const isPro = variant === "professional" || variant === "default";
  const isMx = variant === "matrix";
  
  const accent = isPro ? "#10b981" : isMx ? "#39FF14" : "#F7931A";
  const accentDim = isPro ? "#059669" : isMx ? "#1a6b16" : "#d97706";
  const wordMain = isPro ? "#f1f5f9" : isMx ? "#e8ffe8" : "#f8fafc";
  const wordAccent = isPro ? "#10b981" : isMx ? "#39FF14" : "#F7931A";
  const tagline = isPro ? "#94a3b8" : isMx ? "#6bdc6b" : "#bfdbfe";
  const circleBg = isPro ? "#141b22" : isMx ? "#041004" : "#F7931A";

  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 480 52"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor={accentDim} />
        </linearGradient>
        {isPro && (
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      
      {/* Circle with Bitcoin symbol */}
      <circle
        cx="26"
        cy="26"
        r={isPro ? 24 : 25}
        fill={circleBg}
        stroke={isPro ? `url(#${gradientId})` : isMx ? accent : "none"}
        strokeWidth={isPro ? 2 : isMx ? 1.5 : 0}
      />
      
      {/* Bitcoin symbol */}
      <text
        x="26"
        y="33"
        textAnchor="middle"
        fill={isPro ? `url(#${gradientId})` : isMx ? accent : "#ffffff"}
        fontSize="24"
        fontWeight="700"
        fontFamily="'Inter', -apple-system, sans-serif"
      >
        ₿
      </text>
      
      {/* Brand name */}
      <text
        x="60"
        y="31"
        fontFamily="'Inter', -apple-system, sans-serif"
        fontSize="21"
        fontWeight="700"
        letterSpacing="-0.02em"
      >
        <tspan fill={wordMain}>ZeroConf</tspan>
        <tspan fill={wordAccent} dx="6" fontWeight="600">Prop</tspan>
      </text>
      
      {/* Tagline */}
      <text
        x="60"
        y="46"
        fontFamily="'Inter', -apple-system, sans-serif"
        fontSize="10"
        fill={tagline}
        fontWeight="500"
        letterSpacing="0.08em"
      >
        INFRAESTRUTURA BITCOIN
      </text>
      
      {/* Status indicator dots */}
      <g transform="translate(438 22)" aria-hidden>
        <circle 
          className="app-logo-pulse-dot" 
          cx="0" 
          cy="0" 
          r="3" 
          fill={accent}
          opacity="0.4"
        />
        <circle 
          className="app-logo-pulse-dot" 
          cx="10" 
          cy="0" 
          r="3" 
          fill={accent}
          opacity="0.6"
        />
        <circle 
          className="app-logo-pulse-dot" 
          cx="20" 
          cy="0" 
          r="3" 
          fill={accent}
        />
      </g>
    </svg>
  );
}
