import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiUrl } from "../api/url";
import { AppLogo } from "../components/AppLogo";
import AddressQRCode from "../components/AddressQRCode";
import { getUiText } from "../i18n";

type CreateOrderResponse = {
  order_id: number;
  status: string;
  deposit_btc_address: string;
  required_deposit_sats: number;
  output_sats: number;
  fee_rate_sat_vb: number;
};

type GetOrderResponse = {
  order_id: number;
  status: string;
  deposit_btc_address: string;
  required_deposit_sats: number;
  output_sats: number;
  destination_btc_address: string;
  payout_txid: string | null;
  last_rpc_status: string | null;
};

type OrderLogEntry = {
  id: number;
  stage: string;
  message: string | null;
  details_json: string | null;
  created_at: string;
};

type ClientNetworkResponse = {
  chain: string;
};

type CreateBoltzOrderResponse = {
  order_id: number;
  status: string;
  deposit_btc_address: string;
  expected_onchain_amount_sat: number;
  boltz_swap_id: string;
  lockup_tx_id?: string | null;
};

type GetBoltzOrderResponse = {
  order_id: number;
  status: string;
  boltz_swap_id: string;
  deposit_btc_address: string | null;
  expected_onchain_amount_sat: number | null;
  status_raw: string | null;
  lockup_tx_id: string | null;
};

type BoltzFees = {
  percentage: number;
  miner_fee_sat: number;
  our_fee_sat: number;
  min_amount_sat: number;
  max_amount_sat: number;
};

/** Extrai o valor em sats da HRP de uma invoice BOLT11 (sem lib externa).
 *  Formato: ln + rede + [amount][multiplier] + 1 + ...
 *  Multipliers: m=milli, u=micro, n=nano, p=pico (BTC)
 */
function parseBolt11Sats(invoice: string): number | null {
  const lower = invoice.toLowerCase().trim();
  const match = lower.match(/^ln(bc|tb|bcrt|tbs)(\d+)([munp])?1/);
  if (!match) return null;
  const amount = parseInt(match[2], 10);
  if (isNaN(amount) || amount <= 0) return null;
  const multipliers: Record<string, number> = {
    "": 100_000_000,
    m: 100_000,
    u: 100,
    n: 0.1,
    p: 0.0001,
  };
  const factor = multipliers[match[3] ?? ""];
  if (factor === undefined) return null;
  const sats = Math.round(amount * factor);
  return sats > 0 ? sats : null;
}

type LightningInputType = "invoice" | "lightning_address" | "lnurl" | "unknown";

function detectLightningInputType(value: string): LightningInputType {
  const v = value.trim().toLowerCase();
  if (v.startsWith("lnbc") || v.startsWith("lntb") || v.startsWith("lnbcrt") || v.startsWith("lntbs")) return "invoice";
  if (v.startsWith("lnurl1")) return "lnurl";
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return "lightning_address";
  return "unknown";
}

const SATS_PER_BTC = 100_000_000;

function satsToBtc(sats: number): string {
  return (sats / 100_000_000).toFixed(8);
}

function normalizeAmountByUnit(raw: string, unit: "btc" | "sats"): string {
  const cleaned = raw.replace(",", ".").trim();
  if (!cleaned) {
    return "";
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) {
    return "";
  }
  if (unit === "sats") {
    return String(Math.floor(n));
  }
  return n.toFixed(8).replace(/\.?0+$/, "");
}

function convertAmountUnit(value: string, from: "btc" | "sats", to: "btc" | "sats"): string {
  const cleaned = value.replace(",", ".").trim();
  if (!cleaned) {
    return "";
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) {
    return value;
  }
  if (from === to) {
    return normalizeAmountByUnit(value, to);
  }
  if (from === "btc" && to === "sats") {
    return String(Math.floor(n * SATS_PER_BTC));
  }
  // from sats to btc
  return (n / SATS_PER_BTC).toFixed(8).replace(/\.?0+$/, "");
}

