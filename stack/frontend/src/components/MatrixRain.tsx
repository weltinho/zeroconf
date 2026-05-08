import { useEffect, useRef } from "react";

/**
 * Efeito Matrix com símbolos Bitcoin/Lightning persistentes.
 * Caracteres ficam na tela por mais tempo antes de trocar.
 */
export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const maybeCanvas = canvasRef.current;
    if (!maybeCanvas) return;
    const maybeCtx = maybeCanvas.getContext("2d");
    if (!maybeCtx) return;
    const canvas: HTMLCanvasElement = maybeCanvas;
    const ctx: CanvasRenderingContext2D = maybeCtx;

    // Mais zeros e uns, poucos katakana
    const matrixChars = "0101010101010101アウカキセソ0101010101010101";
    const cryptoChars = "₿₿₿₿⚡"; // Mais Bitcoin, menos raios
    const fontSize = 18;
    const columnSpacing = 35; // Mais colunas, menos espaçamento
    
    interface Column {
      x: number;
      y: number;
      speed: number;
      chars: { char: string; isCrypto: boolean }[];
      active: boolean;
    }
    
    let columns: Column[] = [];

    function createColumn(x: number): Column {
      const trailLength = 8 + Math.floor(Math.random() * 6);
      const chars: { char: string; isCrypto: boolean }[] = [];
      
      for (let i = 0; i < trailLength; i++) {
        // 30% chance de crypto - mais frequente
        const isCrypto = Math.random() < 0.30;
        const char = isCrypto
          ? cryptoChars[Math.floor(Math.random() * cryptoChars.length)]
          : matrixChars[Math.floor(Math.random() * matrixChars.length)];
        chars.push({ char, isCrypto });
      }
      
      return {
        x,
        y: Math.random() * -300,
        speed: 4 + Math.random() * 3, // Velocidade rápida
        chars,
        active: Math.random() > 0.2, // 80% das colunas ativas
      };
    }

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      const numColumns = Math.floor(canvas.width / columnSpacing);
      columns = [];
      
      for (let i = 0; i < numColumns; i++) {
        columns.push(createColumn(i * columnSpacing + columnSpacing / 2));
      }
    }

    function draw() {
      // Limpa com tom verde-escuro sutil para combinar com o fundo
      ctx.fillStyle = "rgba(5, 10, 10, 0.88)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = "center";

      for (const col of columns) {
        if (!col.active) continue;

        // Desenha cada caractere da coluna
        for (let i = 0; i < col.chars.length; i++) {
          const { char, isCrypto } = col.chars[i];
          const charY = col.y - i * fontSize;
          
          if (charY < -fontSize || charY > canvas.height + fontSize) continue;

          // Fade baseado na posição no trail
          const fade = 1 - i / col.chars.length;
          
          if (i === 0) {
            // Caractere principal - brilhante mas não exagerado
            if (isCrypto) {
              ctx.fillStyle = char === "₿" ? "#f7931a" : "#fbbf24";
              ctx.shadowColor = char === "₿" ? "#f7931a" : "#fbbf24";
              ctx.shadowBlur = 10;
            } else {
              ctx.fillStyle = "#22c55e";
              ctx.shadowColor = "#22c55e";
              ctx.shadowBlur = 8;
            }
          } else {
            // Trail - verde com fade
            if (isCrypto) {
              const alpha = fade * 0.8;
              ctx.fillStyle = char === "₿" 
                ? `rgba(255, 149, 0, ${alpha})` 
                : `rgba(255, 221, 0, ${alpha})`;
            } else {
              const green = Math.floor(200 * fade);
              ctx.fillStyle = `rgb(0, ${green}, 0)`;
            }
            ctx.shadowBlur = 0;
          }

          ctx.fillText(char, col.x, charY);
        }
        
        ctx.shadowBlur = 0;

        // Move a coluna para baixo
        col.y += col.speed;

        // Troca caracteres a cada frame (100%)
        if (Math.random() < 1) {
          const idx = Math.floor(Math.random() * col.chars.length);
          const isCrypto = Math.random() < 0.30;
          col.chars[idx] = {
            char: isCrypto
              ? cryptoChars[Math.floor(Math.random() * cryptoChars.length)]
              : matrixChars[Math.floor(Math.random() * matrixChars.length)],
            isCrypto,
          };
        }

        // Reset quando sai da tela
        if (col.y - col.chars.length * fontSize > canvas.height) {
          Object.assign(col, createColumn(col.x));
          col.active = true;
        }
      }
    }

    resize();
    window.addEventListener("resize", resize);

    // 30fps para animação fluida
    const intervalId = setInterval(draw, 33);

    return () => {
      window.removeEventListener("resize", resize);
      clearInterval(intervalId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="matrix-rain-canvas"
      aria-hidden
    />
  );
}
