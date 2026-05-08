import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiUrl } from "../../api/url";

type StuckItem = {
  order_id: number;
  provider: string;
  status: string;
  deposit_btc_address: string;
  actual_deposit_sats: number;
  created_at: string;
  last_error: string | null;
  origin_address: string | null;
};

function satsToBtc(sats: number): string {
  return (sats / 100_000_000).toFixed(8);
}

export function AdmFundsRescuePage() {
  const [items, setItems] = useState<StuckItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forwardAddrByOrder, setForwardAddrByOrder] = useState<Record<number, string>>({});
  const [runningOrderId, setRunningOrderId] = useState<number | null>(null);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar pagamentos travados");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runRescue(orderId: number, mode: "origin" | "forward") {
    setRunningOrderId(orderId);
    setError(null);
    try {
      const payload =
        mode === "forward"
          ? { mode, destination_btc_address: (forwardAddrByOrder[orderId] || "").trim() }
          : { mode };
      const r = await fetch(apiUrl(`/adm/swaps/orders/${orderId}/rescue`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await r.json().catch(() => ({}))) as { detail?: string; rescue_txid?: string };
      if (!r.ok) {
        throw new Error(String(body.detail || `HTTP ${r.status}`));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao executar resgate");
    } finally {
      setRunningOrderId(null);
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
          Pagamentos travados por UTXO (ordenados do menor para o maior). Pode devolver para a origem ou encaminhar para outro endereço.
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

        <div className="adm-swaps-table-wrap">
          <table className="adm-swaps-table">
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Criada em</th>
                <th>Endereço depósito</th>
                <th>Origem detectada</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7}>Sem pagamentos travados.</td>
                </tr>
              ) : (
                sorted.map((it) => (
                  <tr key={it.order_id}>
                    <td>#{it.order_id}</td>
                    <td>{it.status}</td>
                    <td>
                      {it.actual_deposit_sats.toLocaleString("pt-BR")} sats
                      <br />
                      <span className="panel-hint">{satsToBtc(it.actual_deposit_sats)} BTC</span>
                    </td>
                    <td>{new Date(it.created_at).toLocaleString("pt-BR")}</td>
                    <td><code style={{ fontSize: "0.72rem" }}>{it.deposit_btc_address}</code></td>
                    <td>
                      {it.origin_address ? <code style={{ fontSize: "0.72rem" }}>{it.origin_address}</code> : <span className="panel-hint">indisponível</span>}
                      {it.last_error ? <p className="panel-hint" style={{ margin: "0.25rem 0 0" }}>{it.last_error}</p> : null}
                    </td>
                    <td style={{ minWidth: 280 }}>
                      <div style={{ display: "grid", gap: "0.35rem" }}>
                        <button
                          type="button"
                          disabled={!it.origin_address || runningOrderId === it.order_id}
                          onClick={() => void runRescue(it.order_id, "origin")}
                        >
                          {runningOrderId === it.order_id ? "Enviando..." : "Devolver para origem"}
                        </button>
                        <form
                          onSubmit={(e: FormEvent) => {
                            e.preventDefault();
                            void runRescue(it.order_id, "forward");
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
    </main>
  );
}
