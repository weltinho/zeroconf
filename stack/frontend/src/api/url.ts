/**
 * URLs da API e WebSocket relativas ao mesmo origin da página (qualquer host/porta).
 * Usa `import.meta.env.BASE_URL` para quando a app é servida num sub-path (ex.: /app/).
 */

function basePath(): string {
  const raw = import.meta.env.BASE_URL ?? "/";
  if (raw === "/" || raw === "") {
    return "";
  }
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

/** GET / POST etc. à API FastAPI (prefixo /api no edge Caddy / proxy Vite). */
export function apiUrl(path: string): string {
  const root = basePath();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  if (!root) {
    return `/api${suffix}`;
  }
  return `${root}/api${suffix}`;
}

/** WebSocket (relay ZMQ); mesmo host/porta/protocolo que a página. */
export function wsUrl(path: string): string {
  if (typeof window === "undefined") {
    return path;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const root = basePath();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const pathPart = root ? `${root}${suffix}` : suffix;
  return `${proto}//${window.location.host}${pathPart}`;
}
