import { FormEvent, useEffect, useState } from "react";
import { apiUrl } from "../../api/url";

type WithdrawResponse = {
  ok: boolean;
  destination_btc_address: string;
  fee_rate_sat_vb: number;
  change_address: string;
  utxo_count: number;
  total_input_sats: number;
  send_sats: number;
  fee_sats: number;
  change_sats: number;
  txid?: string;
  rpc_debug?: unknown;
};

function satsToBtc(sats: number): string {
  return (sats / 100_000_000).toFixed(8);
}

export function AdmWithdrawPage() {
  const [masterPassword, setMasterPassword] = useState("");
  const [destination, setDestination] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingExecute, setLoadingExecute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<WithdrawResponse | null>(null);
  const [executed, setExecuted] = useState<WithdrawResponse | null>(null);
  const [rawResponse, setRawResponse] = useState<WithdrawResponse | null>(null);
  const [chain, setChain] = useState("main");

  const mempoolBase =
    chain === "main"
      ? "https://mempool.space"
      : chain === "testnet"
      ? "https://mempool.space/testnet"
      : chain === "signet"
      ? "https://mempool.space/signet"
      : "https://mempool.space";

  useEffect(() => {
    let active = true;
    async function loadNetwork() {
      try {
        const r = await fetch(apiUrl("/client/network"));
        const b = (await r.json().catch(() => ({}))) as { chain?: string };
        if (!active || !r.ok) return;
        const value = String(b.chain || "").trim().toLowerCase();
        if (value) setChain(value);
      } catch {
        // mantém main
      }
    }
    void loadNetwork();
    return () => {
      active = false;
    };
  }, []);

  async function callWithdraw(path: "/adm/node/admin-withdraw/preview" | "/adm/node/admin-withdraw/execute") {
    const r = await fetch(apiUrl(path), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        master_password: masterPassword,
        destination_btc_address: destination.trim(),
      }),
    });
    const raw = await r.text();
    let body: (WithdrawResponse & { detail?: string }) | null = null;
    try {
      body = raw ? (JSON.parse(raw) as WithdrawResponse & { detail?: string }) : null;
    } catch {
      body = null;
    }
    if (!r.ok) {
      const detail = body?.detail || raw || `HTTP ${r.status}`;
      throw new Error(String(detail));
    }
    return (body || null) as WithdrawResponse | null;
  }

  async function onPreview(e: FormEvent) {
    e.preventDefault();
    setLoadingPreview(true);
    setError(null);
    setExecuted(null);
    try {
      const body = await callWithdraw("/adm/node/admin-withdraw/preview");
      setPreview(body);
      setRawResponse(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no preview de saque");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function onExecute() {
    if (!masterPassword.trim() || !destination.trim()) {
      setError("Informe senha MASTER e endereço destino");
      return;
    }
    setLoadingExecute(true);
    setError(null);
    try {
      const body = await callWithdraw("/adm/node/admin-withdraw/execute");
      setExecuted(body);
      setPreview(body);
      setRawResponse(body);
      // Operação concluída com sucesso: limpa campos sensíveis para próxima ação.
      setMasterPassword("");
      setDestination("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar saque");
    } finally {
      setLoadingExecute(false);
    }
  }

  return (
    <main className="layout">
      <section className="panel adm-soft-panel" style={{ maxWidth: 920 }}>
        <h2 style={{ marginBottom: "0.35rem" }}>Saque administrativo</h2>
        <p className="panel-hint" style={{ marginTop: 0 }}>
          Retira 90% dos fundos do endereço índice 0 (fee-index-0) para o destino informado, com taxa fixa de 3 sat/vB.
          O troco permanece no endereço índice 0 para manter operação da plataforma.
        </p>

        <form onSubmit={onPreview} style={{ display: "grid", gap: "0.5rem" }}>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>Senha MASTER</span>
            <input
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              placeholder="Informe a senha master"
            />
          </label>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>Endereço destino</span>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="bc1... / tb1..."
            />
          </label>
          <div className="adm-toolbar">
            <button type="submit" disabled={loadingPreview || loadingExecute || !masterPassword.trim() || !destination.trim()}>
              {loadingPreview ? "Calculando..." : "Preview do saque"}
            </button>
            <button
              type="button"
              onClick={() => void onExecute()}
              disabled={!preview || loadingPreview || loadingExecute || !masterPassword.trim() || !destination.trim()}
              style={{ background: "var(--color-warning, #eab308)", color: "#111" }}
            >
              {loadingExecute ? "Executando..." : "Executar saque agora"}
            </button>
          </div>
        </form>

        {error ? <p className="error" style={{ marginTop: "0.75rem" }}>{error}</p> : null}

        {preview ? (
          <div className="panel adm-soft-panel" style={{ marginTop: "0.75rem", maxHeight: "none", overflow: "visible" }}>
            <h3 style={{ marginTop: 0 }}>Resumo da operação</h3>
            <p style={{ margin: "0.2rem 0" }}>
              Entradas: <strong>{preview.utxo_count}</strong> UTXOs, total <strong>{preview.total_input_sats.toLocaleString("pt-BR")} sats</strong> ({satsToBtc(preview.total_input_sats)} BTC)
            </p>
            <p style={{ margin: "0.2rem 0" }}>
              Saque (90%): <strong>{preview.send_sats.toLocaleString("pt-BR")} sats</strong> ({satsToBtc(preview.send_sats)} BTC)
            </p>
            <p style={{ margin: "0.2rem 0" }}>
              Taxa: <strong>{preview.fee_sats.toLocaleString("pt-BR")} sats</strong> ({preview.fee_rate_sat_vb} sat/vB)
            </p>
            <p style={{ margin: "0.2rem 0" }}>
              Troco índice 0: <strong>{preview.change_sats.toLocaleString("pt-BR")} sats</strong> ({satsToBtc(preview.change_sats)} BTC)
            </p>
            <p className="panel-hint" style={{ margin: "0.35rem 0 0" }}>
              Change address: <code>{preview.change_address}</code>
            </p>
          </div>
        ) : null}

        {executed?.txid ? (
          <div className="panel adm-soft-panel" style={{ marginTop: "0.75rem", maxHeight: "none", overflow: "visible" }}>
            <h3 style={{ marginTop: 0 }}>Saque enviado</h3>
            <p style={{ margin: "0.2rem 0" }}>
              Txid: <code>{executed.txid}</code>
            </p>
            {executed.txid ? (
              <p className="panel-hint" style={{ margin: "0.2rem 0" }}>
                <a href={`${mempoolBase}/tx/${executed.txid}`} target="_blank" rel="noreferrer">
                  Ver transação no mempool
                </a>
              </p>
            ) : null}
            <p className="panel-hint" style={{ margin: 0 }}>
              Destino: <code>{executed.destination_btc_address}</code>
            </p>
          </div>
        ) : null}

        {rawResponse ? (
          <div className="panel adm-soft-panel" style={{ marginTop: "0.75rem", maxHeight: "none", overflow: "visible", minHeight: 420 }}>
            <h3 style={{ marginTop: 0 }}>Saída JSON (inclui pipeline RPC)</h3>
            <p className="panel-hint" style={{ marginTop: 0 }}>
              Este bloco mostra as respostas de RPC usadas no preview/execução do saque.
            </p>
            <pre className="adm-json-view" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, maxHeight: 520, overflow: "auto" }}>
              {JSON.stringify(rawResponse, null, 2)}
            </pre>
          </div>
        ) : null}
      </section>
    </main>
  );
}
