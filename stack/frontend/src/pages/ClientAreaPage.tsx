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
  provider?: string;
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
  provider?: string;
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
  our_deposit_address: string | null;
  deposit_btc_address: string | null;
  required_deposit_sats: number | null;
  expected_onchain_amount_sat: number | null;
  status_raw: string | null;
  deposit_tx_id: string | null;         // tx do cliente → nossa wallet
  lockup_tx_id: string | null;          // tx nossa → lockup Boltz
  preimage: string | null;
};

type BoltzFees = {
  percentage: number;
  miner_fee_sat: number;
  our_fee_sat: number;
  min_amount_sat: number;
  max_amount_sat: number;
};

type CatalogCategoryOpt = {
  slug: string;
  label: string;
};

type CatalogCountryOpt = {
  code: string;
  name: string;
};

function bitrefillFetchErrorMessage(status: number, detail: string): string {
  const d = detail.trim() || "erro desconhecido";
  if (status === 404) {
    return `${d} · 404: a API em uso não expõe /client/bitrefill/ (backend desatualizado ou proxy errado). Em dev, confira VITE_DEV_API_PROXY em stack/frontend e o alvo em vite.config.ts.`;
  }
  return d;
}

function catalogProductsPath(categorySlug: string, countryCode: string): string {
  const q = new URLSearchParams({
    start: "0",
    limit: "50",
    country: countryCode.trim().toUpperCase().slice(0, 2) || "BR",
  });
  const cat = categorySlug.trim();
  if (cat) {
    q.set("category", cat);
  }
  return `/client/bitrefill/catalog/products?${q.toString()}`;
}

type CatalogPackage = {
  id: string | null;
  value?: string | number | null;
  price?: number | null;
  amount?: string | number | null;
};

