import { useEffect, useRef } from "react";

const CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ₿ΞΣπ∞≡◊◇○●□■△▲▽▼";

const FONT_SIZE = 14;
const DRAW_INTERVAL_MS = 45;

/**
 * Matrix rain no estilo v0: denso, com profundidade por brilho e rastro curto.
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
      const columns = Math.max(Math.floor(el.width / FONT_SIZE), 12);
      dropsRef.current = Array.from({ length: columns }, () => Math.random() * -100);
    }

    function draw() {
      gl.fillStyle = "rgba(0, 5, 2, 0.05)";
      gl.fillRect(0, 0, el.width, el.height);
      gl.font = `${FONT_SIZE}px "Share Tech Mono", monospace`;

      for (let i = 0; i < dropsRef.current.length; i++) {
        const ch = charsArray[Math.floor(Math.random() * charsArray.length)];
        const x = i * FONT_SIZE;
        const y = dropsRef.current[i] * FONT_SIZE;

        const brightness = Math.random();
        if (brightness > 0.95) {
          gl.fillStyle = "#ffffff";
        } else if (brightness > 0.8) {
          gl.fillStyle = "#00ff41";
        } else {
          gl.fillStyle = "#008f11";
        }
        gl.fillText(ch, x, y);

        if (y > el.height && Math.random() > 0.975) {
          dropsRef.current[i] = 0;
        }
        dropsRef.current[i] += 1;
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
