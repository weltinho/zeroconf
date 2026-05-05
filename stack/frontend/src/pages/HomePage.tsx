import { useMemo } from "react";
import { getUiText } from "../i18n";

export function HomePage() {
  const t = useMemo(() => getUiText(), []);

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
        <p className="matrix-net-status">{t.matrixNetStatus}</p>
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
