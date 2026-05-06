import { Link } from "react-router-dom";

export function ClientComingSoonPage() {
  return (
    <main className="layout">
      <nav className="page-nav" aria-label="Navigation">
        <Link to="/" className="page-nav-link">
          Home
        </Link>
        <span className="page-nav-sep" aria-hidden="true">
          /
        </span>
        <span className="page-nav-current">cliente</span>
      </nav>

      <section className="panel panel-rpc">
        <h2>Cliente</h2>
        <p className="panel-hint">Em breve.</p>
        <p className="panel-hint">
          Enquanto isso, use <Link to="/cliente-homologacao">cliente-homologacao</Link>.
        </p>
      </section>
    </main>
  );
}

