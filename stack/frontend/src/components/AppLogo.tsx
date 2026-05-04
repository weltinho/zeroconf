type AppLogoProps = {
  className?: string;
  "aria-label"?: string;
};

/**
 * Marca visual inspirada na identidade bitcoin.org:
 * círculo laranja (#F7931A), símbolo ₿ em branco, palavra-base em alto contraste
 * e ênfase em itálico laranja para “ação / tempo real”.
 */
export function AppLogo({ className, "aria-label": ariaLabel }: AppLogoProps) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 520 56"
      role="img"
      aria-label={ariaLabel}
    >
      <circle cx="28" cy="28" r="26" fill="#F7931A" />
      <text
        x="28"
        y="36"
        textAnchor="middle"
        fill="#ffffff"
        fontSize="26"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
      >
        ₿
      </text>
      <text
        x="64"
        y="34"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontSize="22"
        fontWeight="700"
      >
        <tspan fill="#f8fafc">Bitcoin </tspan>
        <tspan fill="#F7931A" fontStyle="italic">
          Real Time
        </tspan>
      </text>
      <text
        x="64"
        y="50"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontSize="11"
        fill="#bfdbfe"
        fontWeight="600"
        letterSpacing="0.12em"
      >
        REQUESTS &amp; EVENTS
      </text>
      <g transform="translate(498 20)" aria-hidden>
        <circle className="app-logo-pulse-dot" cx="0" cy="0" r="3" fill="#F7931A" />
        <circle className="app-logo-pulse-dot" cx="10" cy="0" r="3" fill="#F7931A" />
        <circle className="app-logo-pulse-dot" cx="20" cy="0" r="3" fill="#F7931A" />
      </g>
    </svg>
  );
}
