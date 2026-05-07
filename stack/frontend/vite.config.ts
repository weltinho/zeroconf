import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Pasta `stack/` — partilha `.env` com o compose (`VITE_DEV_*`). */
const stackEnvDir = path.resolve(__dirname, "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, stackEnvDir, "");
  const apiTarget =
    env.VITE_DEV_API_PROXY?.trim() || "http://127.0.0.1:8200";
  const wsTarget =
    env.VITE_DEV_WS_PROXY?.trim() ||
    apiTarget.replace(/^http/, "ws");

  return {
    plugins: [react()],
    envDir: stackEnvDir,
    server: {
      host: "0.0.0.0",
      port: 5173,
      // Atrás do Caddy com Host custom (DuckDNS, IP, etc.) o Vite 5+ bloqueia por defeito.
      allowedHosts: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/ws": {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