type CatalogProduct = {
  id: string | null;
  name: string | null;
  currency: string | null;
  recipient_type?: string | null;
  in_stock: boolean;
  categories: string[];
  packages: CatalogPackage[];
  range?: Record<string, unknown> | null;
  country_code?: string | null;
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

const BOLTZ_STEPS: { key: string; label: string }[] = [
  { key: "awaiting_deposit", label: "Aguardando depósito" },
  { key: "deposit_detected", label: "Depósito detectado" },
  { key: "provider_processing", label: "Processando Lightning" },
  { key: "paid_out", label: "Invoice paga" },
];

export function ClientAreaPage() {
  const params = useParams<{ orderId?: string }>();
  const t = useMemo(() => getUiText(), []);

  const [amount, setAmount] = useState("1000");
  const [unit, setUnit] = useState<"sats" | "btc">("sats");
  const [destination, setDestination] = useState("");

  const [mode, setMode] = useState<"onchain" | "lightning" | "compras">("onchain");
  const [invoice, setInvoice] = useState("");

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreateOrderResponse | null>(null);
  const [order, setOrder] = useState<GetOrderResponse | null>(null);
  const [depositTxid, setDepositTxid] = useState<string | null>(null);
  const [chain, setChain] = useState("main");

  const [boltzCreated, setBoltzCreated] = useState<CreateBoltzOrderResponse | null>(null);
  const [boltzOrder, setBoltzOrder] = useState<GetBoltzOrderResponse | null>(null);
  const [boltzFees, setBoltzFees] = useState<BoltzFees | null>(null);

  const [comprasCategorySlug, setComprasCategorySlug] = useState("");
  const [comprasCountryCode, setComprasCountryCode] = useState("BR");
  const [comprasCountries, setComprasCountries] = useState<CatalogCountryOpt[]>([
    { code: "BR", name: "Brasil" },
  ]);
  const [comprasCategories, setComprasCategories] = useState<CatalogCategoryOpt[]>([]);
  const [comprasProducts, setComprasProducts] = useState<CatalogProduct[]>([]);
  const [comprasProductId, setComprasProductId] = useState("");
  const [comprasPackageId, setComprasPackageId] = useState("");
  const [comprasEmail, setComprasEmail] = useState("");
  const [comprasPhone, setComprasPhone] = useState("");
  const [bitrefillLoading, setBitrefillLoading] = useState(false);
  const [bitrefillError, setBitrefillError] = useState<string | null>(null);
  const [comprasSubmitting, setComprasSubmitting] = useState(false);

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

  const comprasSelectedProduct = useMemo(
    () => comprasProducts.find((p) => String(p.id) === comprasProductId) ?? null,
    [comprasProducts, comprasProductId],
  );

  const comprasNeedsPhone = comprasSelectedProduct?.recipient_type === "phone_number";

  useEffect(() => {
    setComprasPackageId("");
  }, [comprasProductId]);

  useEffect(() => {
    if (mode !== "compras" || chain === "signet") return;
    setComprasProductId("");
    setComprasPackageId("");
    setBitrefillError(null);
  }, [comprasCategorySlug, comprasCountryCode, mode, chain]);

  useEffect(() => {
    if (mode !== "compras" || chain === "signet") return;
    let cancelled = false;
    setBitrefillLoading(true);
    setBitrefillError(null);

    async function load() {
      try {
        const productsPath = catalogProductsPath(comprasCategorySlug, comprasCountryCode);
        const [countriesRes, catRes, prodRes] = await Promise.all([
          fetch(apiUrl("/client/bitrefill/catalog/countries")),
          fetch(apiUrl("/client/bitrefill/catalog/categories")),
          fetch(apiUrl(productsPath)),
        ]);
        if (cancelled) return;
        if (!countriesRes.ok) {
          const b = await countriesRes.json().catch(() => ({}));
          const raw = typeof b?.detail === "string" ? b.detail : "";
          throw new Error(bitrefillFetchErrorMessage(countriesRes.status, raw || `HTTP ${countriesRes.status}`));
        }
        if (!catRes.ok) {
          const b = await catRes.json().catch(() => ({}));
          const raw = typeof b?.detail === "string" ? b.detail : "";
          throw new Error(bitrefillFetchErrorMessage(catRes.status, raw || `HTTP ${catRes.status}`));
        }
        if (!prodRes.ok) {
          const b = await prodRes.json().catch(() => ({}));
          const raw = typeof b?.detail === "string" ? b.detail : "";
          throw new Error(bitrefillFetchErrorMessage(prodRes.status, raw || `HTTP ${prodRes.status}`));
        }
        const countriesJson = (await countriesRes.json()) as { data?: CatalogCountryOpt[] };
        const list = countriesJson.data ?? [];
        if (list.length > 0) {
          setComprasCountries(list);
          const codes = new Set(list.map((c) => c.code));
          if (!codes.has(comprasCountryCode)) {
            setComprasCountryCode(list[0].code);
            return;
          }
        }
        const cats = ((await catRes.json()) as { data?: CatalogCategoryOpt[] }).data ?? [];
        const pj = (await prodRes.json()) as {
          products?: CatalogProduct[];
        };
        setComprasCategories(cats);
        setComprasProducts(pj.products ?? []);
      } catch (e) {
        if (!cancelled) {
          setBitrefillError(e instanceof Error ? e.message : "Erro ao carregar catálogo Bitrefill");
        }
      } finally {
        if (!cancelled) setBitrefillLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, chain, comprasCategorySlug, comprasCountryCode]);

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
      const body = { invoice: invoice.trim() };
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

  async function onCreateCompras() {
    if (chain === "signet") return;
    stopPolling();
    setError("");
    setBoltzCreated(null);
    setBoltzOrder(null);
    setComprasSubmitting(true);
    try {
      const r = await fetch(apiUrl("/client/bitrefill/orders"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product_id: comprasProductId,
          package_id: comprasPackageId || "",
          customer_email: comprasEmail.trim(),
          phone_number: comprasNeedsPhone ? comprasPhone.trim() : "",
          country: comprasCountryCode,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        const detail = body?.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((e: { msg?: string }) => e.msg ?? "").filter(Boolean).join("; ") ||
                `HTTP ${r.status}`
              : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      const resp = body as CreateOrderResponse;
      setCreated(resp);
      setOrder(null);
      setDepositTxid(null);
      void pollOrder(resp.order_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar compra Bitrefill");
    } finally {
      setComprasSubmitting(false);
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

  const isBitrefillOrder =
    (order?.provider ?? created?.provider) === "bitrefill";

  const liveBoltz = boltzOrder ?? boltzCreated;
  const boltzStatus = boltzOrder?.status ?? boltzCreated?.status ?? null;
  const boltzSwapId = liveBoltz?.boltz_swap_id ?? null;
  const clientDepositAddress = boltzCreated?.deposit_btc_address ?? boltzOrder?.our_deposit_address ?? null;
  const boltzExpectedSat = boltzOrder?.required_deposit_sats ?? boltzCreated?.expected_onchain_amount_sat ?? null;
  const boltzExpectedBtc = boltzExpectedSat != null ? satsToBtc(boltzExpectedSat) : null;
  const boltzLockupTxId = boltzOrder?.lockup_tx_id ?? boltzCreated?.lockup_tx_id ?? null;
  const boltzDepositTxId = boltzOrder?.deposit_tx_id ?? null;  // tx do cliente → nossa wallet
  const boltzPreimage = boltzOrder?.preimage ?? null;
  const boltzStepIndex = BOLTZ_STEPS.findIndex((s) => s.key === boltzStatus);

  // Preview ao vivo — extrai sats da invoice BOLT11.
  const invoiceSats = useMemo(() => parseBolt11Sats(invoice), [invoice]);
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

            <div
              className="btc-sats-toggle"
              role="tablist"
              aria-label="Tipo de ordem"
              style={{
                marginBottom: "1rem",
                display: "flex",
                flexWrap: "wrap",
                gap: "0.35rem",
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "onchain"}
                className={mode === "onchain" ? "is-active" : ""}
                onClick={() => {
                  setMode("onchain");
                  setError("");
                }}
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
                onClick={() => {
                  if (chain !== "signet") {
                    setMode("lightning");
                    setError("");
                  }
                }}
              >
                Swap ⚡ Lightning
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "compras"}
                className={mode === "compras" ? "is-active" : ""}
                disabled={chain === "signet"}
                title={chain === "signet" ? "Compras Bitrefill indisponível em signet" : undefined}
                onClick={() => {
                  if (chain !== "signet") {
                    setMode("compras");
                    setError("");
                  }
                }}
              >
                Compras
              </button>
            </div>
            {chain === "signet" && (mode === "lightning" || mode === "compras") && (
              <p
                className="panel-hint"
                style={{
                  marginTop: "-0.5rem",
                  marginBottom: "0.75rem",
                  color: "var(--color-warning, #f59e0b)",
                }}
              >
                ⚠ Swap Lightning e Compras Bitrefill não disponíveis em signet — use mainnet.
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
            ) : mode === "lightning" ? (
              <form onSubmit={onCreateBoltz} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--mx-muted)" }}>Invoice BOLT11</span>
                  <input
                    value={invoice}
                    onChange={(e) => { setInvoice(e.target.value); setError(""); }}
                    placeholder="lnbc..."
                    style={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                  />
                </label>

                <p className="panel-hint" style={{ margin: 0 }}>
                  Cole aqui uma invoice no valor que você deseja receber via Lightning.
                  {boltzFees
                    ? (() => {
                        const minDeposit = boltzFees.min_amount_sat + Math.ceil(boltzFees.min_amount_sat * boltzFees.percentage / 100) + boltzFees.miner_fee_sat + boltzFees.our_fee_sat;
                        return ` O mínimo é ${boltzFees.min_amount_sat.toLocaleString("pt-BR")} sats na invoice (você depositará ~${minDeposit.toLocaleString("pt-BR")} sats on-chain incluindo todas as taxas).`;
                      })()
                    : null}
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
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontWeight: "bold", color: invoicePreview.invoiceSats < (boltzFees?.min_amount_sat ?? 0) ? "#f87171" : "inherit" }}>
                      <span>Total a depositar</span>
                      <span>{invoicePreview.total.toLocaleString()} sats ({satsToBtc(invoicePreview.total)} BTC)</span>
                    </div>
                    {invoicePreview.invoiceSats < (boltzFees?.min_amount_sat ?? 0) && (
                      <p style={{ margin: "0.4rem 0 0", color: "#f87171", fontSize: "0.78rem" }}>
                        ⚠ Invoice abaixo do mínimo ({(boltzFees?.min_amount_sat ?? 0).toLocaleString()} sats)
                      </p>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="submit" disabled={creating || !invoice.trim() || (invoicePreview != null && invoicePreview.invoiceSats < (boltzFees?.min_amount_sat ?? 0))}>
                    {creating ? "Criando…" : "Criar swap"}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                <p className="panel-hint" style={{ margin: 0 }}>
                  Escolha produto e valor ou pacote, confirme o e-mail e use <strong>Comprar</strong> para obter aqui um
                  endereço de depósito na nossa rede. O montante pode incluir colchão para taxas da rede e oscilações
                  até criarmos a invoice Bitrefill no momento em que detectarmos o pagamento.
                </p>
                {bitrefillError ? <p className="error">{bitrefillError}</p> : null}

                <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--mx-muted)" }}>País</span>
                  <select
                    value={comprasCountryCode}
                    onChange={(e) => setComprasCountryCode(e.target.value)}
                    disabled={bitrefillLoading || chain === "signet"}
                  >
                    {comprasCountries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--mx-muted)" }}>Categoria</span>
                  <select
                    value={comprasCategorySlug}
                    onChange={(e) => setComprasCategorySlug(e.target.value)}
                    disabled={bitrefillLoading || chain === "signet"}
                  >
                    {comprasCategories.length === 0 ? (
                      <option value="">{(bitrefillLoading && !bitrefillError) ? "Carregando…" : "—"}</option>
                    ) : (
                      comprasCategories.map((c) => (
                        <option key={c.slug || "__all"} value={c.slug}>
                          {c.label}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--mx-muted)" }}>Produto</span>
                  <select
                    value={comprasProductId}
                    onChange={(e) => setComprasProductId(e.target.value)}
                    disabled={bitrefillLoading || chain === "signet"}
                  >
                    <option value="">Selecione…</option>
                    {comprasProducts.map((p) => (
                      <option key={String(p.id)} value={String(p.id)} disabled={!p.in_stock}>
                        {p.name}
                        {!p.in_stock ? " (indisponível)" : ""}
                      </option>
                    ))}
                  </select>
                </label>

                {comprasSelectedProduct && comprasSelectedProduct.packages.length > 0 ? (
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--mx-muted)" }}>Valor / pacote</span>
                    <select
                      value={comprasPackageId}
                      onChange={(e) => setComprasPackageId(e.target.value)}
                      disabled={!comprasProductId}
                    >
                      <option value="">Selecione…</option>
                      {comprasSelectedProduct.packages.map((pk) => (
                        <option key={String(pk.id)} value={String(pk.id)}>
                          {String(pk.value ?? "?")} {comprasSelectedProduct.currency ?? ""}
                          {pk.price != null ? ` · ref. ${pk.price}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : comprasSelectedProduct?.range ? (
                  <p className="panel-hint" style={{ margin: 0 }}>
                    Produto com valor variável (range) — escolha na API Bitrefill com passo definido; fluxo
                    de compra completo vem no próximo backlog.
                  </p>
                ) : null}

                {comprasNeedsPhone ? (
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--mx-muted)" }}>
                      Telefone (E.164, ex. +5511987654321)
                    </span>
                    <input
                      value={comprasPhone}
                      onChange={(e) => setComprasPhone(e.target.value)}
                      placeholder="+55…"
                      autoComplete="tel"
                    />
                  </label>
                ) : null}

                <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--mx-muted)" }}>
                    E-mail (para recibo / entrega quando houver ordem)
                  </span>
                  <input
                    type="email"
                    value={comprasEmail}
                    onChange={(e) => setComprasEmail(e.target.value)}
                    placeholder="voce@exemplo.com"
                    autoComplete="email"
                  />
                </label>

                <div className="client-order-submit">
                  <button
                    type="button"
                    disabled={
                      comprasSubmitting ||
                      creating ||
                      bitrefillLoading ||
                      chain === "signet" ||
                      !comprasProductId ||
                      !comprasEmail.trim() ||
                      (comprasNeedsPhone ? !comprasPhone.trim() : false) ||
                      (comprasSelectedProduct?.range &&
                        (comprasSelectedProduct.packages?.length ?? 0) === 0) ||
                      ((comprasSelectedProduct?.packages?.length ?? 0) > 0 && !comprasPackageId)
                    }
                    onClick={() => void onCreateCompras()}
                  >
                    {comprasSubmitting ? "A gerar…" : "Comprar e obter endereço de depósito"}
                  </button>
                </div>

                {bitrefillLoading ? <p className="panel-hint" style={{ margin: 0 }}>A atualizar catálogo…</p> : null}
              </div>
            )}
          </section>

          <section className="panel panel-rpc">
            <h2>Status técnico (raw)</h2>
            {!orderId && !liveBoltz && mode !== "compras" ? (
              <p className="panel-hint">Crie uma ordem para ver o endereço de depósito.</p>
            ) : mode === "compras" ? (
              <pre className="panel-pre rpc-response-pre">
                {JSON.stringify(
                  {
                    seleção: {
                      país: comprasCountryCode,
                      categoria: comprasCategorySlug,
                      produto_id: comprasProductId || null,
                      pacote_id: comprasPackageId || null,
                      produto: comprasSelectedProduct,
                      email: comprasEmail || null,
                      telefone: comprasNeedsPhone ? comprasPhone || null : undefined,
                    },
                    catálogo_carregado: comprasProducts.length,
                    ordem_loja: orderId
                      ? {
                          order_id: orderId,
                          provider: order?.provider ?? created?.provider ?? null,
                          status: order?.status ?? created?.status ?? null,
                        }
                      : null,
                  },
                  null,
                  2,
                )}
              </pre>
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

              {/* Indicador de etapas */}
              {boltzStatus !== "error" && (
                <div style={{ display: "flex", gap: "0.2rem", margin: "0.5rem 0 0.9rem", fontSize: "0.68rem" }}>
                  {BOLTZ_STEPS.map((s, i) => (
                    <div
                      key={s.key}
                      style={{
                        flex: 1,
                        padding: "0.3rem 0.1rem",
                        textAlign: "center",
                        borderRadius: "4px",
                        background:
                          i < boltzStepIndex
                            ? "rgba(0,255,70,0.12)"
                            : i === boltzStepIndex
                            ? "rgba(0,255,70,0.28)"
                            : "rgba(255,255,255,0.04)",
                        color: i <= boltzStepIndex ? "var(--mx-green, #00ff46)" : "var(--mx-muted)",
                        border:
                          i === boltzStepIndex
                            ? "1px solid rgba(0,255,70,0.5)"
                            : "1px solid transparent",
                        lineHeight: 1.3,
                      }}
                    >
                      {i < boltzStepIndex ? "✓ " : i === boltzStepIndex ? "▶ " : ""}
                      {s.label}
                    </div>
                  ))}
                </div>
              )}

              {/* Endereço de depósito — mostrar enquanto aguardando */}
              {clientDepositAddress && boltzStatus !== "paid_out" && boltzStatus !== "error" && (
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
                    >
                      ⧉
                    </button>
                  </div>
                  <div style={{ margin: "0.75rem 0" }}>
                    <AddressQRCode value={clientDepositAddress} size={160} />
                  </div>
                  <div className="client-inline-copy">
                    <p>
                      Em{" "}
                      <span className="client-highlight-address">{clientDepositAddress}</span>
                    </p>
                    <button
                      type="button"
                      className="copy-icon-button"
                      aria-label="Copiar endereço de depósito"
                      onClick={() => navigator.clipboard.writeText(clientDepositAddress)}
                    >
                      ⧉
                    </button>
                  </div>
                  <p className="panel-hint">
                    <a href={mempoolAddress(clientDepositAddress)} target="_blank" rel="noreferrer">
                      Ver endereço de depósito no mempool ↗
                    </a>
                  </p>
                </>
              )}

              {/* Tx do cliente → nossa wallet (aparece após depósito detectado) */}
              {boltzDepositTxId && (
                <p className="panel-hint">
                  <a href={mempoolTx(boltzDepositTxId)} target="_blank" rel="noreferrer">
                    Ver depósito do cliente no mempool ↗
                  </a>
                </p>
              )}

              {/* Tx de encaminhamento nossa → lockup Boltz */}
              {boltzLockupTxId && (
                <p className="panel-hint">
                  <a href={mempoolTx(boltzLockupTxId)} target="_blank" rel="noreferrer">
                    Ver encaminhamento para Boltz no mempool ↗
                  </a>
                </p>
              )}

              {boltzStatus === "paid_out" ? (
                <div className="client-success-box">
                  <p className="client-success-title">Invoice paga com sucesso ⚡</p>
                  {boltzLockupTxId && (
                    <p className="panel-hint">
                      <a href={mempoolTx(boltzLockupTxId)} target="_blank" rel="noreferrer">
                        Ver encaminhamento para Boltz no mempool ↗
                      </a>
                    </p>
                  )}
                  {boltzDepositTxId && (
                    <p className="panel-hint">
                      <a href={mempoolTx(boltzDepositTxId)} target="_blank" rel="noreferrer">
                        Ver depósito do cliente no mempool ↗
                      </a>
                    </p>
                  )}
                  {boltzPreimage && (
                    <>
                      <p style={{ fontSize: "0.75rem", margin: "0.5rem 0 0.2rem", color: "var(--mx-muted)" }}>
                        Prova de pagamento (preimage):
                      </p>
                      <div className="client-inline-copy" style={{ alignItems: "flex-start" }}>
                        <code style={{ fontSize: "0.67rem", wordBreak: "break-all", flex: 1 }}>
                          {boltzPreimage}
                        </code>
                        <button
                          type="button"
                          className="copy-icon-button"
                          aria-label="Copiar preimage"
                          onClick={() => navigator.clipboard.writeText(boltzPreimage)}
                        >
                          ⧉
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : boltzStatus === "error" ? (
                <p className="error">
                  Swap falhou. Verifique no Boltz Exchange ou entre em contato.
                </p>
              ) : null}
            </div>
          ) : liveOrder ? (
            <div className="client-order-card-content">
              <p>
                {isBitrefillOrder ? (
                  <>
                    Compra Bitrefill <strong>#{liveOrder.order_id}</strong>
                  </>
                ) : (
                  <>
                    Ordem número <strong>{liveOrder.order_id}</strong>
                  </>
                )}
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
              {isBitrefillOrder ? (
                <p className="panel-hint">
                  Depósito único em BTC: inclui produto Bitrefill, rede e margem de cotação. Quando detectarmos pagamento,
                  criamos a invoice crypto na Bitrefill e enviamos o montante exigido pelo fornecedor; seguimento pelo
                  e-mail indicado na compra.
                </p>
              ) : (
                <p className="panel-hint">
                  Você receberá <span className="client-highlight-value">{outputBtc} BTC</span> em{" "}
                  <span className="client-highlight-address">{destinationDisplay}</span> e pagará{" "}
                  <span className="client-highlight-value">{feeBtc} BTC</span> de taxas.
                </p>
              )}
              {showTrackingLinks ? (
                <div className="client-success-box">
                  <p className="client-success-title">
                    {isBitrefillOrder
                      ? isConfirming
                        ? "Aguardando confirmação do envio à Bitrefill"
                        : "Envio à Bitrefill confirmado na rede"
                      : isConfirming
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
