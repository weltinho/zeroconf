import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../../api/url";
import { getUiText } from "../../i18n";

export function AdmHomePage() {
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
        // fallback para main
      }
    }
    void loadNetwork();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="matrix-adm-home layout layout-home">
      <header className="matrix-panel-intro">
        <h1 className="matrix-panel-intro-title">{t.admHomeTitle}</h1>
        <p className="matrix-panel-intro-text">{t.admHomeSubtitle}</p>
        <div className="badges">
          <span className="badge">REDE: {chain.toUpperCase()}</span>
        </div>
      </header>

      <section className="matrix-adm-cards" aria-label="Admin modules">
        <Link to="/adm/node" className="matrix-card matrix-card-link">
          <h2>{t.cardToolsTitle}</h2>
          <p>{t.cardToolsDesc}</p>
          <span className="matrix-card-cta" aria-hidden>
            →
          </span>
        </Link>
        <Link to="/adm/swaps" className="matrix-card matrix-card-link">
          <h2>Histórico de trocas</h2>
          <p>Ordens, estados e logs técnicos do fluxo de swap.</p>
          <span className="matrix-card-cta" aria-hidden>
            →
          </span>
        </Link>
      </section>
    </main>
  );
}
