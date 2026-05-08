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

    // Caracteres Matrix (katakana + símbolos)
    const matrixChars =
      "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン" +
      "0123456789" +
      "ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ";

    const cryptoChars = "₿⚡";
    const fontSize = 16;
    let columns: number;
    let drops: number[];
    let speeds: number[];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = Math.floor(canvas.width / fontSize);
      drops = [];
      speeds = [];

      for (let i = 0; i < columns; i++) {
        drops[i] = Math.random() * -50;
        speeds[i] = 0.3 + Math.random() * 0.4; // Velocidade lenta e variada
      }
    }

    function draw() {
      // Trail effect - fundo semi-transparente
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `bold ${fontSize}px monospace`;

      for (let i = 0; i < columns; i++) {
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // 3% chance de símbolo crypto
        const isCrypto = Math.random() < 0.03;
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

        // Desenha trail de caracteres atrás
        const trailLength = 20;
        for (let j = 1; j <= trailLength; j++) {
          const trailY = y - j * fontSize;
          if (trailY < 0) continue;

          // Fade gradual
          const fade = 1 - j / trailLength;
          const green = Math.floor(200 * fade);
          ctx.fillStyle = `rgb(0, ${green}, 0)`;

          // Caractere aleatório para o trail
          const trailChar = matrixChars[Math.floor(Math.random() * matrixChars.length)];
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
