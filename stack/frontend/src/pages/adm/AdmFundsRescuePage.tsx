import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiUrl } from "../../api/url";
import { formatDateTimeSaoPaulo } from "../../utils/datetime";

type StuckItem = {
  order_id: number;
  provider: string;
  status: string;
  deposit_btc_address: string;
  actual_deposit_sats: number;
  created_at: string;
  last_error: string | null;
  mempool_deposit_url: string;
};

type RescueHistoryItem = {
  rescue_id: number;
  order_id: number;
  created_at: string;
  mode: string;
  destination_btc_address: string;
  rescue_txid: string;
  rescued_sats: number;
  status_after: string | null;
  mempool_destination_url: string | null;
  mempool_tx_url: string;
};

type RescueHistoryDetails = {
  rescue_id: number;
  order_id: number;
  mode: string;
  destination_btc_address: string;
  rescue_txid: string;
  rescued_sats: number;
  created_at: string;
  mempool_tx_url: string;
  rpc_wallet: unknown;
  rpc_rawtx: unknown;
};

type RescueRunResponse = {
  ok: boolean;
  order_id: number;
  rescue_txid: string;
  destination_btc_address: string;
  rpc_send_response?: unknown;
};

function satsToBtc(sats: number): string {
  return (sats / 100_000_000).toFixed(8);
}

function maskMiddle(value: string | null | undefined): string {
  const v = String(value || "").trim();
  if (!v) return "-";
  if (v.length <= 8) return v;
  return `${v.slice(0, 3)}...${v.slice(-3)}`;
}

