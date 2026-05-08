import { useState } from "react";
import { Link } from "react-router-dom";
import { CryptoBackground } from "../components/CryptoBackground";
import { AppLogo } from "../components/AppLogo";

function SwapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
    </svg>
  );
}

function BitcoinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-1.65v-1.93c-1.14-.12-2.2-.52-2.87-.98l.5-1.84c.73.47 1.72.92 2.84.92.99 0 1.57-.41 1.57-1.03 0-.58-.49-.94-1.59-1.27-1.56-.47-2.84-1.13-2.84-2.77 0-1.33.96-2.39 2.58-2.7V6.5h1.65v1.89c.95.12 1.72.39 2.27.67l-.47 1.77c-.5-.26-1.27-.59-2.24-.59-.99 0-1.38.47-1.38.94 0 .53.55.81 1.82 1.23 1.73.56 2.63 1.33 2.63 2.85 0 1.32-.94 2.49-2.82 2.83z"/>
    </svg>
  );
}

function LightningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66l.1-.16L12 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15L11 21z"/>
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

export function HomePage() {
  const [sendAmount, setSendAmount] = useState("0.01");
  const [receiveAmount, setReceiveAmount] = useState("1000000");
  const [destinationAddress, setDestinationAddress] = useState("");

  // Simulated conversion (1 BTC = 100M sats for demo)
  const handleSendChange = (value: string) => {
    setSendAmount(value);
    const btc = parseFloat(value) || 0;
    setReceiveAmount(Math.floor(btc * 100000000).toString());
  };

  return (
    <div className="swap-page">
      <CryptoBackground />
      
      <div className="swap-container">
        {/* Header */}
        <header className="swap-header">
          <div className="swap-header-brand">
            <AppLogo height={32} />
          </div>
          <nav className="swap-header-nav">
            <Link to="/adm" className="swap-admin-link" title="Painel Administrativo">
              <SettingsIcon className="swap-admin-icon" />
            </Link>
          </nav>
        </header>

        {/* Main Content */}
        <main className="swap-main">
          <h1 className="swap-title">Liquidez Bitcoin Instantânea</h1>
          <p className="swap-subtitle">Converta entre on-chain e Lightning Network sem custódia</p>

          {/* Swap Card */}
          <div className="swap-card">
            {/* Send */}
            <div className="swap-field">
              <label className="swap-field-label">Enviar</label>
              <div className="swap-field-row">
                <input
                  type="text"
                  className="swap-input"
                  value={sendAmount}
                  onChange={(e) => handleSendChange(e.target.value)}
                  placeholder="0.00"
                />
                <div className="swap-currency">
                  <BitcoinIcon className="swap-currency-icon swap-currency-icon-btc" />
                  <span>BTC</span>
                  <span className="swap-currency-badge">on-chain</span>
                </div>
              </div>
            </div>

            {/* Swap Direction */}
            <div className="swap-divider">
              <button className="swap-direction-btn" type="button">
                <SwapIcon className="swap-direction-icon" />
              </button>
            </div>

            {/* Receive */}
            <div className="swap-field">
              <label className="swap-field-label">Receber</label>
              <div className="swap-field-row">
                <input
                  type="text"
                  className="swap-input"
                  value={receiveAmount}
                  readOnly
                  placeholder="0"
                />
                <div className="swap-currency">
                  <LightningIcon className="swap-currency-icon swap-currency-icon-ln" />
                  <span>sats</span>
                  <span className="swap-currency-badge swap-currency-badge-ln">Lightning</span>
                </div>
              </div>
            </div>

            {/* Destination */}
            <div className="swap-field swap-field-destination">
              <label className="swap-field-label">Destino</label>
              <input
                type="text"
                className="swap-input swap-input-full"
                value={destinationAddress}
                onChange={(e) => setDestinationAddress(e.target.value)}
                placeholder="Invoice Lightning ou endereço Bitcoin..."
              />
            </div>

            {/* Rate Info */}
            <div className="swap-rate">
              <span>Taxa de rede estimada</span>
              <span className="swap-rate-value">~500 sats</span>
            </div>

            {/* Action Button */}
            <button className="swap-btn" type="button">
              Iniciar Troca
            </button>


          </div>
        </main>

        {/* Footer */}
        <footer className="swap-footer">
          <p>Infraestrutura Bitcoin para operadores</p>
        </footer>
      </div>

      <style>{`
        .swap-page {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
        }

        .crypto-background-canvas {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
        }

        .swap-container {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          padding: 1rem 1.5rem;
          max-width: 560px;
          margin: 0 auto;
        }

        /* Header */
        .swap-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0;
          margin-bottom: 2rem;
        }

        .swap-header-brand {
          display: flex;
          align-items: center;
        }

        .swap-header-nav {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .swap-admin-link {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          color: var(--text-muted);
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border);
          transition: all 0.2s ease;
        }

        .swap-admin-link:hover {
          color: var(--text-secondary);
          border-color: var(--border-accent);
          background: rgba(16, 185, 129, 0.05);
        }

        .swap-admin-icon {
          width: 18px;
          height: 18px;
        }

        /* Main */
        .swap-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1rem 0;
        }

        .swap-title {
          margin: 0 0 0.5rem;
          font-size: clamp(1.5rem, 5vw, 2rem);
          font-weight: 700;
          color: var(--text-primary);
          text-align: center;
          letter-spacing: -0.02em;
        }

        .swap-subtitle {
          margin: 0 0 2rem;
          font-size: 1rem;
          color: var(--text-secondary);
          text-align: center;
        }

        /* Swap Card */
        .swap-card {
          width: 100%;
          background: rgba(20, 27, 34, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        .swap-field {
          margin-bottom: 0.75rem;
        }

        .swap-field-label {
          display: block;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-muted);
          margin-bottom: 0.5rem;
        }

        .swap-field-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.25rem 0.5rem 0.25rem 1rem;
          transition: border-color 0.2s ease;
        }

        .swap-field-row:focus-within {
          border-color: var(--accent);
        }

        .swap-input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: 1.5rem;
          font-weight: 600;
          padding: 0.75rem 0;
          min-width: 0;
        }

        .swap-input:focus {
          outline: none;
          box-shadow: none;
        }

        .swap-input::placeholder {
          color: var(--text-muted);
        }

        .swap-input-full {
          width: 100%;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.875rem 1rem;
          font-size: 0.9375rem;
          font-weight: 400;
        }

        .swap-input-full:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        .swap-currency {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--background-elevated);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
        }

        .swap-currency-icon {
          width: 20px;
          height: 20px;
        }

        .swap-currency-icon-btc {
          color: #f7931a;
        }

        .swap-currency-icon-ln {
          color: #facc15;
        }

        .swap-currency-badge {
          font-size: 0.6875rem;
          font-weight: 500;
          color: var(--text-muted);
          background: var(--background);
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .swap-currency-badge-ln {
          color: #facc15;
          background: rgba(250, 204, 21, 0.1);
        }

        /* Swap Divider */
        .swap-divider {
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0.5rem 0;
        }

        .swap-direction-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: var(--background-elevated);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .swap-direction-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-subtle);
        }

        .swap-direction-icon {
          width: 20px;
          height: 20px;
        }

        /* Destination */
        .swap-field-destination {
          margin-top: 1rem;
        }

        /* Rate */
        .swap-rate {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 0;
          margin: 0.5rem 0;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          font-size: 0.8125rem;
          color: var(--text-muted);
        }

        .swap-rate-value {
          color: var(--text-secondary);
          font-weight: 500;
          font-family: 'JetBrains Mono', monospace;
        }

        /* Button */
        .swap-btn {
          width: 100%;
          padding: 1rem;
          margin-top: 1rem;
          background: var(--accent);
          color: #fff;
          border: none;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .swap-btn:hover {
          background: var(--accent-dim);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        /* Footer */
        .swap-footer {
          padding: 1.5rem 0 0.5rem;
          text-align: center;
        }

        .swap-footer p {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--text-muted);
        }

        @media (max-width: 480px) {
          .swap-container {
            padding: 0.75rem 1rem;
          }

          .swap-card {
            padding: 1.25rem;
          }

          .swap-input {
            font-size: 1.25rem;
          }

          .swap-currency {
            padding: 0.375rem 0.5rem;
            font-size: 0.875rem;
          }

          .swap-currency-badge {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
