import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../../api/url";

type OrderRow = {
  order_id: number;
  status: string;
  output_sats: number;
  required_deposit_sats: number;
  deposit_btc_address: string;
  deposit_txid: string | null;
  destination_btc_address: string;
  payout_txid: string | null;
  last_error: string | null;
  created_at: string;
};

type OrderLogRow = {
  id: number;
  order_id: number;
  stage: string;
  message: string | null;
  details_json: string | null;
  auxiliary_info: string | null;
  created_at: string;
};

type ClientNetworkResponse = {
  chain: string;
};

function satsToBtc(sats: number): string {
  return (sats / 100_000_000).toFixed(8);
}

function formatDateBrCompact(value: string): string {
  const m = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/
  );
  if (!m) {
    return value;
  }
  const [, , mm, dd, hh, mi, ss] = m;
  return `${dd}/${mm} ${hh}:${mi}:${ss}`;
}

function mempoolBase(chain: string): string {
  return chain === "main" ? "https://mempool.space" : `https://mempool.space/${chain}`;
}

function mempoolTx(chain: string, txid: string): string {
  return `${mempoolBase(chain)}/tx/${txid}`;
}

function mempoolAddress(chain: string, address: string): string {
  return `${mempoolBase(chain)}/address/${address}`;
}

export function AdmSwapsPage() {
  const [tab, setTab] = useState<"history" | "logs">("history");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderIdForLogs, setOrderIdForLogs] = useState("");
  const [logs, setLogs] = useState<OrderLogRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "awaiting_deposit" | "confirming" | "paid_out" | "error"
  >("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [chain, setChain] = useState("main");

  async function loadOrders() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(apiUrl("/adm/swaps/orders"), { credentials: "include" });
      const b = await r.json().catch(() => []);
      if (!r.ok) throw new Error((b as any)?.detail ?? `HTTP ${r.status}`);
      setOrders(Array.isArray(b) ? (b as OrderRow[]) : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao carregar histórico");
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs() {
    const id = Number(orderIdForLogs.trim());
    if (!Number.isInteger(id) || id <= 0) {
      setErr("Informe um order_id válido para ver logs.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(apiUrl(`/adm/swaps/orders/${id}/logs`), { credentials: "include" });
      const b = await r.json().catch(() => []);
      if (!r.ok) throw new Error((b as any)?.detail ?? `HTTP ${r.status}`);
      setLogs(Array.isArray(b) ? (b as OrderLogRow[]) : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao carregar logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  useEffect(() => {
    let active = true;
    async function loadNetwork() {
      try {
        const r = await fetch(apiUrl("/client/network"));
        const b = (await r.json().catch(() => ({}))) as Partial<ClientNetworkResponse>;
        if (!active || !r.ok) {
          return;
        }
        const value = String(b.chain || "").trim().toLowerCase();
        if (value) {
          setChain(value);
        }
      } catch {
        // fallback main
      }
    }
    void loadNetwork();
    return () => {
      active = false;
    };
  }, []);

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        String(o.order_id).includes(term) ||
        (o.deposit_txid || "").toLowerCase().includes(term) ||
        (o.payout_txid || "").toLowerCase().includes(term) ||
        o.deposit_btc_address.toLowerCase().includes(term) ||
        o.destination_btc_address.toLowerCase().includes(term)
      );
    });
  }, [orders, searchTerm, statusFilter]);

  return (
    <main className="layout">
      <nav className="page-nav" aria-label="Navigation">
        <Link to="/adm" className="page-nav-link">
          [ADM]
        </Link>
        <span className="page-nav-sep" aria-hidden="true">
          /
        </span>
        <span className="page-nav-current">SWAPS</span>
      </nav>

      <header className="hero">
        <div className="hero-copy">
          <h1>Trocas</h1>
          <p>Histórico operacional e logs técnicos por ordem.</p>
        </div>
      </header>

      <section className="panel panel-rpc">
        <div className="row">
          <button
            type="button"
            className={tab === "history" ? "button-ws-start" : ""}
            onClick={() => setTab("history")}
          >
            Histórico de trocas
          </button>
          <button
            type="button"
            className={tab === "logs" ? "button-ws-start" : ""}
            onClick={() => setTab("logs")}
          >
            Logs de swap
          </button>
          <button type="button" onClick={() => void loadOrders()} disabled={loading}>
            Atualizar
          </button>
        </div>
        {err ? <p className="error">{err}</p> : null}

        {tab === "history" ? (
          <>
            <div className="row">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              >
                <option value="all">Todos status</option>
                <option value="awaiting_deposit">awaiting_deposit</option>
                <option value="confirming">confirming</option>
                <option value="paid_out">paid_out</option>
                <option value="error">error</option>
              </select>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por order_id / txid / endereço"
              />
            </div>
            <div className="panel-pre rpc-response-pre adm-swaps-table-wrap">
              <table className="adm-swaps-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Output BTC</th>
                    <th>Required BTC</th>
                    <th>Criada em</th>
                    <th>Tx depósito</th>
                    <th>Tx payout</th>
                    <th>Endereço depósito</th>
                    <th>Endereço destino</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => (
                    <tr key={o.order_id}>
                      <td>{o.order_id}</td>
                      <td>{o.status}</td>
                      <td>{satsToBtc(o.output_sats)}</td>
                      <td>{satsToBtc(o.required_deposit_sats)}</td>
                      <td>{formatDateBrCompact(o.created_at)}</td>
                      <td title={o.deposit_txid || ""}>
                        {o.deposit_txid ? (
                          <a
                            className="adm-link-mono"
                            href={mempoolTx(chain, o.deposit_txid)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {o.deposit_txid}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td title={o.payout_txid || ""}>
                        {o.payout_txid ? (
                          <a
                            className="adm-link-mono"
                            href={mempoolTx(chain, o.payout_txid)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {o.payout_txid}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td title={o.deposit_btc_address}>
                        <a
                          className="adm-link-mono"
                          href={mempoolAddress(chain, o.deposit_btc_address)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {o.deposit_btc_address}
                        </a>
                      </td>
                      <td title={o.destination_btc_address}>
                        <a
                          className="adm-link-mono"
                          href={mempoolAddress(chain, o.destination_btc_address)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {o.destination_btc_address}
                        </a>
                      </td>
                    </tr>
                  ))}
                  {!filteredOrders.length ? (
                    <tr>
                      <td colSpan={9}>Sem resultados para os filtros atuais.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="row">
              <input
                value={orderIdForLogs}
                onChange={(e) => setOrderIdForLogs(e.target.value)}
                placeholder="order_id (ex.: 26)"
              />
              <button type="button" onClick={() => void loadLogs()} disabled={loading}>
                Carregar logs
              </button>
            </div>
            <pre className="panel-pre rpc-response-pre">{JSON.stringify(logs, null, 2)}</pre>
          </>
        )}
      </section>
    </main>
  );
}