export function AdmFundsRescuePage() {
  const [items, setItems] = useState<StuckItem[]>([]);
  const [history, setHistory] = useState<RescueHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [forwardAddrByOrder, setForwardAddrByOrder] = useState<Record<number, string>>({});
  const [runningOrderId, setRunningOrderId] = useState<number | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<RescueHistoryDetails | null>(null);
  const [loadingDetailsId, setLoadingDetailsId] = useState<number | null>(null);
  const [lastRescueResponse, setLastRescueResponse] = useState<RescueRunResponse | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(apiUrl("/adm/swaps/stuck-payments"), { credentials: "include" });
      const body = (await r.json().catch(() => [])) as StuckItem[] | { detail?: string };
      if (!r.ok) {
        const detail = typeof body === "object" && !Array.isArray(body) ? String(body.detail || "") : "";
        throw new Error(detail || `HTTP ${r.status}`);
      }
      setItems(Array.isArray(body) ? body : []);

      const hr = await fetch(apiUrl("/adm/swaps/rescue-history"), { credentials: "include" });
      const hbody = (await hr.json().catch(() => [])) as RescueHistoryItem[] | { detail?: string };
      if (!hr.ok) {
        const detail = typeof hbody === "object" && !Array.isArray(hbody) ? String(hbody.detail || "") : "";
        throw new Error(detail || `HTTP ${hr.status}`);
      }
      setHistory(Array.isArray(hbody) ? hbody : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar pagamentos travados");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runRescue(orderId: number) {
    setRunningOrderId(orderId);
    setError(null);
    setLastRescueResponse(null);
    try {
      const payload = { mode: "forward", destination_btc_address: (forwardAddrByOrder[orderId] || "").trim() };
      const r = await fetch(apiUrl(`/adm/swaps/orders/${orderId}/rescue`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const rawText = await r.text();
      let body: (RescueRunResponse & { detail?: string }) | null = null;
      try {
        body = rawText ? (JSON.parse(rawText) as RescueRunResponse & { detail?: string }) : null;
      } catch {
        body = null;
      }
      if (!r.ok) {
        const detail =
          (body && typeof body === "object" && "detail" in body ? String(body.detail || "") : "") ||
          rawText ||
          `HTTP ${r.status}`;
        throw new Error(detail);
      }
      setLastRescueResponse((body || { ok: true, order_id: orderId, rescue_txid: "-", destination_btc_address: "-" }) as RescueRunResponse);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao executar resgate");
    } finally {
      setRunningOrderId(null);
    }
  }

  async function loadRescueDetails(rescueId: number) {
    setDetailsError(null);
    setLoadingDetailsId(rescueId);
    try {
      const r = await fetch(apiUrl(`/adm/swaps/rescue-history/${rescueId}/details`), { credentials: "include" });
      const body = (await r.json().catch(() => ({}))) as RescueHistoryDetails | { detail?: string };
      if (!r.ok) {
        const detail = typeof body === "object" && body && "detail" in body ? String(body.detail || "") : "";
        throw new Error(detail || `HTTP ${r.status}`);
      }
      setSelectedDetails(body as RescueHistoryDetails);
    } catch (e) {
      setDetailsError(e instanceof Error ? e.message : "Falha ao carregar detalhes do resgate");
    } finally {
      setLoadingDetailsId(null);
    }
  }

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        a.actual_deposit_sats === b.actual_deposit_sats
          ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          : a.actual_deposit_sats - b.actual_deposit_sats,
      ),
    [items],
  );

  return (
    <main className="layout">
      <section className="panel" style={{ maxHeight: "none", overflow: "visible" }}>
        <h2 style={{ marginBottom: "0.35rem" }}>Resgate de Fundos</h2>
        <p className="panel-hint" style={{ marginTop: 0 }}>
          Pagamentos travados por UTXO (ordenados do menor para o maior). Encaminhe para o endereço de resgate desejado.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.35rem" }}>
          <button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar lista"}
          </button>
          <span className="panel-hint" style={{ margin: 0 }}>
            {sorted.length} item(ns)
          </span>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {lastRescueResponse ? (
          <details style={{ marginBottom: "0.6rem" }}>
            <summary>Última resposta do RPC de envio</summary>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: "0.35rem" }}>
              {JSON.stringify(lastRescueResponse, null, 2)}
            </pre>
          </details>
        ) : null}

        <div className="adm-swaps-table-wrap">
          <table className="adm-swaps-table">
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Último status</th>
                <th>Valor</th>
                <th>Criada em</th>
                <th>Endereço depósito</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6}>Sem pagamentos travados.</td>
                </tr>
              ) : (
                sorted.map((it) => (
                  <tr key={it.order_id}>
                    <td>#{it.order_id}</td>
                    <td>
                      <div style={{ display: "grid", gap: "0.2rem" }}>
                        <strong>{it.status}</strong>
                        {it.last_error ? (
                          <span className="panel-hint" style={{ margin: 0 }}>
                            {it.last_error}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {it.actual_deposit_sats.toLocaleString("pt-BR")} sats
                      <br />
                      <span className="panel-hint">{satsToBtc(it.actual_deposit_sats)} BTC</span>
                    </td>
                    <td>{formatDateTimeSaoPaulo(it.created_at)}</td>
                    <td>
                      {it.mempool_deposit_url ? (
                        <a href={it.mempool_deposit_url} target="_blank" rel="noreferrer">
                          <code style={{ fontSize: "0.72rem" }}>{maskMiddle(it.deposit_btc_address)}</code>
                        </a>
                      ) : (
                        <code style={{ fontSize: "0.72rem" }}>{maskMiddle(it.deposit_btc_address)}</code>
                      )}
                    </td>
                    <td style={{ minWidth: 280 }}>
                      <div style={{ display: "grid", gap: "0.35rem" }}>
                        <form
                          onSubmit={(e: FormEvent) => {
                            e.preventDefault();
                            void runRescue(it.order_id);
                          }}
                          style={{ display: "grid", gap: "0.35rem" }}
                        >
                          <input
                            placeholder="bc1... / tb1..."
                            value={forwardAddrByOrder[it.order_id] || ""}
                            onChange={(e) =>
                              setForwardAddrByOrder((prev) => ({ ...prev, [it.order_id]: e.target.value }))
                            }
                          />
                          <button type="submit" disabled={runningOrderId === it.order_id}>
                            Encaminhar para outro endereço
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ maxHeight: "none", overflow: "visible" }}>
        <h2 style={{ marginBottom: "0.35rem" }}>Fundos resgatados</h2>
        <p className="panel-hint" style={{ marginTop: 0 }}>
          Histórico dos resgates enviados pela tela administrativa.
        </p>
        <div className="adm-swaps-table-wrap">
          <table className="adm-swaps-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Ordem</th>
                <th>Modo</th>
                <th>Valor</th>
                <th>Destino</th>
                <th>Tx de resgate</th>
                <th>Status após</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={8}>Sem resgates ainda.</td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.rescue_id}>
                    <td>{formatDateTimeSaoPaulo(h.created_at)}</td>
                    <td>#{h.order_id}</td>
                    <td>{h.mode === "origin" ? "Devolução origem" : "Encaminhado"}</td>
                    <td>
                      {h.rescued_sats.toLocaleString("pt-BR")} sats
                      <br />
                      <span className="panel-hint">{satsToBtc(h.rescued_sats)} BTC</span>
                    </td>
                    <td>
                      {h.mempool_destination_url ? (
                        <a href={h.mempool_destination_url} target="_blank" rel="noreferrer">
                          <code style={{ fontSize: "0.72rem" }}>{maskMiddle(h.destination_btc_address)}</code>
                        </a>
                      ) : (
                        <code style={{ fontSize: "0.72rem" }}>{maskMiddle(h.destination_btc_address)}</code>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "grid", gap: "0.25rem" }}>
                        <a href={h.mempool_tx_url} target="_blank" rel="noreferrer">
                          <code style={{ fontSize: "0.72rem" }}>{maskMiddle(h.rescue_txid || "-")}</code>
                        </a>
                        {h.mempool_tx_url ? (
                          <a href={h.mempool_tx_url} target="_blank" rel="noreferrer">
                            Ver no mempool
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td>{h.status_after || "-"}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => void loadRescueDetails(h.rescue_id)}
                        disabled={loadingDetailsId === h.rescue_id}
                      >
                        {loadingDetailsId === h.rescue_id ? "Carregando..." : "Detalhes RPC"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {detailsError ? <p className="error">{detailsError}</p> : null}
        {selectedDetails ? (
          <div className="panel" style={{ marginTop: "0.75rem", maxHeight: "none", overflow: "visible" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              <h3 style={{ margin: 0 }}>Detalhes do resgate #{selectedDetails.rescue_id}</h3>
              <button type="button" onClick={() => setSelectedDetails(null)}>
                Fechar
              </button>
            </div>
            <p className="panel-hint" style={{ marginTop: "0.35rem" }}>
              Ordem #{selectedDetails.order_id} - {selectedDetails.mode === "origin" ? "devolução origem" : "encaminhado"}.
            </p>
            <p style={{ margin: "0.25rem 0" }}>
              <a href={selectedDetails.mempool_tx_url} target="_blank" rel="noreferrer">
                Abrir transação no mempool
              </a>
            </p>
            <details style={{ marginTop: "0.5rem" }}>
              <summary>RPC wallet (`gettransaction`)</summary>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: "0.35rem" }}>
                {JSON.stringify(selectedDetails.rpc_wallet, null, 2)}
              </pre>
            </details>
            <details style={{ marginTop: "0.5rem" }}>
              <summary>RPC rawtx (`getrawtransaction` verbose)</summary>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: "0.35rem" }}>
                {JSON.stringify(selectedDetails.rpc_rawtx, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}
      </section>
    </main>
  );
}
