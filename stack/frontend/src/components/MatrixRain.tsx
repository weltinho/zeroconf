import { useEffect, useRef } from "react";

/**
 * Efeito Matrix clássico com verde neon brilhante.
 * Inclui símbolos Bitcoin e Lightning ocasionais.
 */
export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Caracteres - mais foco em crypto, menos katakana
    const matrixChars = "01アウカキセソタチツ";
    const cryptoChars = "₿⚡";
    const fontSize = 18;
    const columnSpacing = 50; // Espaçamento maior entre colunas
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
        activeColumns[i] = Math.random() > 0.4; // Apenas 60% das colunas ativas
      }
    }

    function draw() {
      // Trail effect - fundo semi-transparente
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `bold ${fontSize}px monospace`;

      for (let i = 0; i < columns; i++) {
        if (!activeColumns[i]) continue; // Pula colunas inativas
        
        const x = i * columnSpacing;
        const y = drops[i] * fontSize;

        // 25% chance de símbolo crypto - muito mais frequente
        const isCrypto = Math.random() < 0.25;
        let char: string;
        
        if (isCrypto) {
          char = cryptoChars[Math.floor(Math.random() * cryptoChars.length)];
        } else {
          char = matrixChars[Math.floor(Math.random() * matrixChars.length)];
        }

        // Desenha o caractere principal (mais brilhante)
        if (isCrypto) {
          // Bitcoin laranja, Lightning amarelo
          ctx.fillStyle = char === "₿" ? "#ff9500" : "#ffdd00";
          ctx.shadowColor = char === "₿" ? "#ff9500" : "#ffdd00";
          ctx.shadowBlur = 15;
        } else {
          // Verde neon brilhante com glow
          ctx.fillStyle = "#00ff00";
          ctx.shadowColor = "#00ff00";
          ctx.shadowBlur = 12;
        }

        ctx.fillText(char, x, y);
        ctx.shadowBlur = 0;

        // Desenha trail de caracteres atrás - mais curto
        const trailLength = 12;
        for (let j = 1; j <= trailLength; j++) {
          const trailY = y - j * fontSize;
          if (trailY < 0) continue;

          // Fade gradual
          const fade = 1 - j / trailLength;
          const green = Math.floor(180 * fade);
          ctx.fillStyle = `rgb(0, ${green}, 0)`;

          // Mais chance de crypto no trail também (15%)
          const trailIsCrypto = Math.random() < 0.15;
          const trailChar = trailIsCrypto 
            ? cryptoChars[Math.floor(Math.random() * cryptoChars.length)]
            : matrixChars[Math.floor(Math.random() * matrixChars.length)];
          ctx.fillText(trailChar, x, trailY);
        }

        // Move a gota para baixo
        drops[i] += speeds[i];

        // Reset quando sai da tela
        if (drops[i] * fontSize > canvas.height + 200) {
          if (Math.random() > 0.98) {
            drops[i] = Math.random() * -30;
            speeds[i] = 0.3 + Math.random() * 0.4;
          }
        }
      }
    }

    resize();
    window.addEventListener("resize", resize);

    // Animação mais lenta (50ms = 20fps)
    const intervalId = setInterval(draw, 50);

    return () => {
      window.removeEventListener("resize", resize);
      clearInterval(intervalId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="matrix-rain-canvas"
      style={{ opacity: 1 }}
      aria-hidden
    />
  );
}
