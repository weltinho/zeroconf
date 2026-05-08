import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiUrl } from "../api/url";
import { AppLogo } from "../components/AppLogo";
import AddressQRCode from "../components/AddressQRCode";
import { getUiText } from "../i18n";
import { Combobox, type ComboboxOption, getCountryFlag, getCategoryIcon } from "../components/Combobox";
import { ProgressSteps } from "../components/ProgressSteps";
import { DropdownMenu } from "../components/DropdownMenu";
import { USE_MOCKS, MOCK_COUNTRIES, MOCK_CATEGORIES, getMockProducts } from "../mocks/catalogMocks";
import { USE_ORDER_MOCKS, useMockOrders } from "../mocks/orderMocks";

type CreateOrderResponse = {
  order_id: number;
  status: string;
  deposit_btc_address: string;
  required_deposit_sats: number;
  output_sats: number;
  fee_rate_sat_vb: number;
  provider?: string;
  bitrefill_gift_card_line?: string | null;
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
  bitrefill_gift_card_line?: string | null;
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
  admin_contact_email?: string;
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
const FORCED_DIRECT_PAYOUT_FAIL_ADDRESS = "tb1q06vfhkjd8d3dhh0f63mxgz4sksvx8za9rj7lvr";
const SIGNET_FORCE_FAIL_BOLTZ_INVOICE =
  "lntb10u1pforcedfailpp5qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqdqqxqyjw5q9qtz";

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

function humanizeOrderIssue(raw: string | null | undefined): string | null {
  const msg = String(raw || "").trim();
  if (!msg) return null;
  const low = msg.toLowerCase();
  if (low.includes("invoice bitrefill")) {
    return "Falha ao gerar pedido com a contraparte. Verifique os dados informados e tente novamente.";
  }
  if (low.includes("payout failed") || low.includes("sendrawtransaction")) {
    return "Falha ao enviar a transação de destino.";
  }
  if (low.includes("underpaid") || low.includes("insufficient deposit")) {
    return "Depósito detectado, mas o valor ainda está abaixo do necessário para concluir.";
  }
  return msg;
}

const BOLTZ_STEPS: { key: string; label: string }[] = [
  { key: "awaiting_deposit", label: "Aguardando depósito" },
  { key: "deposit_detected", label: "Depósito detectado" },
  { key: "provider_processing", label: "Processando Lightning" },
  { key: "provider_claim_pending", label: "Claim pendente na Boltz" },
  { key: "paid_out", label: "Invoice paga" },
];

/** Estados simulados em Signet (Compras) — alinhados aos que o backend usa na ordem. */
const BITREFILL_STEPS: { key: string; label: string }[] = [
  { key: "awaiting_deposit", label: "Aguardando depósito" },
  { key: "deposit_detected", label: "Depósito detectado" },
  { key: "provider_processing", label: "Invoice Bitrefill / payout" },
  { key: "confirming", label: "Confirmando na rede" },
  { key: "paid_out", label: "Concluído" },
];

/** Intervalo entre estados mock no servidor após depósito (8s; ver SIGNET_DEMO_PROGRESS_STEP_SEC). */
const SIGNET_SIM_STEP_MS = 8000;

export function ClientAreaPage() {
  const params = useParams<{ orderId?: string }>();
  const navigate = useNavigate();
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
  const [adminContactEmail, setAdminContactEmail] = useState("admin@site.com");

  const [boltzCreated, setBoltzCreated] = useState<CreateBoltzOrderResponse | null>(null);
  const [boltzOrder, setBoltzOrder] = useState<GetBoltzOrderResponse | null>(null);
  const [boltzFees, setBoltzFees] = useState<BoltzFees | null>(null);

  // Mock orders hook - simula progressão de estados sem backend
  const {
    bitrefillOrder: mockBitrefillOrder,
    boltzOrder: mockBoltzOrder,
    createBitrefillOrder: createMockBitrefillOrder,
    createBoltzOrder: createMockBoltzOrder,
    reset: resetMockOrders,
  } = useMockOrders();

  const [comprasCategorySlug, setComprasCategorySlug] = useState("");
  const [comprasCountryCode, setComprasCountryCode] = useState("BR");
const [comprasCountries, setComprasCountries] = useState<CatalogCountryOpt[]>(
  USE_MOCKS ? MOCK_COUNTRIES : [{ code: "BR", name: "Brasil" }]
);
const [comprasCategories, setComprasCategories] = useState<CatalogCategoryOpt[]>(
  USE_MOCKS ? MOCK_CATEGORIES : []
);
const [comprasProducts, setComprasProducts] = useState<CatalogProduct[]>(
  USE_MOCKS ? getMockProducts("", "BR") : []
);
  const [comprasProductId, setComprasProductId] = useState("");
  const [comprasPackageId, setComprasPackageId] = useState("");
  const [comprasEmail, setComprasEmail] = useState("");
  const [comprasPhone, setComprasPhone] = useState("");
  const [bitrefillLoading, setBitrefillLoading] = useState(false);
  const [bitrefillError, setBitrefillError] = useState<string | null>(null);
  const [comprasSubmitting, setComprasSubmitting] = useState(false);

  const pollTimerRef = useRef<number | null>(null);
  const initialOrderLoadedRef = useRef(false);
  const pollCounterRef = useRef<Record<number, number>>({});

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
        const nextCount = (pollCounterRef.current[orderId] || 0) + 1;
        pollCounterRef.current[orderId] = nextCount;
        const useRecovery = nextCount % 10 === 0;
        const path = useRecovery
          ? `/client/orders/${orderId}?recovery=true`
          : `/client/orders/${orderId}`;
        const r = await fetch(apiUrl(path));
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
        const contact = String(body.admin_contact_email || "").trim();
        if (contact) {
          setAdminContactEmail(contact);
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
    if (mode !== "compras") return;
    setComprasProductId("");
    setComprasPackageId("");
    setBitrefillError(null);
  }, [comprasCategorySlug, comprasCountryCode, mode, chain]);

  useEffect(() => {
    if (mode !== "compras") return;
    
    // Use mocks when enabled (for development without backend)
    if (USE_MOCKS) {
      setBitrefillLoading(true);
      // Simulate a small delay for realism
      const timeout = setTimeout(() => {
        setComprasCountries(MOCK_COUNTRIES);
        setComprasCategories(MOCK_CATEGORIES);
        setComprasProducts(getMockProducts(comprasCategorySlug, comprasCountryCode));
        setBitrefillLoading(false);
      }, 300);
      return () => clearTimeout(timeout);
    }

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

  const resetToNewOrder = useCallback(() => {
    stopPolling();
    setError("");
    setCreated(null);
    setOrder(null);
    setDepositTxid(null);
    setBoltzCreated(null);
    setBoltzOrder(null);
    setInvoice("");
    pollCounterRef.current = {};
    initialOrderLoadedRef.current = false;
    setMode("onchain");
    // Reset mock orders também
    if (USE_ORDER_MOCKS) {
      resetMockOrders();
    }
    void navigate("/cliente", { replace: true });
  }, [navigate, stopPolling, resetMockOrders]);

  async function onCreateBoltz(e: FormEvent) {
    e.preventDefault();
    stopPolling();
    setError("");
    setBoltzCreated(null);
    setBoltzOrder(null);
    setCreating(true);
    
    // Usa mock quando ativado
    if (USE_ORDER_MOCKS) {
      createMockBoltzOrder(invoice.trim());
      setCreating(false);
      return;
    }
    
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
      const created = resp as CreateBoltzOrderResponse;
      setBoltzCreated(created);
      const oid = created.order_id;
      void pollBoltzOrder(oid);
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
      pollCounterRef.current[resp.order_id] = 0;
      void pollOrder(resp.order_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar ordem");
    } finally {
      setCreating(false);
    }
  }

  async function onCreateCompras() {
    stopPolling();
    setError("");
    setBoltzCreated(null);
    setBoltzOrder(null);
    setComprasSubmitting(true);
    
    // Usa mock quando ativado
    if (USE_ORDER_MOCKS) {
      const productName = comprasSelectedProduct?.name || "Produto";
      const packageValue = comprasSelectedPackage?.value?.toString() || "100";
      createMockBitrefillOrder(productName, packageValue);
      setComprasSubmitting(false);
      return;
    }
    
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
      pollCounterRef.current[resp.order_id] = 0;
      void pollOrder(resp.order_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar compra Bitrefill");
    } finally {
      setComprasSubmitting(false);
    }
  }

  const orderId = created?.order_id ?? order?.order_id ?? null;
  
  // Usa mocks quando ativados, senão usa dados reais
  const liveOrder = USE_ORDER_MOCKS && mockBitrefillOrder 
    ? mockBitrefillOrder as unknown as (GetOrderResponse | CreateOrderResponse)
    : (order ?? created);
  const liveBoltz = USE_ORDER_MOCKS && mockBoltzOrder
    ? mockBoltzOrder as unknown as (GetBoltzOrderResponse | CreateBoltzOrderResponse)
    : (boltzOrder ?? boltzCreated);
  
  const activeOrderId = orderId ?? liveBoltz?.order_id ?? (USE_ORDER_MOCKS ? (mockBitrefillOrder?.order_id ?? mockBoltzOrder?.order_id ?? null) : null);
  const formLocked = activeOrderId !== null;
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
    (order?.provider ?? created?.provider) === "bitrefill" || (USE_ORDER_MOCKS && mockBitrefillOrder !== null);
  const orderAwaitingUserDeposit =
    liveOrder &&
    (liveOrder.status === "awaiting_deposit" || liveOrder.status === "created");
  const orderDepositSeenByBackend =
    liveOrder &&
    !orderAwaitingUserDeposit &&
    liveOrder.status !== "error";

  // Usa status do mock quando disponível
  const boltzStatus = USE_ORDER_MOCKS && mockBoltzOrder 
    ? mockBoltzOrder.status 
    : (boltzOrder?.status ?? boltzCreated?.status ?? null);
  const boltzSwapId = liveBoltz?.boltz_swap_id ?? null;
  const clientDepositAddress =
    (USE_ORDER_MOCKS && mockBoltzOrder?.deposit_btc_address) ||
    (boltzCreated?.deposit_btc_address ??
    boltzOrder?.deposit_btc_address ??
    boltzOrder?.our_deposit_address ??
    null);
  const boltzExpectedSat = (USE_ORDER_MOCKS && mockBoltzOrder?.required_deposit_sats) || (boltzOrder?.required_deposit_sats ?? boltzCreated?.expected_onchain_amount_sat ?? null);
  const boltzExpectedBtc = boltzExpectedSat != null ? satsToBtc(boltzExpectedSat) : null;
  // Usa txIds do mock quando disponíveis
  const boltzLockupTxId = (USE_ORDER_MOCKS && mockBoltzOrder?.lockup_tx_id) || (boltzOrder?.lockup_tx_id ?? boltzCreated?.lockup_tx_id ?? null);
  const boltzDepositTxId = (USE_ORDER_MOCKS && mockBoltzOrder?.deposit_tx_id) || (boltzOrder?.deposit_tx_id ?? null);  // tx do cliente → nossa wallet
  const boltzPreimage = (USE_ORDER_MOCKS && mockBoltzOrder?.preimage) || (boltzOrder?.preimage ?? null);
  const boltzAwaitingUserDeposit = boltzStatus === "awaiting_deposit";
  const boltzClaimPending =
    boltzStatus === "provider_claim_pending" ||
    boltzOrder?.status_raw === "transaction.claim.pending";
  const boltzStepIndex = BOLTZ_STEPS.findIndex((s) => s.key === boltzStatus);
  const bitrefillStepIndex = BITREFILL_STEPS.findIndex(
    (s) => s.key === String(order?.status ?? created?.status ?? ""),
  );

  // Progress steps for tracking
  const progressSteps = useMemo(() => {
    if (liveBoltz) {
      return BOLTZ_STEPS.map((s) => ({ key: s.key, label: s.label }));
    }
    if (isBitrefillOrder) {
      return BITREFILL_STEPS.map((s) => ({ key: s.key, label: s.label }));
    }
    return [
      { key: "awaiting_deposit", label: "Aguardando depósito" },
      { key: "deposit_detected", label: "Depósito detectado" },
      { key: "confirming", label: "Confirmando" },
      { key: "paid_out", label: "Concluído" },
    ];
  }, [liveBoltz, isBitrefillOrder]);

  const currentStepKey = useMemo(() => {
    if (liveBoltz) return boltzStatus || "awaiting_deposit";
    if (liveOrder) return liveOrder.status || "awaiting_deposit";
    return "awaiting_deposit";
  }, [liveBoltz, liveOrder, boltzStatus]);

  const isOrderError = liveOrder?.status === "error" || boltzStatus === "error";

  // Preview ao vivo — extrai sats da invoice BOLT11.
  const invoiceSats = useMemo(() => parseBolt11Sats(invoice), [invoice]);
  const invoicePreview = useMemo(() => {
    if (!invoiceSats) return null;
    if (boltzFees) {
      const percentFee = Math.ceil((invoiceSats * boltzFees.percentage) / 100);
      const total = invoiceSats + percentFee + boltzFees.miner_fee_sat + boltzFees.our_fee_sat;
      return {
        invoiceSats,
        percentFee,
        minerFee: boltzFees.miner_fee_sat,
        ourFee: boltzFees.our_fee_sat,
        total,
      };
    }
    if (chain === "signet") {
      const minerFee = 200;
      const ourFee = 1000;
      const pct = 1;
      const percentFee = Math.ceil((invoiceSats * pct) / 100);
      const total = invoiceSats + percentFee + minerFee + ourFee;
      return { invoiceSats, percentFee, minerFee, ourFee, total };
    }
    return null;
  }, [invoiceSats, boltzFees, chain]);
  const isConfirming = order?.status === "confirming";
  const isPaidOut = order?.status === "paid_out";
  const showTrackingLinks = isConfirming || isPaidOut;
  const payoutTxid = order?.payout_txid ?? null;
  const orderIssueMessage = humanizeOrderIssue(order?.last_rpc_status);
  const orderFailedMessage =
    liveOrder?.status === "error"
      ? `Seu depósito falhou, contate o administrador ${adminContactEmail}.`
      : null;
  const boltzFailedMessage =
    boltzStatus === "error"
      ? `Seu depósito falhou, contate o administrador ${adminContactEmail}.`
      : null;
  const mempoolBase = chain === "main" ? "https://mempool.space" : `https://mempool.space/${chain}`;
  const mempoolTx = (txid: string) => `${mempoolBase}/tx/${txid}`;
  const mempoolAddress = (address: string) => `${mempoolBase}/address/${address}`;

  useEffect(() => {
    const provider = String(order?.provider ?? "").trim().toLowerCase();
    if (!provider) return;
    if (provider === "boltz") {
      setMode("lightning");
      return;
    }
    if (provider === "bitrefill") {
      setMode("compras");
      return;
    }
    setMode("onchain");
  }, [order?.provider]);

  useEffect(() => {
    if (!order) return;
    const provider = String(order.provider || "").trim().toLowerCase();
    if (!provider || provider === "internal") {
      setUnit("sats");
      setAmount(String(order.output_sats || ""));
      setDestination(String(order.destination_btc_address || ""));
      return;
    }
    if (provider === "bitrefill") {
      setComprasEmail("");
    }
  }, [order]);

  useEffect(() => {
    if (!order?.order_id) return;
    if (String(order.provider || "").trim().toLowerCase() !== "boltz") return;
    if (boltzOrder?.order_id === order.order_id) return;
    void pollBoltzOrder(order.order_id);
  }, [order?.order_id, order?.provider, boltzOrder?.order_id, pollBoltzOrder]);

  function onToggleUnit(next: "btc" | "sats") {
    if (next === unit) {
      return;
    }
    setAmount((prev) => convertAmountUnit(prev, unit, next));
    setUnit(next);
  }

  // Helper to build combobox options
  const countryOptions: ComboboxOption[] = useMemo(
    () =>
      comprasCountries.map((c) => ({
        value: c.code,
        label: c.name,
        icon: <span style={{ fontSize: "1.25rem" }}>{getCountryFlag(c.code)}</span>,
      })),
    [comprasCountries]
  );

  const categoryOptions: ComboboxOption[] = useMemo(
    () =>
      comprasCategories.map((c) => ({
        value: c.slug,
        label: c.label,
        icon: getCategoryIcon(c.slug),
      })),
    [comprasCategories]
  );

  const productOptions: ComboboxOption[] = useMemo(
    () =>
      comprasProducts.map((p) => ({
        value: String(p.id),
        label: p.name || "Produto",
        description: p.in_stock ? undefined : "Indisponível",
        disabled: !p.in_stock,
      })),
    [comprasProducts]
  );

  const packageOptions: ComboboxOption[] = useMemo(
    () =>
      (comprasSelectedProduct?.packages || []).map((pk) => ({
        value: String(pk.id),
        label: `${pk.value ?? "?"} ${comprasSelectedProduct?.currency ?? ""}`,
        description: pk.price != null ? `ref. ${pk.price}` : undefined,
      })),
    [comprasSelectedProduct]
  );

  return (
    <main className="layout">
      {/* Compact Header */}
      <header className="client-page-header">
        <div className="client-page-header-main">
          <Link to="/" style={{ display: "inline-block", marginBottom: "0.5rem" }}>
            <AppLogo className="hero-logo" variant="matrix" aria-label={t.logoAriaLabel} style={{ height: "32px" }} />
          </Link>
          <p className="client-page-subtitle" style={{ margin: 0 }}>
            Roteamento seguro de liquidez 1:1
          </p>
          <div className="badges" style={{ marginTop: "0.5rem" }}>
            <span className="badge">REDE: {chain.toUpperCase()}</span>
            {chain === "signet" && (
              <span
                className="badge"
                style={{
                  borderColor: "rgba(163, 230, 53, 0.45)",
                  background: "rgba(163, 230, 53, 0.12)",
                  color: "var(--warning, #eab308)",
                }}
              >
                Simulação
              </span>
            )}
          </div>
        </div>
        <div className="client-page-actions">
          {formLocked && (
            <DropdownMenu
              items={[
                {
                  label: "Nova operação",
                  onClick: resetToNewOrder,
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  ),
                },
              ]}
            />
          )}
        </div>
      </header>

      <div className="workspace client-hml-workspace">
        <div className="client-hml-left">
          <section className="panel panel-rpc client-create-order-panel">
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
                disabled={formLocked}
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
                disabled={formLocked}
                onClick={() => {
                  setMode("lightning");
                  setError("");
                }}
              >
                Swap ⚡ Lightning
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "compras"}
                className={mode === "compras" ? "is-active" : ""}
                disabled={formLocked}
                onClick={() => {
                  setMode("compras");
                  setError("");
                }}
              >
                Compras
              </button>
            </div>

            {chain === "signet" && (mode === "lightning" || mode === "compras") ? (
              <p
                className="panel-hint"
                style={{
                  marginTop: "-0.25rem",
                  marginBottom: "0.75rem",
                  color: "var(--color-warning, #a3e635)",
                }}
              >
                <strong>Node está em signet, portanto isso é uma simulação.</strong> O endereço na tela é o de
                depósito da ordem (como em mainnet): envia tu a transação on-chain para esse endereço. Quando o
                nó (ZMQ) deteta o receive na carteira operador, o backend avança a BD em modo mock (~
                {Math.round(SIGNET_SIM_STEP_MS / 100) / 10}s entre estados). Para QA manual:{" "}
                <code style={{ fontSize: "0.75em" }}>?demo_state=…</code> nos GETs. Swap:{" "}
                <code style={{ fontSize: "0.75em" }}>POST /client/boltz/orders</code> sem Boltz; Compras:{" "}
                <code style={{ fontSize: "0.75em" }}>POST /client/bitrefill/orders</code> com API Bitrefill se
                configurada.
              </p>
            ) : null}

            {error ? <p className="error">{error}</p> : null}
            {formLocked ? (
              <p className="panel-hint" style={{ margin: "0 0 0.5rem", padding: "0.5rem 0.75rem", background: "var(--accent-subtle)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-accent)" }}>
                Ordem <strong>#{activeOrderId}</strong> em andamento. Use o menu no canto superior direito para iniciar nova operação.
              </p>
            ) : null}

            {mode === "onchain" ? (
              <form onSubmit={onCreate} className="row client-order-form">
                <label className="client-order-field">
                  <span>Valor</span>
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} disabled={formLocked} />
                </label>

                <label className="client-order-field client-order-field-unit">
                  <span>Unidade</span>
                  <div className="btc-sats-toggle" role="tablist" aria-label="Unidade de valor">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={unit === "btc"}
                      className={unit === "btc" ? "is-active" : ""}
                      disabled={formLocked}
                      onClick={() => onToggleUnit("btc")}
                    >
                      BTC
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={unit === "sats"}
                      className={unit === "sats" ? "is-active" : ""}
                      disabled={formLocked}
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
                    disabled={formLocked}
                  />
                </label>
                {chain === "signet" ? (
                  <p
                    className="panel-hint"
                    style={{
                      margin: "0.15rem 0 0.35rem",
                      color: "var(--color-warning, #fbbf24)",
                      gridColumn: "1 / -1",
                    }}
                  >
                    <strong>Atenção:</strong> endereço{" "}
                    <code style={{ fontSize: "0.75em" }}>{FORCED_DIRECT_PAYOUT_FAIL_ADDRESS}</code> sempre irá falhar
                    (cenário de teste hardcoded).
                  </p>
                ) : null}

                <div className="client-order-submit">
                  <button type="submit" disabled={creating || formLocked}>
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
                    disabled={formLocked}
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
                {chain === "signet" ? (
                  <p className="panel-hint" style={{ margin: 0, color: "var(--color-warning, #fbbf24)" }}>
                    <strong>QA falha forçada:</strong> se usar a invoice{" "}
                    <code style={{ fontSize: "0.75em" }}>{SIGNET_FORCE_FAIL_BOLTZ_INVOICE}</code>, esta troca sempre
                    terminará em erro simulado.
                  </p>
                ) : null}

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
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "1rem",
                        fontWeight: "bold",
                        color:
                          chain !== "signet" && invoicePreview.invoiceSats < (boltzFees?.min_amount_sat ?? 0)
                            ? "#f87171"
                            : "inherit",
                      }}
                    >
                      <span>Total a depositar</span>
                      <span>{invoicePreview.total.toLocaleString()} sats ({satsToBtc(invoicePreview.total)} BTC)</span>
                    </div>
                    {chain !== "signet" && invoicePreview.invoiceSats < (boltzFees?.min_amount_sat ?? 0) && (
                      <p style={{ margin: "0.4rem 0 0", color: "#f87171", fontSize: "0.78rem" }}>
                        ⚠ Invoice abaixo do mínimo ({(boltzFees?.min_amount_sat ?? 0).toLocaleString()} sats)
                      </p>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="submit"
                    disabled={
                      creating ||
                      formLocked ||
                      !invoice.trim() ||
                      (chain !== "signet" &&
                        invoicePreview != null &&
                        invoicePreview.invoiceSats < (boltzFees?.min_amount_sat ?? 0))
                    }
                  >
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
                {chain === "signet" ? (
                  <p className="panel-hint" style={{ margin: 0, color: "var(--color-warning, #fbbf24)" }}>
                    <strong>QA falha forçada:</strong> compras da categoria <code>Jogos</code> em signet sempre
                    terminarão em erro simulado.
                  </p>
                ) : null}

                <div className="client-form-field">
                  <span className="client-form-field-label">País</span>
                  <Combobox
                    options={countryOptions}
                    value={comprasCountryCode}
                    onChange={setComprasCountryCode}
                    placeholder="Selecione o país"
                    searchPlaceholder="Buscar país..."
                    disabled={bitrefillLoading || formLocked}
                    loading={bitrefillLoading}
                  />
                </div>

                <div className="client-form-field">
                  <span className="client-form-field-label">Categoria</span>
                  <Combobox
                    options={categoryOptions}
                    value={comprasCategorySlug}
                    onChange={setComprasCategorySlug}
                    placeholder={bitrefillLoading ? "Carregando..." : "Todas as categorias"}
                    searchPlaceholder="Buscar categoria..."
                    disabled={bitrefillLoading || formLocked}
                    loading={bitrefillLoading}
                  />
                </div>

                <div className="client-form-field">
                  <span className="client-form-field-label">Produto</span>
                  <Combobox
                    options={productOptions}
                    value={comprasProductId}
                    onChange={setComprasProductId}
                    placeholder="Selecione um produto"
                    searchPlaceholder="Buscar produto..."
                    disabled={bitrefillLoading || formLocked}
                    emptyMessage="Nenhum produto encontrado"
                  />
                </div>

                {comprasSelectedProduct && comprasSelectedProduct.packages.length > 0 ? (
                  <div className="client-form-field">
                    <span className="client-form-field-label">Valor / pacote</span>
                    <Combobox
                      options={packageOptions}
                      value={comprasPackageId}
                      onChange={setComprasPackageId}
                      placeholder="Selecione o valor"
                      searchPlaceholder="Buscar valor..."
                      disabled={!comprasProductId || formLocked}
                    />
                  </div>
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
                      disabled={formLocked}
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
                    disabled={formLocked}
                  />
                </label>

                <div className="client-order-submit">
                  <button
                    type="button"
                    disabled={
                      comprasSubmitting ||
                      creating ||
                      formLocked ||
                      bitrefillLoading ||
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

              {/* Progress Steps Visual */}
              <div style={{ margin: "1rem 0" }}>
                <ProgressSteps
                  steps={BOLTZ_STEPS.map((s) => ({ key: s.key, label: s.label }))}
                  currentStepKey={boltzStatus || "awaiting_deposit"}
                  isError={boltzStatus === "error"}
                />
              </div>

              {/* Informações de depósito — sempre visíveis para validação */}
              {clientDepositAddress && boltzStatus !== "error" && (
                <div className="client-deposit-info" style={{ 
                  margin: "1rem 0",
                  padding: "1rem",
                  background: "var(--background-elevated)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)"
                }}>
                  <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                    {/* QR Code */}
                    <div style={{ flexShrink: 0 }}>
                      <AddressQRCode value={clientDepositAddress} size={120} />
                    </div>
                    
                    {/* Detalhes */}
                    <div style={{ flex: 1, minWidth: "200px" }}>
                      {/* Valor */}
                      <div style={{ marginBottom: "0.75rem" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>
                          {boltzAwaitingUserDeposit ? "Valor a depositar" : "Valor depositado"}
                        </span>
                        <div className="client-inline-copy" style={{ margin: 0 }}>
                          <span style={{ 
                            fontSize: "1.125rem", 
                            fontWeight: 700, 
                            color: "var(--bitcoin)",
                            fontFamily: "'JetBrains Mono', monospace"
                          }}>
                            {boltzExpectedBtc} BTC
                          </span>
                          <button
                            type="button"
                            className="copy-icon-button"
                            aria-label="Copiar valor"
                            onClick={() => navigator.clipboard.writeText(boltzExpectedBtc ?? "")}
                          >
                            ⧉
                          </button>
                        </div>
                      </div>
                      
                      {/* Endereço */}
                      <div>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>
                          Endereço de depósito
                        </span>
                        <div className="client-inline-copy" style={{ margin: 0 }}>
                          <code style={{ 
                            fontSize: "0.6875rem", 
                            wordBreak: "break-all",
                            color: "var(--text-secondary)",
                            flex: 1
                          }}>
                            {clientDepositAddress}
                          </code>
                          <button
                            type="button"
                            className="copy-icon-button"
                            aria-label="Copiar endereço"
                            onClick={() => navigator.clipboard.writeText(clientDepositAddress)}
                          >
                            ⧉
                          </button>
                        </div>
                        <a 
                          href={mempoolAddress(clientDepositAddress)} 
                          target="_blank" 
                          rel="noreferrer"
                          style={{ fontSize: "0.75rem", color: "var(--accent)", marginTop: "0.25rem", display: "inline-block" }}
                        >
                          Ver no mempool
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Seção de transações - sempre visível quando há txs */}
              {(boltzDepositTxId || boltzLockupTxId) && (
                <div style={{ 
                  margin: "0.75rem 0",
                  padding: "0.75rem",
                  background: "var(--background)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)"
                }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.5rem" }}>
                    Transacoes
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                    {boltzDepositTxId && (
                      <a 
                        href={mempoolTx(boltzDepositTxId)} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ 
                          fontSize: "0.8125rem", 
                          color: "var(--accent)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.375rem"
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                        </svg>
                        Deposito do cliente
                      </a>
                    )}
                    {boltzLockupTxId && (
                      <a 
                        href={mempoolTx(boltzLockupTxId)} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ 
                          fontSize: "0.8125rem", 
                          color: "var(--accent)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.375rem"
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                        </svg>
                        Encaminhamento para Boltz
                      </a>
                    )}
                  </div>
                </div>
              )}

              <p className="panel-hint" style={{ fontSize: "0.75rem" }}>
                Status Boltz: <code>{boltzOrder?.status_raw ?? "—"}</code>
              </p>

              {boltzClaimPending && (
                <p className="panel-hint">
                  Invoice já foi paga. A Boltz está em <code>transaction.claim.pending</code>, aguardando
                  assinatura cooperativa (key-path) ou claim via script-path. O status final de sucesso é{" "}
                  <code>transaction.claimed</code>.
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
                <div className="client-success-box">
                  <p className="error" style={{ marginBottom: "0.3rem" }}>
                    {boltzFailedMessage}
                  </p>
                  <p className="panel-hint" style={{ margin: 0 }}>
                    <a href={`mailto:${adminContactEmail}`}>mailto:{adminContactEmail}</a>
                  </p>
                </div>
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
              {/* Progress Steps Visual */}
              <div style={{ margin: "1rem 0" }}>
                <ProgressSteps
                  steps={isBitrefillOrder 
                    ? BITREFILL_STEPS.map((s) => ({ key: s.key, label: s.label }))
                    : [
                        { key: "awaiting_deposit", label: "Aguardando depósito" },
                        { key: "deposit_detected", label: "Depósito detectado" },
                        { key: "confirming", label: "Confirmando" },
                        { key: "paid_out", label: "Concluído" },
                      ]
                  }
                  currentStepKey={liveOrder.status || "awaiting_deposit"}
                  isError={liveOrder.status === "error"}
                />
              </div>
              <div className="client-inline-copy">
                <p>
                  {orderDepositSeenByBackend ? (
                    <>
                      <strong>Depósito detectado</strong> — já registámos o teu envio na carteira. Montante de
                      referência: <span className="client-highlight-value">{requiredBtc} BTC</span>
                    </>
                  ) : (
                    <>
                      Deposite <span className="client-highlight-value">{requiredBtc} BTC</span>
                    </>
                  )}
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
                  {orderDepositSeenByBackend ? (
                    <>
                      Endereço (o mesmo que usaste):{" "}
                      <span className="client-highlight-address">{liveOrder.deposit_btc_address}</span>
                    </>
                  ) : (
                    <>
                      Em <span className="client-highlight-address">{liveOrder.deposit_btc_address}</span>
                    </>
                  )}
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
              {isBitrefillOrder && liveOrder.bitrefill_gift_card_line ? (
                <div className="client-success-box" style={{ marginBottom: "0.75rem" }}>
                  <p className="client-success-title">Gift card</p>
                  <div className="client-inline-copy" style={{ alignItems: "flex-start" }}>
                    <p style={{ margin: 0, whiteSpace: "pre-line", flex: 1, fontSize: "0.85rem", lineHeight: 1.45 }}>
                      {liveOrder.bitrefill_gift_card_line}
                    </p>
                    <button
                      type="button"
                      className="copy-icon-button"
                      aria-label="Copiar dados do gift card"
                      title="Copiar"
                      onClick={() => navigator.clipboard.writeText(liveOrder.bitrefill_gift_card_line ?? "")}
                    >
                      ⧉
                    </button>
                  </div>
                </div>
              ) : null}
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
              {orderDepositSeenByBackend && !showTrackingLinks ? (
                <div className="client-success-box" style={{ marginTop: "0.15rem" }}>
                  <p className="client-success-title">
                    {orderIssueMessage
                      ? "Depósito detectado. Houve falha na etapa seguinte."
                      : "Depósito detectado. Iniciando negociação com a contraparte."}
                  </p>
                  {orderIssueMessage ? (
                    <>
                      <p className="error" style={{ margin: 0 }}>{orderIssueMessage}</p>
                      {order?.last_rpc_status ? (
                        <p className="panel-hint" style={{ margin: 0 }}>
                          Detalhe técnico: {order.last_rpc_status}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="panel-hint" style={{ margin: 0 }}>
                      Aguarde enquanto tentamos gerar o pedido e enviar a transação de destino.
                    </p>
                  )}
                </div>
              ) : null}
              {liveOrder.status === "error" ? (
                <div className="client-success-box" style={{ marginTop: "0.15rem" }}>
                  <p className="error" style={{ marginBottom: "0.3rem" }}>
                    {orderFailedMessage}
                  </p>
                  <p className="panel-hint" style={{ margin: 0 }}>
                    <a href={`mailto:${adminContactEmail}`}>mailto:{adminContactEmail}</a>
                  </p>
                </div>
              ) : showTrackingLinks ? (
                <div className="client-success-box">
                  <p className="client-success-title">
                    {isConfirming
                      ? "Aguardando confirmação da transação de destino"
                      : "Transação de destino confirmada"}
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
                          Transação de destino <span className="external-link-icon">↗</span>
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
