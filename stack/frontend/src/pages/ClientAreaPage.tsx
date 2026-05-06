import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiUrl } from "../api/url";
import { AppLogo } from "../components/AppLogo";
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

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreateOrderResponse | null>(null);
  const [order, setOrder] = useState<GetOrderResponse | null>(null);
  const [depositTxid, setDepositTxid] = useState<string | null>(null);
  const [chain, setChain] = useState("main");

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
            {error ? <p className="error">{error}</p> : null}
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
          </section>

          <section className="panel panel-rpc">
            <h2>Status técnico (raw)</h2>
            {!orderId ? (
              <p className="panel-hint">Crie uma ordem para ver o endereço de depósito.</p>
            ) : (
              <pre className="panel-pre rpc-response-pre">
                {order ? JSON.stringify(order, null, 2) : created ? JSON.stringify(created, null, 2) : "…"}
              </pre>
            )}
          </section>
        </div>

        <section className="panel panel-rpc client-order-card">
          <h2>Ordem</h2>
          {!liveOrder ? (
            <p className="panel-hint">Sem ordem criada ainda.</p>
          ) : (
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
          )}
        </section>
      </div>
    </main>
  );
}

