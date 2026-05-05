import { FormEvent, useMemo, useState } from "react";
import { AppLogo } from "../../components/AppLogo";
import { loginAdm } from "../../adm/session";
import { getUiText } from "../../i18n";

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
        <AppLogo className="matrix-login-logo" variant="matrix" aria-label={t.logoAriaLabel} />
        <p className="matrix-login-kicker">{t.admLoginKicker}</p>
        <h1 className="matrix-login-title">{t.admLoginTitle}</h1>
        <form onSubmit={handleSubmit} className="matrix-login-form">
          <label className="matrix-login-label">
            <span>{t.admUsernameLabel}</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="matrix-input"
            />
          </label>
          <label className="matrix-login-label">
            <span>{t.admPasswordLabel}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="matrix-input"
            />
          </label>
          {error ? <p className="matrix-login-error">{error}</p> : null}
          <button type="submit" className="matrix-btn-primary" disabled={pending}>
            {pending ? t.calling : t.admSubmit}
          </button>
        </form>
        <p className="matrix-login-foot">{t.admLoginFoot}</p>
      </div>
    </main>
  );
}