export function ClientAreaPage() {
  const params = useParams<{ orderId?: string }>();
  const t = useMemo(() => getUiText(), []);

  const [amount, setAmount] = useState("1000");
  const [unit, setUnit] = useState<"sats" | "btc">("sats");
  const [destination, setDestination] = useState("");

  const [mode, setMode] = useState<"onchain" | "lightning">("onchain");
  const [invoice, setInvoice] = useState("");
  const [lnAmount, setLnAmount] = useState(""); // sats, usado quando input é lightning address ou lnurl

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreateOrderResponse | null>(null);
  const [order, setOrder] = useState<GetOrderResponse | null>(null);
  const [depositTxid, setDepositTxid] = useState<string | null>(null);
  const [chain, setChain] = useState("main");

  const [boltzCreated, setBoltzCreated] = useState<CreateBoltzOrderResponse | null>(null);
  const [boltzOrder, setBoltzOrder] = useState<GetBoltzOrderResponse | null>(null);
  const [boltzFees, setBoltzFees] = useState<BoltzFees | null>(null);

  const pollTimerRef = useRef<number | null>(null);
  const initialOrderLoadedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollOrder = useCallback(
    async (orderId: number) => {
      stopPolling();
      setError("");
      try {
        const r = await fetch(apiUrl(`/client/orders/${orderId}`));
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(body?.detail ?? `HTTP ${r.status}`);
        }
        setOrder(body as GetOrderResponse);
        try {
          const logsResp = await fetch(apiUrl(`/client/orders/${orderId}/logs`));
          if (logsResp.ok) {
            const logs = (await logsResp.json()) as OrderLogEntry[];
            const matched = [...logs]
              .reverse()
              .find((l) => l.stage === "handle_hashtx.match_order" && l.details_json);
            if (matched?.details_json) {
              const parsed = JSON.parse(matched.details_json) as { event_txid?: string };
              if (parsed.event_txid) {
                setDepositTxid(parsed.event_txid);
              }
            }
          }
        } catch {
          // logs são complemento de UX; falha aqui não interrompe polling da ordem.
        }

        const status = String((body as GetOrderResponse).status || "");
        if (!["paid_out", "error"].includes(status)) {
          pollTimerRef.current = window.setTimeout(() => {
            void pollOrder(orderId);
          }, 1500);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao consultar ordem");
        pollTimerRef.current = window.setTimeout(() => {
          void pollOrder(orderId);
        }, 2000);
      }
    },
    [stopPolling]
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    let active = true;
    async function loadNetwork() {
      try {
        const r = await fetch(apiUrl("/client/network"));
        const body = (await r.json().catch(() => ({}))) as Partial<ClientNetworkResponse>;
        if (!active || !r.ok) {
          return;
        }
        const value = String(body.chain || "").trim().toLowerCase();
        if (value) {
          setChain(value);
        }
      } catch {
        // fallback permanece "main"
      }
    }
    void loadNetwork();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== "lightning") return;
    let active = true;
    async function loadFees() {
      try {
        const r = await fetch(apiUrl("/client/boltz/fees"));
        if (!active || !r.ok) return;
        const body = (await r.json().catch(() => null)) as BoltzFees | null;
        if (body) setBoltzFees(body);
      } catch {
        // sem fees = preview não aparece; não é bloqueante
      }
    }
    void loadFees();
    return () => { active = false; };
  }, [mode]);

  useEffect(() => {
    if (initialOrderLoadedRef.current) {
      return;
    }
    const raw = (params.orderId || "").trim();
    if (!raw) {
      initialOrderLoadedRef.current = true;
      return;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      initialOrderLoadedRef.current = true;
      setError("order_id inválido na URL");
      return;
    }
    initialOrderLoadedRef.current = true;
    void pollOrder(parsed);
  }, [params.orderId, pollOrder]);

  const pollBoltzOrder = useCallback(
    async (orderId: number) => {
      stopPolling();
      setError("");
      try {
        const r = await fetch(apiUrl(`/client/boltz/orders/${orderId}`));
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.detail ?? `HTTP ${r.status}`);
        setBoltzOrder(body as GetBoltzOrderResponse);
        const status = String((body as GetBoltzOrderResponse).status || "");
        if (!["paid_out", "error"].includes(status)) {
          pollTimerRef.current = window.setTimeout(() => void pollBoltzOrder(orderId), 5000);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao consultar ordem Boltz");
        pollTimerRef.current = window.setTimeout(() => void pollBoltzOrder(orderId), 5000);
      }
    },
    [stopPolling]
  );

  async function onCreateBoltz(e: FormEvent) {
    e.preventDefault();
    stopPolling();
    setError("");
    setBoltzCreated(null);
    setBoltzOrder(null);
    setCreating(true);
    try {
      const inputType = detectLightningInputType(invoice);
      let body: Record<string, unknown>;
      if (inputType === "invoice") {
        body = { invoice: invoice.trim() };
      } else {
        const amtSats = parseInt(lnAmount, 10);
        if (!amtSats || amtSats <= 0) throw new Error("Informe o valor em sats");
        body = { lightning_destination: invoice.trim(), amount_sats: amtSats };
      }
      const r = await fetch(apiUrl("/client/boltz/orders"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const resp = await r.json().catch(() => ({}));
      if (!r.ok) {
        // detail pode ser string (nossa mensagem) ou array Pydantic [{msg: "..."}]
        const detail = resp?.detail;
        const msg = typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((e: { msg?: string }) => e.msg ?? "").filter(Boolean).join("; ") || `HTTP ${r.status}`
            : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      setBoltzCreated(resp as CreateBoltzOrderResponse);
      void pollBoltzOrder((resp as CreateBoltzOrderResponse).order_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar swap Boltz");
    } finally {
      setCreating(false);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    stopPolling();
    setError("");
    setCreated(null);
    setOrder(null);
    setDepositTxid(null);
    setCreating(true);
    try {
      const r = await fetch(apiUrl("/client/orders"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount,
          unit,
          destination_btc_address: destination,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body?.detail ?? `HTTP ${r.status}`);
      }
      const resp = body as CreateOrderResponse;
      setCreated(resp);
      void pollOrder(resp.order_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar ordem");
    } finally {
      setCreating(false);
    }
  }

  const orderId = created?.order_id ?? order?.order_id ?? null;
  const liveOrder = order ?? created;
  const requiredBtc = liveOrder ? satsToBtc(liveOrder.required_deposit_sats) : null;
  const outputBtc = liveOrder ? satsToBtc(liveOrder.output_sats) : null;
  const destinationDisplay =
    order?.destination_btc_address ??
    destination;
  const feeBtc =
    liveOrder && liveOrder.required_deposit_sats >= liveOrder.output_sats
      ? satsToBtc(liveOrder.required_deposit_sats - liveOrder.output_sats)
      : null;

  const liveBoltz = boltzOrder ?? boltzCreated;
  const boltzLockupAddress = liveBoltz?.deposit_btc_address ?? null;
  const boltzExpectedSat = liveBoltz?.expected_onchain_amount_sat ?? null;
  const boltzExpectedBtc = boltzExpectedSat != null ? satsToBtc(boltzExpectedSat) : null;
  const boltzStatus = boltzOrder?.status ?? boltzCreated?.status ?? null;
  const boltzStatusRaw = boltzOrder?.status_raw ?? null;
  const boltzSwapId = liveBoltz?.boltz_swap_id ?? null;

  // Detecta o tipo de input da aba Lightning.
  const lightningInputType = useMemo(() => detectLightningInputType(invoice), [invoice]);
  const needsAmountField = lightningInputType === "lightning_address" || lightningInputType === "lnurl";

  // Preview ao vivo — para invoice BOLT11 extrai os sats; para lightning address/lnurl usa lnAmount.
  const invoiceSats = useMemo(() => {
    if (lightningInputType === "invoice") return parseBolt11Sats(invoice);
    if (needsAmountField) {
      const n = parseInt(lnAmount, 10);
      return n > 0 ? n : null;
    }
    return null;
  }, [lightningInputType, invoice, lnAmount, needsAmountField]);
  const invoicePreview = useMemo(() => {
    if (!invoiceSats || !boltzFees) return null;
    const percentFee = Math.ceil((invoiceSats * boltzFees.percentage) / 100);
    const total = invoiceSats + percentFee + boltzFees.miner_fee_sat + boltzFees.our_fee_sat;
    return { invoiceSats, percentFee, minerFee: boltzFees.miner_fee_sat, ourFee: boltzFees.our_fee_sat, total };
  }, [invoiceSats, boltzFees]);
  const isConfirming = order?.status === "confirming";
  const isPaidOut = order?.status === "paid_out";
  const showTrackingLinks = isConfirming || isPaidOut;
  const payoutTxid = order?.payout_txid ?? null;
  const mempoolBase = chain === "main" ? "https://mempool.space" : `https://mempool.space/${chain}`;
  const mempoolTx = (txid: string) => `${mempoolBase}/tx/${txid}`;
  const mempoolAddress = (address: string) => `${mempoolBase}/address/${address}`;

  function onToggleUnit(next: "btc" | "sats") {
    if (next === unit) {
      return;
    }
    setAmount((prev) => convertAmountUnit(prev, unit, next));
    setUnit(next);
  }

  return (
    <main className="layout">
      <nav className="page-nav" aria-label="Navigation">
        <Link to="/" className="page-nav-link">
          Home
        </Link>
        <span className="page-nav-sep" aria-hidden="true">
          /
        </span>
        <span className="page-nav-current">cliente-homologacao</span>
      </nav>

      <header className="hero">
        <div className="hero-brand">
          <AppLogo className="hero-logo" variant="matrix" aria-label={t.logoAriaLabel} />
          <div className="hero-copy">
            <h1>cliente-homologacao</h1>
            <p>Crie uma ordem: depósito → envio automático</p>
          </div>
        </div>
        <div className="badges">
          <span className="badge">REDE: {chain.toUpperCase()}</span>
        </div>
        <p className="hero-meta">{t.localeFixedBr}</p>
      </header>

      <div className="workspace client-hml-workspace">
        <div className="client-hml-left">
          <section className="panel panel-rpc">
            <h2>Criar ordem</h2>

            <div className="btc-sats-toggle" role="tablist" aria-label="Tipo de ordem" style={{ marginBottom: "1rem" }}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "onchain"}
                className={mode === "onchain" ? "is-active" : ""}
                onClick={() => { setMode("onchain"); setError(""); }}
              >
                Envio on-chain
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "lightning"}
                className={mode === "lightning" ? "is-active" : ""}
                disabled={chain === "signet"}
                title={chain === "signet" ? "Swap não disponível em signet" : undefined}
                onClick={() => { if (chain !== "signet") { setMode("lightning"); setError(""); } }}
              >
                Swap ⚡ Lightning
              </button>
            </div>
            {chain === "signet" && (
              <p className="panel-hint" style={{ marginTop: "-0.5rem", marginBottom: "0.75rem", color: "var(--color-warning, #f59e0b)" }}>
                ⚠ Swap Lightning não disponível em signet — use mainnet.
              </p>
            )}

            {error ? <p className="error">{error}</p> : null}

            {mode === "onchain" ? (
              <form onSubmit={onCreate} className="row client-order-form">
                <label className="client-order-field">
                  <span>Valor</span>
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>

                <label className="client-order-field client-order-field-unit">
                  <span>Unidade</span>
                  <div className="btc-sats-toggle" role="tablist" aria-label="Unidade de valor">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={unit === "btc"}
                      className={unit === "btc" ? "is-active" : ""}
                      onClick={() => onToggleUnit("btc")}
                    >
                      BTC
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={unit === "sats"}
                      className={unit === "sats" ? "is-active" : ""}
                      onClick={() => onToggleUnit("sats")}
                    >
                      sats
                    </button>
                  </div>
                </label>

                <label className="client-order-field client-order-field-destination">
                  <span>Endereço final</span>
                  <input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="bc1... / tb1..."
                  />
                </label>

                <div className="client-order-submit">
                  <button type="submit" disabled={creating}>
                    {creating ? "Criando…" : "Criar ordem"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={onCreateBoltz} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--mx-muted)" }}>
                    {needsAmountField ? "Lightning Address / LNURL" : "Invoice BOLT11"}
                  </span>
                  <input
                    value={invoice}
                    onChange={(e) => { setInvoice(e.target.value); setError(""); }}
                    placeholder="lnbc... ou user@dominio.com ou lnurl1..."
                    style={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                  />
                </label>

                {needsAmountField && (
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--mx-muted)" }}>Valor a enviar (sats)</span>
                    <input
                      type="number"
                      min={1}
                      value={lnAmount}
                      onChange={(e) => { setLnAmount(e.target.value); setError(""); }}
                      placeholder="ex: 10000"
                      style={{ fontFamily: "monospace", fontSize: "0.82rem" }}
                    />
                  </label>
                )}

                <p className="panel-hint" style={{ margin: 0 }}>
                  {needsAmountField
                    ? "Informe um Lightning Address (user@domínio) ou LNURL e o valor em sats."
                    : "Cole a invoice Lightning. Vamos converter seu depósito BTC automaticamente."}
                </p>

                {invoicePreview && (
                  <div className="panel-hint" style={{ background: "rgba(0,255,70,0.06)", border: "1px solid rgba(0,255,70,0.25)", borderRadius: "6px", padding: "0.75rem 1rem", lineHeight: "1.8", fontFamily: "monospace", fontSize: "0.82rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Invoice</span>
                      <span>{invoicePreview.invoiceSats.toLocaleString()} sats</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Taxa do serviço</span>
                      <span>+{(invoicePreview.percentFee + invoicePreview.minerFee + invoicePreview.ourFee).toLocaleString()} sats</span>
                    </div>
                    <hr style={{ border: "none", borderTop: "1px solid rgba(0,255,70,0.2)", margin: "0.4rem 0" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontWeight: "bold", color: invoicePreview.total < (boltzFees?.min_amount_sat ?? 0) ? "#f87171" : "inherit" }}>
                      <span>Total a depositar</span>
                      <span>{invoicePreview.total.toLocaleString()} sats ({satsToBtc(invoicePreview.total)} BTC)</span>
                    </div>
                    {invoicePreview.total < (boltzFees?.min_amount_sat ?? 0) && (
                      <p style={{ margin: "0.4rem 0 0", color: "#f87171", fontSize: "0.78rem" }}>
                        ⚠ Valor abaixo do mínimo ({(boltzFees?.min_amount_sat ?? 0).toLocaleString()} sats)
                      </p>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="submit" disabled={creating || !invoice.trim() || (invoicePreview != null && invoicePreview.total < (boltzFees?.min_amount_sat ?? 0))}>
                    {creating ? "Criando…" : "Criar swap"}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="panel panel-rpc">
            <h2>Status técnico (raw)</h2>
            {!orderId && !liveBoltz ? (
              <p className="panel-hint">Crie uma ordem para ver o endereço de depósito.</p>
            ) : (
              <pre className="panel-pre rpc-response-pre">
                {liveBoltz
                  ? JSON.stringify(liveBoltz, null, 2)
                  : order
                  ? JSON.stringify(order, null, 2)
                  : created
                  ? JSON.stringify(created, null, 2)
                  : "…"}
              </pre>
            )}
          </section>
        </div>

        <section className="panel panel-rpc client-order-card">
          <h2>Ordem</h2>
          {!liveOrder && !liveBoltz ? (
            <p className="panel-hint">Sem ordem criada ainda.</p>
          ) : liveBoltz ? (
            <div className="client-order-card-content">
              <p>
                Swap Lightning <strong>#{liveBoltz.order_id}</strong>
              </p>
              {boltzLockupAddress ? (
                <>
                  <div className="client-inline-copy">
                    <p>
                      Deposite{" "}
                      <span className="client-highlight-value">{boltzExpectedBtc} BTC</span>
                    </p>
                    <button
                      type="button"
                      className="copy-icon-button"
                      aria-label="Copiar valor"
                      onClick={() => navigator.clipboard.writeText(boltzExpectedBtc ?? "")}
                    >⧉</button>
                  </div>
                  <div style={{ margin: "0.75rem 0" }}>
                    <AddressQRCode value={boltzLockupAddress} size={160} />
                  </div>
                  <div className="client-inline-copy">
                    <p>
                      Em{" "}
                      <span className="client-highlight-address">{boltzLockupAddress}</span>
                    </p>
                    <button
                      type="button"
                      className="copy-icon-button"
                      aria-label="Copiar endereço de depósito"
                      onClick={() => navigator.clipboard.writeText(boltzLockupAddress)}
                    >⧉</button>
                  </div>
                  <p className="panel-hint">
                    <a href={mempoolAddress(boltzLockupAddress)} target="_blank" rel="noreferrer">
                      Ver endereço de depósito no mempool ↗
                    </a>
                  </p>
                </>
              ) : null}
              {boltzStatus === "paid_out" ? (
                <div className="client-success-box">
                  <p className="client-success-title">Invoice paga com sucesso ⚡</p>
                  {liveBoltz?.lockup_tx_id && (
                    <p className="panel-hint">
                      <a href={mempoolTx(liveBoltz.lockup_tx_id)} target="_blank" rel="noreferrer">
                        Ver transação de depósito no mempool ↗
                      </a>
                    </p>
                  )}
                </div>
              ) : boltzStatus === "error" ? (
                <p className="error">Swap falhou. Tente novamente ou entre em contato.</p>
              ) : boltzStatus === "deposit_detected" || boltzStatus === "provider_processing" ? (
                <div>
                  <p className="panel-hint" style={{ marginBottom: "0.4rem" }}>
                    {boltzStatus === "deposit_detected"
                      ? "⏳ Depósito detectado — aguardando confirmação na rede..."
                      : "⚡ Confirmado — processando pagamento Lightning..."}
                  </p>
                  {liveBoltz?.lockup_tx_id && (
                    <p className="panel-hint">
                      <a href={mempoolTx(liveBoltz.lockup_tx_id)} target="_blank" rel="noreferrer">
                        Ver transação de depósito no mempool ↗
                      </a>
                    </p>
                  )}
                </div>
              ) : (
                <p className="panel-hint">⏳ Aguardando depósito no endereço acima...</p>
              )}
            </div>
          ) : liveOrder ? (
            <div className="client-order-card-content">
              <p>
                Ordem número <strong>{liveOrder.order_id}</strong>
              </p>
              <div className="client-inline-copy">
                <p>
                  Deposite <span className="client-highlight-value">{requiredBtc} BTC</span>
                </p>
                <button
                  type="button"
                  className="copy-icon-button"
                  aria-label="Copiar valor"
                  title="Copiar valor"
                  onClick={() => navigator.clipboard.writeText(requiredBtc ?? "")}
                  disabled={!requiredBtc}
                >
                  ⧉
                </button>
              </div>
              <div className="client-inline-copy">
                <p>
                  Em <span className="client-highlight-address">{liveOrder.deposit_btc_address}</span>
                </p>
                <button
                  type="button"
                  className="copy-icon-button"
                  aria-label="Copiar endereço"
                  title="Copiar endereço"
                  onClick={() => navigator.clipboard.writeText(liveOrder.deposit_btc_address)}
                >
                  ⧉
                </button>
              </div>
              <div style={{ margin: "0.75rem 0" }}>
                <AddressQRCode value={liveOrder.deposit_btc_address} size={160} />
              </div>
              <p className="panel-hint">
                Você receberá <span className="client-highlight-value">{outputBtc} BTC</span> em{" "}
                <span className="client-highlight-address">{destinationDisplay}</span> e pagará{" "}
                <span className="client-highlight-value">{feeBtc} BTC</span> de taxas.
              </p>
              {showTrackingLinks ? (
                <div className="client-success-box">
                  <p className="client-success-title">
                    {isConfirming
                      ? "Aguardando confirmação da transação de payout"
                      : "Transação de payout confirmada"}
                  </p>
                  <p className="panel-hint">Acompanhe no mempool (rede {chain}):</p>
                  <ul className="client-links-list">
                    {depositTxid ? (
                      <li>
                        <a href={mempoolTx(depositTxid)} target="_blank" rel="noreferrer">
                          Transação de depósito <span className="external-link-icon">↗</span>
                        </a>
                      </li>
                    ) : null}
                    {payoutTxid ? (
                      <li>
                        <a href={mempoolTx(payoutTxid)} target="_blank" rel="noreferrer">
                          Transação de payout <span className="external-link-icon">↗</span>
                        </a>
                      </li>
                    ) : null}
                    <li>
                      <a
                        href={mempoolAddress(liveOrder.deposit_btc_address)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Endereço de depósito <span className="external-link-icon">↗</span>
                      </a>
                    </li>
                    <li>
                      <a href={mempoolAddress(destinationDisplay)} target="_blank" rel="noreferrer">
                        Endereço de destino <span className="external-link-icon">↗</span>
                      </a>
                    </li>
                  </ul>
                  <p className="panel-hint">
                    Status técnico: {liveOrder.status}
                    {isConfirming ? " (aguardando 1 confirmação)" : ""}
                  </p>
                </div>
              ) : (
                <p className="panel-hint">Status atual: {liveOrder.status}</p>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
