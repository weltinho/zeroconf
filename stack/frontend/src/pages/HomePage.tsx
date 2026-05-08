import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../api/url";
import { getUiText } from "../i18n";

// Trust and security icons as inline SVGs for professional appearance
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

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

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
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
        if (!active || !r.ok) {
          return;
        }
        const value = String(b.chain || "").trim().toLowerCase();
        if (value) {
          setChain(value);
        }
      } catch {
        // fallback para "main" se API indisponivel.
      }
    }
    void loadNetwork();
    return () => {
      active = false;
    };
  }, []);

  const chainLabel = chain.toUpperCase();
  const isPortuguese = t.localeFixedBr === "Idioma da interface: Portugues (Brasil)";

  return (
    <main className="layout layout-home">
      {/* Hero Section */}
      <section className="home-hero" aria-labelledby="hero-title">
        <div className="home-hero-content">
          <div className="home-hero-badge">
            <ShieldIcon className="home-hero-badge-icon" />
            <span>Infraestrutura Bitcoin Segura</span>
          </div>
          
          <h1 id="hero-title" className="home-hero-title">
            {isPortuguese ? (
              <>
                Liquidez <span>on-chain</span> com<br />
                transparencia total
              </>
            ) : (
              <>
                On-chain <span>liquidity</span> with<br />
                full transparency
              </>
            )}
          </h1>
          
          <p className="home-hero-description">
            {isPortuguese
              ? "Bitcoin Core como backend. Visibilidade na mempool, carteira do operador e auditoria completa. Construido para quem exige controle real sobre seus fundos."
              : "Bitcoin Core as backend. Mempool visibility, operator wallet and complete audit trail. Built for those who demand real control over their funds."}
          </p>

          <div className="home-hero-actions">
            <Link to="/cliente" className="home-btn-primary">
              {isPortuguese ? "Comecar agora" : "Get started"}
              <ArrowRightIcon className="home-btn-icon" />
            </Link>
            <Link to="/adm" className="home-btn-secondary">
              {isPortuguese ? "Painel Admin" : "Admin Panel"}
            </Link>
          </div>

          <div className="home-network-status">
            <span className="home-network-dot" />
            <span>Bitcoin {chainLabel}</span>
            <span className="home-network-sep">|</span>
            <span>{isPortuguese ? "Carteira do operador ativa" : "Operator wallet active"}</span>
          </div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="home-trust" aria-label="Trust indicators">
        <div className="home-trust-item">
          <LockIcon className="home-trust-icon" />
          <div className="home-trust-text">
            <span className="home-trust-title">{isPortuguese ? "Auto-custodia" : "Self-custody"}</span>
            <span className="home-trust-desc">{isPortuguese ? "Suas chaves, seus bitcoins" : "Your keys, your coins"}</span>
          </div>
        </div>
        <div className="home-trust-divider" />
        <div className="home-trust-item">
          <ServerIcon className="home-trust-icon" />
          <div className="home-trust-text">
            <span className="home-trust-title">{isPortuguese ? "Nó proprio" : "Own node"}</span>
            <span className="home-trust-desc">{isPortuguese ? "Verificacao independente" : "Independent verification"}</span>
          </div>
        </div>
        <div className="home-trust-divider" />
        <div className="home-trust-item">
          <ShieldIcon className="home-trust-icon" />
          <div className="home-trust-text">
            <span className="home-trust-title">{isPortuguese ? "Auditavel" : "Auditable"}</span>
            <span className="home-trust-desc">{isPortuguese ? "Codigo aberto" : "Open source"}</span>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="home-features" aria-label="Features">
        <div className="home-feature-card home-feature-primary">
          <div className="home-feature-icon-wrap">
            <ZapIcon className="home-feature-icon" />
          </div>
          <h2>{isPortuguese ? "Transacoes instantaneas" : "Instant transactions"}</h2>
          <p>
            {isPortuguese
              ? "Visibilidade em tempo real na mempool. Gaste outputs nao confirmados com seguranca atraves do monitoramento continuo."
              : "Real-time mempool visibility. Safely spend unconfirmed outputs through continuous monitoring."}
          </p>
          <Link to="/adm/node" className="home-feature-link">
            {isPortuguese ? "Ver ferramentas do node" : "View node tools"}
            <ArrowRightIcon className="home-feature-link-icon" />
          </Link>
        </div>

        <div className="home-feature-card">
          <div className="home-feature-icon-wrap">
            <LayersIcon className="home-feature-icon" />
          </div>
          <h2>{isPortuguese ? "Trilha de auditoria" : "Audit trail"}</h2>
          <p>
            {isPortuguese
              ? "Cada operacao registrada. Endereco emitido, pagamento detectado, gasto executado — tudo rastreavel."
              : "Every operation logged. Address issued, payment detected, spend executed — all traceable."}
          </p>
        </div>

        <div className="home-feature-card home-feature-roadmap">
          <div className="home-feature-badge">{isPortuguese ? "Em breve" : "Coming soon"}</div>
          <h2>{t.cardRoadmapTitle}</h2>
          <p>{t.cardRoadmapDesc}</p>
        </div>
      </section>

      {/* Footer info */}
      <footer className="home-footer">
        <p className="home-footer-operators">{t.clientFooterOperators}</p>
        <p className="home-footer-locale">{t.localeFixedBr}</p>
      </footer>

      <style>{`
        .home-hero {
          padding: 3rem 2rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          background: linear-gradient(145deg, var(--background-card) 0%, var(--background-elevated) 100%);
          position: relative;
          overflow: hidden;
        }
        
        .home-hero::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--accent), transparent);
          opacity: 0.4;
        }
        
        .home-hero::after {
          content: '';
          position: absolute;
          top: -50%;
          right: -20%;
          width: 50%;
          height: 200%;
          background: radial-gradient(ellipse, var(--accent-glow) 0%, transparent 70%);
          opacity: 0.3;
          pointer-events: none;
        }
        
        .home-hero-content {
          position: relative;
          z-index: 1;
          max-width: 640px;
        }
        
        .home-hero-badge {
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
          margin-bottom: 1.5rem;
        }
        
        .home-hero-badge-icon {
          width: 14px;
          height: 14px;
        }
        
        .home-hero-title {
          margin: 0 0 1.25rem;
          font-size: clamp(2rem, 5vw, 2.75rem);
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.03em;
          line-height: 1.15;
        }
        
        .home-hero-title span {
          color: var(--accent);
        }
        
        .home-hero-description {
          margin: 0 0 2rem;
          font-size: 1.0625rem;
          color: var(--text-secondary);
          line-height: 1.65;
          max-width: 560px;
        }
        
        .home-hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.875rem;
          margin-bottom: 2rem;
        }
        
        .home-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: var(--accent);
          color: #ffffff;
          font-weight: 600;
          font-size: 0.9375rem;
          text-decoration: none;
          border-radius: var(--radius-sm);
          transition: all 0.2s ease;
        }
        
        .home-btn-primary:hover {
          background: var(--accent-dim);
          transform: translateY(-1px);
          box-shadow: var(--shadow-md);
        }
        
        .home-btn-icon {
          width: 16px;
          height: 16px;
        }
        
        .home-btn-secondary {
          display: inline-flex;
          align-items: center;
          padding: 0.75rem 1.5rem;
          background: transparent;
          color: var(--text-secondary);
          font-weight: 500;
          font-size: 0.9375rem;
          text-decoration: none;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          transition: all 0.2s ease;
        }
        
        .home-btn-secondary:hover {
          border-color: var(--text-muted);
          color: var(--text-primary);
          background: var(--background-hover);
        }
        
        .home-network-status {
          display: inline-flex;
          align-items: center;
          gap: 0.625rem;
          padding: 0.5rem 1rem;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: var(--radius-full);
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }
        
        .home-network-dot {
          width: 8px;
          height: 8px;
          background: var(--accent);
          border-radius: 50%;
          animation: pulse-dot 2s ease-in-out infinite;
        }
        
        .home-network-sep {
          color: var(--border);
        }
        
        /* Trust Section */
        .home-trust {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 1.5rem 2.5rem;
          padding: 1.5rem 2rem;
          background: var(--background-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
        }
        
        .home-trust-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        
        .home-trust-icon {
          width: 24px;
          height: 24px;
          color: var(--accent);
          flex-shrink: 0;
        }
        
        .home-trust-text {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }
        
        .home-trust-title {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .home-trust-desc {
          font-size: 0.8125rem;
          color: var(--text-muted);
        }
        
        .home-trust-divider {
          width: 1px;
          height: 32px;
          background: var(--border);
        }
        
        /* Features */
        .home-features {
          display: grid;
          gap: 1rem;
          grid-template-columns: 1fr;
        }
        
        @media (min-width: 768px) {
          .home-features {
            grid-template-columns: repeat(3, 1fr);
          }
          
          .home-feature-primary {
            grid-column: span 2;
          }
        }
        
        .home-feature-card {
          padding: 1.5rem;
          background: var(--background-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          transition: all 0.2s ease;
          position: relative;
        }
        
        .home-feature-card:hover {
          border-color: var(--border-accent);
          transform: translateY(-2px);
        }
        
        .home-feature-icon-wrap {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: var(--accent-subtle);
          border: 1px solid var(--border-accent);
          border-radius: var(--radius-sm);
          margin-bottom: 1rem;
        }
        
        .home-feature-icon {
          width: 20px;
          height: 20px;
          color: var(--accent);
        }
        
        .home-feature-card h2 {
          margin: 0 0 0.625rem;
          font-size: 1.0625rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .home-feature-card p {
          margin: 0;
          font-size: 0.9375rem;
          color: var(--text-secondary);
          line-height: 1.55;
        }
        
        .home-feature-link {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          margin-top: 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--accent);
          text-decoration: none;
          transition: gap 0.2s ease;
        }
        
        .home-feature-link:hover {
          gap: 0.625rem;
        }
        
        .home-feature-link-icon {
          width: 14px;
          height: 14px;
        }
        
        .home-feature-roadmap {
          border-style: dashed;
          border-color: var(--border);
          background: var(--background-elevated);
        }
        
        .home-feature-roadmap h2 {
          color: var(--text-secondary);
        }
        
        .home-feature-badge {
          display: inline-block;
          padding: 0.25rem 0.625rem;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: var(--radius-full);
          font-size: 0.6875rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.875rem;
        }
        
        /* Footer */
        .home-footer {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border);
        }
        
        .home-footer-operators {
          margin: 0;
          font-size: 0.875rem;
          color: var(--text-muted);
        }
        
        .home-footer-locale {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--text-muted);
          opacity: 0.7;
        }
        
        @media (max-width: 640px) {
          .home-hero {
            padding: 2rem 1.25rem;
          }
          
          .home-trust {
            padding: 1.25rem 1rem;
          }
          
          .home-trust-divider {
            display: none;
          }
          
          .home-trust-item {
            flex: 1 1 100%;
            justify-content: center;
          }
        }
      `}</style>
    </main>
  );
}
