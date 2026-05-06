import { Link } from "react-router-dom";
import { AppLogo } from "./AppLogo";
type Props =
  | {
      variant: "public";
      logoAria: string;
      matrixNavFlux: string;
      matrixNavInfo: string;
      matrixNavAdm: string;
    }
  | {
      variant: "adm";
      logoAria: string;
      navConsole: string;
      navNode: string;
      navSwaps: string;
      navPublic: string;
      logoutLabel: string;
      onLogout: () => void;
    };

export function MatrixHeader(props: Props) {
  if (props.variant === "public") {
    return (
      <header className="matrix-header">
        <Link to="/" className="matrix-header-brand">
          <AppLogo className="matrix-header-logo" variant="matrix" aria-label={props.logoAria} />
        </Link>
        <nav className="matrix-header-nav" aria-label="Main">
          <span className="matrix-nav-muted">
            [{props.matrixNavFlux}]
          </span>
          <span className="matrix-nav-muted">
            [{props.matrixNavInfo}]
          </span>
          <Link to="/adm" className="matrix-nav-link matrix-nav-link-accent">
            [{props.matrixNavAdm}]
          </Link>
        </nav>
      </header>
    );
  }

  return (
    <header className="matrix-header matrix-header-adm">
      <Link to="/adm" className="matrix-header-brand">
        <AppLogo className="matrix-header-logo" variant="matrix" aria-label={props.logoAria} />
      </Link>
      <nav className="matrix-header-nav" aria-label="Admin">
        <Link to="/adm" className="matrix-nav-link">
          [{props.navConsole}]
        </Link>
        <Link to="/adm/node" className="matrix-nav-link">
          [{props.navNode}]
        </Link>
        <Link to="/adm/swaps" className="matrix-nav-link">
          [{props.navSwaps}]
        </Link>
      </nav>
      <div className="matrix-header-actions">
        <Link to="/" className="matrix-nav-link matrix-nav-link-quiet">
          {props.navPublic}
        </Link>
        <button type="button" className="matrix-btn-logout" onClick={props.onLogout}>
          {props.logoutLabel}
        </button>
      </div>
    </header>
  );
}
