import { useEffect, useRef } from "react";

/**
 * Efeito Matrix discreto com símbolos Bitcoin/Lightning frequentes.
 */
export function CryptoBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Menos caracteres matrix, mais foco em crypto
    const matrixChars = "01アウカキセソタチツ";
    const cryptoChars = "₿⚡";
    const fontSize = 18;
    const columnSpacing = 50; // Espaçamento maior = menos colunas
    let columns: number;
    let drops: number[];
    let speeds: number[];
    let activeColumns: boolean[];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = Math.floor(canvas.width / columnSpacing);
      drops = [];
      speeds = [];
      activeColumns = [];

      for (let i = 0; i < columns; i++) {
        drops[i] = Math.random() * -50;
        speeds[i] = 0.2 + Math.random() * 0.3; // Mais lento
        activeColumns[i] = Math.random() > 0.4; // Apenas 60% ativas
      }
    }

    function draw() {
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `bold ${fontSize}px monospace`;

      for (let i = 0; i < columns; i++) {
        if (!activeColumns[i]) continue;

        const x = i * columnSpacing;
        const y = drops[i] * fontSize;

        // 25% chance de crypto - bem mais frequente
        const isCrypto = Math.random() < 0.25;
        let char: string;

        if (isCrypto) {
          char = cryptoChars[Math.floor(Math.random() * cryptoChars.length)];
        } else {
          char = matrixChars[Math.floor(Math.random() * matrixChars.length)];
        }

        if (isCrypto) {
          ctx.fillStyle = char === "₿" ? "#ff9500" : "#ffdd00";
          ctx.shadowColor = char === "₿" ? "#ff9500" : "#ffdd00";
          ctx.shadowBlur = 15;
        } else {
          ctx.fillStyle = "#00ff00";
          ctx.shadowColor = "#00ff00";
          ctx.shadowBlur = 12;
        }

        ctx.fillText(char, x, y);
        ctx.shadowBlur = 0;

        // Trail mais curto
        const trailLength = 12;
        for (let j = 1; j <= trailLength; j++) {
          const trailY = y - j * fontSize;
          if (trailY < 0) continue;

          const fade = 1 - j / trailLength;
          const green = Math.floor(180 * fade);
          ctx.fillStyle = `rgb(0, ${green}, 0)`;

          // 15% crypto no trail
          const trailIsCrypto = Math.random() < 0.15;
          const trailChar = trailIsCrypto
            ? cryptoChars[Math.floor(Math.random() * cryptoChars.length)]
            : matrixChars[Math.floor(Math.random() * matrixChars.length)];
          ctx.fillText(trailChar, x, trailY);
        }

        drops[i] += speeds[i];

        if (drops[i] * fontSize > canvas.height + 200) {
          if (Math.random() > 0.98) {
            drops[i] = Math.random() * -30;
            speeds[i] = 0.2 + Math.random() * 0.3;
          }
        }
      }
    }

    resize();
    window.addEventListener("resize", resize);
    const intervalId = setInterval(draw, 50);

    return () => {
      window.removeEventListener("resize", resize);
      clearInterval(intervalId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
