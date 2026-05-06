import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Atrás do Caddy com Host custom (DuckDNS, IP, etc.) o Vite 5+ bloqueia por defeito.
    allowedHosts: true,
    proxy: {
      "/api": {
       target: "http://backend:8000",
       // target: "https://zconfcore.duckdns.org/",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/ws": {
        target: "ws://backend:8000",
        //target: "wss://zconfcore.duckdns.org/",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
