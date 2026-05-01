import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AppLogo } from "../components/AppLogo";
import { getUiText } from "../i18n";

export function HomePage() {
  const browserLocale = useMemo(() => navigator.language || "unknown", []);
  const t = useMemo(() => getUiText(browserLocale), [browserLocale]);

  return (
    <main className="layout layout-home">
      <header className="hero">
        <div className="hero-brand">
          <AppLogo className="hero-logo" aria-label={t.logoAriaLabel} />
          <div className="hero-copy">
            <h1>{t.homeTitle}</h1>
            <p>{t.homeSubtitle}</p>
          </div>
        </div>
        <p className="hero-meta">
          {t.locale}: {browserLocale}
        </p>
      </header>

      <section className="home-cards" aria-label="Workspaces">
        <Link to="/lab/rpc" className="home-card home-card-primary">
          <h2>{t.cardRpcTitle}</h2>
          <p>{t.cardRpcDesc}</p>
          <span className="home-card-cta" aria-hidden="true">
            →
          </span>
        </Link>
        <div className="home-card home-card-disabled">
          <h2>{t.cardSoonTitle}</h2>
          <p>{t.cardSoonDesc}</p>
        </div>
      </section>
    </main>
  );
}
