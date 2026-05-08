import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { MatrixShell } from "../../components/MatrixShell";
import { MatrixHeader } from "../../components/MatrixHeader";
import { AdmLoginPage } from "./AdmLoginPage";
import { fetchAdmMe, logoutAdm } from "../../adm/session";
import { getUiText } from "../../i18n";

type GateStatus = "loading" | "anon" | "authed";

export function AdmGateLayout() {
  const t = useMemo(() => getUiText(), []);
  const navigate = useNavigate();
  const [status, setStatus] = useState<GateStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    fetchAdmMe()
      .then((ok) => {
        if (!cancelled) {
          setStatus(ok ? "authed" : "anon");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("anon");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await logoutAdm();
    setStatus("anon");
    navigate("/adm", { replace: true });
  }

  if (status === "loading") {
    return (
      <MatrixShell>
        <main className="matrix-login">
          <p className="matrix-session-check">{t.admCheckingSession}</p>
        </main>
      </MatrixShell>
    );
  }

  if (status === "anon") {
    return (
      <MatrixShell>
        <AdmLoginPage onSuccess={() => setStatus("authed")} />
      </MatrixShell>
    );
  }

  return (
    <MatrixShell>
      <MatrixHeader
        variant="adm"
        logoAria={t.logoAriaLabel}
        navConsole={t.admNavConsole}
        navNode={t.admNavNode}
        navSwaps={t.admNavSwaps}
        navFundsRescue={t.admNavFundsRescue}
        navPublic={t.admNavPublic}
        logoutLabel={t.admLogout}
        onLogout={() => void handleLogout()}
      />
      <div className="matrix-main matrix-main-adm">
        <Outlet />
      </div>
    </MatrixShell>
  );
}
