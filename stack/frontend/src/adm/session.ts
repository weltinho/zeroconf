/**
 * Sessão admin: cookie HTTP-only definido pelo backend após POST /auth/adm/login.
 * Nunca armazenar senha no browser.
 */

import { apiUrl } from "../api/url";

async function parseErrorDetail(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { detail?: unknown };
    const d = j.detail;
    if (typeof d === "string") {
      return d;
    }
    if (Array.isArray(d)) {
      return d.map((x: { msg?: string }) => x.msg ?? "").filter(Boolean).join("; ");
    }
  } catch {
    /* ignore */
  }
  return `HTTP ${r.status}`;
}

/** Devolve true se o cookie de sessão é válido no servidor. */
export async function fetchAdmMe(): Promise<boolean> {
  const r = await fetch(apiUrl("/auth/adm/me"), { credentials: "include" });
  return r.ok;
}

export async function loginAdm(username: string, password: string): Promise<void> {
  const r = await fetch(apiUrl("/auth/adm/login"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  if (!r.ok) {
    throw new Error(await parseErrorDetail(r));
  }
}

export async function logoutAdm(): Promise<void> {
  await fetch(apiUrl("/auth/adm/logout"), {
    method: "POST",
    credentials: "include",
  });
}
