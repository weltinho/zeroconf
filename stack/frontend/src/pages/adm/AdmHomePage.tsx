import { useMemo } from "react";
import { Link } from "react-router-dom";
import { getUiText } from "../../i18n";

export function AdmHomePage() {
  const t = useMemo(() => getUiText(), []);

  return (
    <main className="matrix-adm-home layout layout-home">
      <header className="matrix-panel-intro">
        <h1 className="matrix-panel-intro-title">{t.admHomeTitle}</h1>
        <p className="matrix-panel-intro-text">{t.admHomeSubtitle}</p>
      </header>

      <section className="matrix-adm-cards" aria-label="Admin modules">
        <Link to="/adm/node" className="matrix-card matrix-card-link">
          <h2>{t.cardToolsTitle}</h2>
          <p>{t.cardToolsDesc}</p>
          <span className="matrix-card-cta" aria-hidden>
            →
          </span>
        </Link>
      </section>
    </main>
  );
}
