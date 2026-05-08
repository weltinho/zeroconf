import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../api/url";
import { getUiText } from "../i18n";

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
      <line x1="6" y1="6" x2="6.01" y2="6"/>
      <line x1="6" y1="18" x2="6.01" y2="18"/>
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

function LayersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  );
}

export function HomePage() {
  const t = useMemo(() => getUiText(), []);
  const [chain, setChain] = useState("main");

  useEffect(() => {
    let active = true;
    async function loadNetwork() {
      try {
        const r = await fetch(apiUrl("/client/network"));
        const b = (await r.json().catch(() => ({}))) as { chain?: string };
        if (!active || !r.ok) return;
        const value = String(b.chain || "").trim().toLowerCase();
        if (value) setChain(value);
      } catch {
        // fallback para "main" se API indisponivel
      }
    }
    void loadNetwork();
    return () => { active = false; };
  }, []);

  const chainLabel = chain.toUpperCase();

  return (
    <main className="layout layout-home">
      {/* Hero Section */}
      <section className="home-hero">
        <div className="home-hero-content">
          <h1 className="home-hero-title">{t.homeTitle}</h1>
          <p className="home-hero-subtitle">{t.homeSubtitle}</p>

          <ul className="home-hero-bullets">
            <li>{t.matrixHeroBullet1}</li>
            <li>{t.matrixHeroBullet2}</li>
          </ul>

          <div className="home-network-status">
            <span className="home-network-dot" />
            <span>{t.matrixNetStatus.replace("Bitcoin Signet", `Bitcoin ${chainLabel}`)}</span>
          </div>
        </div>
      </section>

      {/* Cards */}
      <section className="home-cards">
        <Link to="/adm/node" className="home-card">
          <div className="home-card-icon-wrap">
            <ServerIcon className="home-card-icon" />
          </div>
          <div className="home-card-content">
            <h2>{t.cardToolsTitle}</h2>
            <p>{t.cardToolsDesc}</p>
          </div>
          <ArrowRightIcon className="home-card-arrow" />
        </Link>

        <div className="home-card home-card-roadmap">
          <div className="home-card-icon-wrap">
            <LayersIcon className="home-card-icon" />
          </div>
          <div className="home-card-content">
            <span className="home-card-badge">Em desenvolvimento</span>
            <h2>{t.cardRoadmapTitle}</h2>
            <p>{t.cardRoadmapDesc}</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <p>{t.clientFooterOperators}</p>
        <p className="home-footer-locale">{t.localeFixedBr}</p>
      </footer>

      <style>{`
        .layout-home {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        /* Hero */
        .home-hero {
          padding: 2.5rem 2rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          background: var(--background-card);
          position: relative;
        }

        .home-hero::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--accent), transparent);
          opacity: 0.3;
        }

        .home-hero-content {
          max-width: 600px;
        }

        .home-hero-title {
          margin: 0 0 0.75rem;
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }

        .home-hero-subtitle {
          margin: 0 0 1.5rem;
          font-size: 1rem;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .home-hero-bullets {
          margin: 0 0 1.5rem;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .home-hero-bullets li {
          font-size: 0.9375rem;
          color: var(--text-muted);
          font-family: var(--font-mono);
          line-height: 1.5;
        }

        .home-network-status {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.875rem;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: var(--radius-full);
          font-size: 0.8125rem;
          font-family: var(--font-mono);
          color: var(--text-secondary);
        }

        .home-network-dot {
          width: 8px;
          height: 8px;
          background: var(--accent);
          border-radius: 50%;
          animation: pulse-dot 2s ease-in-out infinite;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* Cards */
        .home-cards {
          display: grid;
          gap: 1rem;
          grid-template-columns: 1fr;
        }

        @media (min-width: 640px) {
          .home-cards {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .home-card {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.25rem;
          background: var(--background-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          text-decoration: none;
          transition: all 0.2s ease;
        }

        .home-card:hover {
          border-color: var(--border-accent);
          transform: translateY(-2px);
        }

        .home-card-icon-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: var(--accent-subtle);
          border: 1px solid var(--border-accent);
          border-radius: var(--radius-sm);
          flex-shrink: 0;
        }

        .home-card-icon {
          width: 20px;
          height: 20px;
          color: var(--accent);
        }

        .home-card-content {
          flex: 1;
          min-width: 0;
        }

        .home-card h2 {
          margin: 0 0 0.375rem;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .home-card p {
          margin: 0;
          font-size: 0.875rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .home-card-arrow {
          width: 18px;
          height: 18px;
          color: var(--text-muted);
          flex-shrink: 0;
          transition: transform 0.2s ease;
        }

        .home-card:hover .home-card-arrow {
          transform: translateX(4px);
          color: var(--accent);
        }

        .home-card-roadmap {
          border-style: dashed;
          background: var(--background-elevated);
          cursor: default;
        }

        .home-card-roadmap:hover {
          transform: none;
          border-color: var(--border);
        }

        .home-card-roadmap h2 {
          color: var(--text-secondary);
        }

        .home-card-badge {
          display: inline-block;
          padding: 0.1875rem 0.5rem;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: var(--radius-full);
          font-size: 0.6875rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 0.5rem;
        }

        /* Footer */
        .home-footer {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border);
        }

        .home-footer p {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--text-muted);
        }

        .home-footer-locale {
          opacity: 0.7;
          font-size: 0.75rem !important;
        }

        @media (max-width: 480px) {
          .home-hero {
            padding: 1.5rem 1.25rem;
          }
        }
      `}</style>
    </main>
  );
}
