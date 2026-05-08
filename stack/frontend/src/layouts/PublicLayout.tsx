import { Outlet } from "react-router-dom";
import { useMemo } from "react";
import { MatrixShell } from "../components/MatrixShell";
import { MatrixHeader } from "../components/MatrixHeader";
import { getUiText } from "../i18n";

export function PublicLayout() {
  const t = useMemo(() => getUiText(), []);

  return (
    <MatrixShell>
      <MatrixHeader
        variant="public"
        logoAria={t.logoAriaLabel}
        matrixNavFlux={t.matrixNavFlux}
        matrixNavInfo={t.matrixNavInfo}
      />
      <Outlet />
    </MatrixShell>
  );
}
