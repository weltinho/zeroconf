import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../../api/url";
import { getUiText } from "../../i18n";

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

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/>
      <line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  );
}

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
    <main className="adm-home">
      <header className="adm-home-header">
        <div className="adm-home-title-row">
          <h1 className="adm-home-title">{t.admHomeTitle}</h1>
          <div className="adm-network-badge">
            <span className="adm-network-dot" />
            Bitcoin {chain.toUpperCase()}
          </div>
        </div>
        <p className="adm-home-subtitle">{t.admHomeSubtitle}</p>
      </header>

      <section className="adm-cards" aria-label="Admin modules">
        <Link to="/adm/node" className="adm-card adm-card-primary">
          <div className="adm-card-icon-wrap">
            <ServerIcon className="adm-card-icon" />
          </div>
          <div className="adm-card-content">
            <h2>{t.cardToolsTitle}</h2>
            <p>{t.cardToolsDesc}</p>
          </div>
          <ArrowRightIcon className="adm-card-arrow" />
        </Link>
        
        <Link to="/adm/swaps" className="adm-card">
          <div className="adm-card-icon-wrap">
            <RefreshIcon className="adm-card-icon" />
          </div>
          <div className="adm-card-content">
            <h2>Historico de trocas</h2>
            <p>Ordens, estados e logs tecnicos do fluxo de swap.</p>
          </div>
          <ArrowRightIcon className="adm-card-arrow" />
        </Link>

        <Link to="/adm/funds-rescue" className="adm-card">
          <div className="adm-card-icon-wrap">
            <RefreshIcon className="adm-card-icon" />
          </div>
          <div className="adm-card-content">
            <h2>Resgate de Fundos</h2>
            <p>Lista pagamentos travados por UTXO e permite devolver para origem ou encaminhar para outro endereço.</p>
          </div>
          <ArrowRightIcon className="adm-card-arrow" />
        </Link>

        <div className="adm-card adm-card-stats">
          <div className="adm-card-icon-wrap">
            <ListIcon className="adm-card-icon" />
          </div>
          <div className="adm-card-content">
            <h2>Resumo rapido</h2>
            <div className="adm-stats-grid">
              <div className="adm-stat">
                <span className="adm-stat-value">-</span>
                <span className="adm-stat-label">Blocos</span>
              </div>
              <div className="adm-stat">
                <span className="adm-stat-value">-</span>
                <span className="adm-stat-label">Mempool</span>
              </div>
              <div className="adm-stat">
                <span className="adm-stat-value">-</span>
                <span className="adm-stat-label">Swaps hoje</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <style>{`
        .adm-home {
          max-width: 960px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
        }
        
        .adm-home-header {
          margin-bottom: 2rem;
        }
        
        .adm-home-title-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 1rem;
          margin-bottom: 0.5rem;
        }
        
        .adm-home-title {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }
        
        .adm-network-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.375rem 0.875rem;
          background: var(--accent-subtle);
          border: 1px solid var(--border-accent);
          border-radius: var(--radius-full);
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--accent);
        }
        
        .adm-network-dot {
          width: 8px;
          height: 8px;
          background: var(--accent);
          border-radius: 50%;
          animation: pulse-dot 2s ease-in-out infinite;
        }
        
        .adm-home-subtitle {
          margin: 0;
          font-size: 1rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        
        .adm-cards {
          display: grid;
          gap: 1rem;
          grid-template-columns: 1fr;
        }
        
        @media (min-width: 640px) {
          .adm-cards {
            grid-template-columns: repeat(2, 1fr);
          }
          
          .adm-card-primary {
            grid-column: span 2;
          }
        }
        
        .adm-card {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.25rem 1.5rem;
          background: var(--background-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          text-decoration: none;
          color: inherit;
          transition: all 0.2s ease;
        }
        
        .adm-card:hover {
          border-color: var(--border-accent);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }
        
        .adm-card-icon-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          background: var(--accent-subtle);
          border: 1px solid var(--border-accent);
          border-radius: var(--radius-sm);
          flex-shrink: 0;
        }
        
        .adm-card-icon {
          width: 22px;
          height: 22px;
          color: var(--accent);
        }
        
        .adm-card-content {
          flex: 1;
          min-width: 0;
        }
        
        .adm-card-content h2 {
          margin: 0 0 0.375rem;
          font-size: 1.0625rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .adm-card-content p {
          margin: 0;
          font-size: 0.9375rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        
        .adm-card-arrow {
          width: 20px;
          height: 20px;
          color: var(--text-muted);
          flex-shrink: 0;
          margin-top: 0.25rem;
          transition: all 0.2s ease;
        }
        
        .adm-card:hover .adm-card-arrow {
          color: var(--accent);
          transform: translateX(4px);
        }
        
        .adm-card-stats {
          cursor: default;
        }
        
        .adm-card-stats:hover {
          transform: none;
          box-shadow: none;
        }
        
        .adm-stats-grid {
          display: flex;
          gap: 1.5rem;
          margin-top: 0.75rem;
        }
        
        .adm-stat {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }
        
        .adm-stat-value {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .adm-stat-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      `}</style>
    </main>
  );
}
