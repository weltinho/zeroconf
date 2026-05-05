import type { ReactNode } from "react";
import { MatrixRain } from "./MatrixRain";

export function MatrixShell({ children }: { children: ReactNode }) {
  return (
    <div className="matrix-shell">
      <MatrixRain />
      <div className="matrix-shell-content">{children}</div>
    </div>
  );
}
