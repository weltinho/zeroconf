import { useEffect, useRef } from "react";

/**
 * Animated background with Bitcoin, Lightning and crypto symbols
 * Inspired by FixedFloat but with subtle matrix aesthetic
 */
export function CryptoBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];

    interface Particle {
      x: number;
      y: number;
      size: number;
      speed: number;
      opacity: number;
      symbol: string;
      rotation: number;
      rotationSpeed: number;
    }

    const symbols = ["₿", "⚡", "◈", "⬡", "◇", "∞", "Ξ", "◎"];
    
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    }

    function initParticles() {
      const count = Math.floor((canvas.width * canvas.height) / 25000);
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: 12 + Math.random() * 16,
          speed: 0.15 + Math.random() * 0.35,
          opacity: 0.03 + Math.random() * 0.08,
          symbol: symbols[Math.floor(Math.random() * symbols.length)],
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.008,
        });
      }
    }

    function draw() {
      ctx.fillStyle = "#0a0f14";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw gradient orbs (like FixedFloat planets but more subtle)
      const gradient1 = ctx.createRadialGradient(
        canvas.width * 0.1,
        canvas.height * 0.3,
        0,
        canvas.width * 0.1,
        canvas.height * 0.3,
        canvas.width * 0.25
      );
      gradient1.addColorStop(0, "rgba(16, 185, 129, 0.08)");
      gradient1.addColorStop(1, "transparent");
      ctx.fillStyle = gradient1;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const gradient2 = ctx.createRadialGradient(
        canvas.width * 0.85,
        canvas.height * 0.7,
        0,
        canvas.width * 0.85,
        canvas.height * 0.7,
        canvas.width * 0.2
      );
      gradient2.addColorStop(0, "rgba(247, 147, 26, 0.05)");
      gradient2.addColorStop(1, "transparent");
      ctx.fillStyle = gradient2;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw particles
      for (const p of particles) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.font = `${p.size}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // Bitcoin symbols get orange tint, Lightning gets cyan, others green
        if (p.symbol === "₿") {
          ctx.fillStyle = `rgba(247, 147, 26, ${p.opacity})`;
        } else if (p.symbol === "⚡") {
          ctx.fillStyle = `rgba(250, 204, 21, ${p.opacity})`;
        } else {
          ctx.fillStyle = `rgba(16, 185, 129, ${p.opacity})`;
        }
        
        ctx.fillText(p.symbol, 0, 0);
        ctx.restore();

        // Update position
        p.y -= p.speed;
        p.rotation += p.rotationSpeed;

        // Reset when off screen
        if (p.y < -p.size) {
          p.y = canvas.height + p.size;
          p.x = Math.random() * canvas.width;
        }
      }

      // Draw subtle grid lines
      ctx.strokeStyle = "rgba(16, 185, 129, 0.02)";
      ctx.lineWidth = 1;
      const gridSize = 80;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
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
      className="crypto-background-canvas"
      aria-hidden
    />
  );
}
