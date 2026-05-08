import { useEffect, useRef } from "react";

const CHARS = "01₿∞≡◊○●□△▼";
const FONT_SIZE = 16;
const DRAW_INTERVAL_MS = 80;

/**
 * Efeito de fundo sutil — chuva de dados estilo fintech.
 * Muito mais discreto que o Matrix original, apenas ambiência visual.
 */
export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return undefined;
    }

    const el = canvas;
    const gl = ctx;
    let intervalId = 0;
    const dropsRef = { current: [] as number[] };
    const charsArray = CHARS.split("");

    function resizeCanvas() {
      el.width = window.innerWidth;
      el.height = window.innerHeight;
      // Menos colunas para efeito mais esparso e elegante
      const columns = Math.max(Math.floor(el.width / (FONT_SIZE * 3)), 8);
      dropsRef.current = Array.from({ length: columns }, () => Math.random() * -50);
    }

    function draw() {
      // Fade mais forte para trilhas mais curtas e sutis
      gl.fillStyle = "rgba(10, 15, 20, 0.12)";
      gl.fillRect(0, 0, el.width, el.height);
      gl.font = `${FONT_SIZE}px 'Inter', sans-serif`;

      for (let i = 0; i < dropsRef.current.length; i++) {
        const ch = charsArray[Math.floor(Math.random() * charsArray.length)];
        const x = i * FONT_SIZE * 3;
        const y = dropsRef.current[i] * FONT_SIZE;

        const brightness = Math.random();
        // Paleta esmeralda sutil
        if (brightness > 0.97) {
          gl.fillStyle = "rgba(16, 185, 129, 0.6)"; // Emerald bright
        } else if (brightness > 0.85) {
          gl.fillStyle = "rgba(16, 185, 129, 0.25)"; // Emerald medium
        } else {
          gl.fillStyle = "rgba(16, 185, 129, 0.08)"; // Emerald dim
        }
        gl.fillText(ch, x, y);

        if (y > el.height && Math.random() > 0.99) {
          dropsRef.current[i] = 0;
        }
        dropsRef.current[i] += 0.5;
      }
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    intervalId = window.setInterval(draw, DRAW_INTERVAL_MS);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.clearInterval(intervalId);
    };
  }, []);

  return <canvas ref={canvasRef} className="matrix-rain-canvas" aria-hidden />;
}
