import { FormEvent, useMemo, useState } from "react";
import { AppLogo } from "../../components/AppLogo";
import { loginAdm } from "../../adm/session";
import { getUiText } from "../../i18n";

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

type Props = {
  onSuccess: () => void;
};

export function AdmLoginPage({ onSuccess }: Props) {
  const t = useMemo(() => getUiText(), []);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await loginAdm(username, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.admErrorGeneric);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="matrix-login">
      <div className="matrix-login-card">
        <AppLogo className="matrix-login-logo" variant="professional" aria-label={t.logoAriaLabel} />
        
        <div className="login-security-badge">
          <ShieldIcon className="login-security-icon" />
          <span>Acesso seguro</span>
        </div>
        
        <h1 className="matrix-login-title">Painel Administrativo</h1>
        <p className="login-subtitle">Entre com suas credenciais para acessar as ferramentas do operador.</p>
        
        <form onSubmit={handleSubmit} className="matrix-login-form">
          <label className="matrix-login-label">
            <span>Identificador</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="matrix-input"
              placeholder="admin"
            />
          </label>
          <label className="matrix-login-label">
            <span>Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="matrix-input"
              placeholder="Digite sua senha"
            />
          </label>
          {error ? <p className="matrix-login-error">{error}</p> : null}
          <button type="submit" className="matrix-btn-primary" disabled={pending}>
            {pending ? (
              <>
                <span className="login-spinner" />
                Verificando...
              </>
            ) : (
              <>
                <LockIcon className="login-btn-icon" />
                Acessar painel
              </>
            )}
          </button>
        </form>
        
        <div className="login-footer">
          <div className="login-footer-item">
            <ShieldIcon className="login-footer-icon" />
            <span>Senha verificada no servidor (bcrypt)</span>
          </div>
          <div className="login-footer-item">
            <LockIcon className="login-footer-icon" />
            <span>Cookie de sessao HTTP-only</span>
          </div>
        </div>
      </div>
      
      <style>{`
        .login-security-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.25rem 0.625rem;
          background: var(--accent-subtle);
          border: 1px solid var(--border-accent);
          border-radius: var(--radius-full);
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--accent);
          margin-bottom: 1.25rem;
        }
        
        .login-security-icon {
          width: 12px;
          height: 12px;
        }
        
        .login-subtitle {
          margin: 0 0 1.5rem;
          font-size: 0.9375rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        
        .matrix-btn-primary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        
        .login-btn-icon {
          width: 16px;
          height: 16px;
        }
        
        .login-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .login-footer {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }
        
        .login-footer-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        
        .login-footer-icon {
          width: 14px;
          height: 14px;
          color: var(--accent);
          opacity: 0.7;
        }
      `}</style>
    </main>
  );
}
