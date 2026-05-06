import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api/url";
import { getUiText } from "../i18n";

export function HomePage() {
  const t = useMemo(() => getUiText(), []);
  const [chain, setChain] = useState("main");

  useEffect(() => {
    let active = true;
    async function loadNetwork() {
      try {
        const r = await fetch(apiUrl("/client/network"));
        const b = (await r.json().catch(() => ({}))) as { chain?: string };
        if (!active || !r.ok) {
          return;
        }
        const value = String(b.chain || "").trim().toLowerCase();
        if (value) {
          setChain(value);
        }
      } catch {
        // fallback para "main" se API indisponível.
      }
    }
    void loadNetwork();
    return () => {
      active = false;
    };
  }, []);

  const chainLabel = chain.toUpperCase();
  const netStatus =
    t.localeFixedBr === "Idioma da interface: Português (Brasil)"
      ? `● REDE: Bitcoin ${chainLabel} — carteira operador`
      : `● NETWORK: Bitcoin ${chainLabel} — operator wallet`;

  return (
    <main className="layout layout-home matrix-client">
      <section className="matrix-hero" aria-labelledby="matrix-hero-title">
        <h1 id="matrix-hero-title" className="matrix-hero-title">
          {t.matrixHeroTitle}
        </h1>
        <ul className="matrix-hero-bullets">
          <li>{t.matrixHeroBullet1}</li>
          <li>{t.matrixHeroBullet2}</li>
        </ul>
        <p className="matrix-net-status">{netStatus}</p>
      </section>

      <section className="matrix-client-cards" aria-label="Product">
        <div className="matrix-card matrix-card-roadmap">
          <h2>{t.cardRoadmapTitle}</h2>
          <p>{t.cardRoadmapDesc}</p>
        </div>
      </section>

      <p className="matrix-client-foot">{t.clientFooterOperators}</p>
      <p className="matrix-locale-hint">{t.localeFixedBr}</p>
    </main>
  );
}
