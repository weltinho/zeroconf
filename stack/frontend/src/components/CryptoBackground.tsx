import { useEffect, useRef } from "react";

/**
 * Matrix-style rain animation with neon green characters
 * Occasionally shows Bitcoin (₿) and Lightning (⚡) symbols
 */
export function CryptoBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    // Matrix characters (katakana + numbers + symbols from the movie)
    const matrixChars =
      "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン" +
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
      "0123456789" +
      "ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ" +
      "∑∏∂∆√∞≈≠±×÷";

    // Special crypto symbols (appear less frequently)
    const cryptoChars = "₿⚡";

    const fontSize = 18;
    let columns: number;
    let drops: number[];
    let charStates: { char: string; brightness: number; isCrypto: boolean }[][];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = Math.floor(canvas.width / fontSize);
      drops = [];
      charStates = [];

      for (let i = 0; i < columns; i++) {
        // Random starting positions for more organic look
        drops[i] = Math.random() * -100;
        charStates[i] = [];
      }
    }

    function getRandomChar(): { char: string; isCrypto: boolean } {
      // 3% chance for Bitcoin/Lightning symbols
      if (Math.random() < 0.03) {
        return {
          char: cryptoChars[Math.floor(Math.random() * cryptoChars.length)],
          isCrypto: true,
        };
      }
      return {
        char: matrixChars[Math.floor(Math.random() * matrixChars.length)],
        isCrypto: false,
      };
    }

    function draw() {
      // Semi-transparent black to create trail effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${fontSize}px "Courier New", monospace`;

      for (let i = 0; i < columns; i++) {
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Initialize column state array if needed
        if (!charStates[i]) {
          charStates[i] = [];
        }

        // Get or create character for this position
        const rowIndex = Math.floor(drops[i]);
        if (rowIndex >= 0 && !charStates[i][rowIndex]) {
          const { char, isCrypto } = getRandomChar();
          charStates[i][rowIndex] = {
            char,
            brightness: 1,
            isCrypto,
          };
        }

        // Draw the leading character (brightest - white/yellow)
        if (rowIndex >= 0) {
          const state = charStates[i][rowIndex];
          if (state) {
            if (state.isCrypto) {
              // Bitcoin is orange, Lightning is yellow
              ctx.fillStyle =
                state.char === "₿"
                  ? "#ff9500"
                  : "#ffdd00";
              ctx.shadowColor =
                state.char === "₿"
                  ? "#ff9500"
                  : "#ffdd00";
            } else {
              // Leading char is bright white-green
              ctx.fillStyle = "#ffffff";
              ctx.shadowColor = "#00ff00";
            }
            ctx.shadowBlur = 20;
            ctx.fillText(state.char, x, y);
            ctx.shadowBlur = 0;
          }
        }

        // Draw trailing characters with fading green
        const trailLength = 25;
        for (let j = 1; j < trailLength; j++) {
          const trailRow = rowIndex - j;
          if (trailRow >= 0 && charStates[i][trailRow]) {
            const state = charStates[i][trailRow];
            const fade = 1 - j / trailLength;

            if (state.isCrypto) {
              // Crypto symbols fade with their color
              const alpha = fade * 0.9;
              ctx.fillStyle =
                state.char === "₿"
                  ? `rgba(255, 149, 0, ${alpha})`
                  : `rgba(255, 221, 0, ${alpha})`;
            } else {
              // Regular chars fade from bright green to dark green
              const greenIntensity = Math.floor(255 * fade);
              ctx.fillStyle = `rgb(0, ${greenIntensity}, 0)`;
            }

            const trailY = trailRow * fontSize;
            if (trailY > 0 && trailY < canvas.height) {
              ctx.fillText(state.char, x, trailY);
            }
          }
        }

        // Randomly change characters in the trail (matrix flicker effect)
        if (Math.random() < 0.02) {
          const flickerRow = rowIndex - Math.floor(Math.random() * 15);
          if (flickerRow >= 0 && charStates[i][flickerRow]) {
            const { char, isCrypto } = getRandomChar();
            charStates[i][flickerRow] = {
              char,
              brightness: charStates[i][flickerRow].brightness,
              isCrypto,
            };
          }
        }

        // Move drop down (slower speed)
        drops[i] += 0.4 + Math.random() * 0.3;

        // Reset when off screen with random delay
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = Math.random() * -20;
          charStates[i] = []; // Clear column state
        }
      }

      animationId = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
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
