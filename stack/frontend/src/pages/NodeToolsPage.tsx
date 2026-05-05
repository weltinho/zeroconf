import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl, wsUrl as wsEventsUrl } from "../api/url";
import { AppLogo } from "../components/AppLogo";
import { getUiText } from "../i18n";

type ChainSummary = {
  chain?: string;
  blocks?: number;
  headers?: number;
  bestblockhash?: string;
  verificationprogress?: number;
  initialblockdownload?: boolean;
  pruned?: boolean;
  size_on_disk?: number;
  warnings?: unknown;
};

type WalletPayload = {
  wallet_name: string | null;
  configured: boolean;
  loaded: boolean;
  error: string | null;
  addresses: Array<{
    address?: string;
    amount?: number;
    confirmations?: number;
    label?: string;
    txids?: string[];
  }>;
  unspent_by_address: Array<{
    address: string;
    utxo_count: number;
    total_btc: number;
    utxos: unknown[];
  }>;
};

/** Payload filtrado no backend (`zmq_events._shape_for_operator`). */
type RelayEvent = {
  topic: string;
  tipo?: string;
  resumo?: string;
  sequencia_zmq?: number | null;
  hash_do_bloco?: string;
  txid?: string;
};

const ZMQ_TOPICS_UI = ["hashblock", "hashtx"] as const;

export function NodeToolsPage() {
  const t = useMemo(() => getUiText(), []);
  const [chain, setChain] = useState<ChainSummary | null>(null);
  const [wallet, setWallet] = useState<WalletPayload | null>(null);
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);

  const [wsStatus, setWsStatus] = useState<"disconnected" | "connecting" | "connected">(
    "disconnected"
  );
  const [events, setEvents] = useState<RelayEvent[]>([]);
  const [topicFilter, setTopicFilter] = useState<"all" | (typeof ZMQ_TOPICS_UI)[number]>("all");
  const wsRef = useRef<WebSocket | null>(null);
  const refreshInFlightRef = useRef(false);

  const loadDashboard = useCallback(async (): Promise<boolean> => {
    if (refreshInFlightRef.current) {
      return false;
    }
    refreshInFlightRef.current = true;
    setLoading(true);
    setApiError("");
    let ok = false;
    try {
      const [c, w] = await Promise.all([
        fetch(apiUrl("/adm/node/chain"), { credentials: "include" }),
        fetch(apiUrl("/adm/node/wallet"), { credentials: "include" }),
      ]);
      if (!c.ok) {
        throw new Error((await c.json().catch(() => ({}))).detail ?? `HTTP ${c.status}`);
      }
      if (!w.ok) {
        throw new Error((await w.json().catch(() => ({}))).detail ?? `HTTP ${w.status}`);
      }
      setChain(await c.json());
      setWallet(await w.json());
      ok = true;
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Erro ao carregar painel");
      setChain(null);
      setWallet(null);
    } finally {
      setLoading(false);
      refreshInFlightRef.current = false;
    }
    return ok;
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    let cancelled = false;
    let timerId: number | null = null;

    async function loop() {
      if (cancelled) {
        return;
      }
      const success = await loadDashboard();
      if (cancelled) {
        return;
      }
      // Só agenda o próximo auto-refresh 5s após conclusão bem sucedida.
      if (success) {
        timerId = window.setTimeout(() => {
          void loop();
        }, 5000);
      } else {
        // Em erro, tenta novamente mais cedo para recuperação automática.
        timerId = window.setTimeout(() => {
          void loop();
        }, 1500);
      }
    }

    void loop();
    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [loadDashboard]);

  const filteredEvents = useMemo(() => {
    if (topicFilter === "all") {
      return events;
    }
    return events.filter((e) => e.topic === topicFilter);
  }, [events, topicFilter]);

  function connectWs() {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
      return;
    }
    setWsStatus("connecting");
    const ws = new WebSocket(wsEventsUrl("/ws/events"));
    wsRef.current = ws;
    ws.onopen = () => setWsStatus("connected");
    ws.onmessage = (ev) => {
      // Ignora mensagens de sockets antigos já "desligados" pela UI.
      if (wsRef.current !== ws) {
        return;
      }
      try {
        const parsed: RelayEvent = JSON.parse(ev.data);
        setEvents((prev) => [parsed, ...prev].slice(0, 80));
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => setWsStatus("disconnected");
    ws.onclose = () => {
      setWsStatus("disconnected");
      wsRef.current = null;
    };
  }

  function disconnectWs() {
    const ws = wsRef.current;
    wsRef.current = null;
    setWsStatus("disconnected");
    ws?.close();
  }

  useEffect(() => {
    const id = window.setTimeout(connectWs, 0);
    return () => {
      window.clearTimeout(id);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  function onRefresh(e: FormEvent) {
    e.preventDefault();
    void loadDashboard();
  }

  return (
    <main className="layout">
      <nav className="page-nav" aria-label="Navigation">
        <Link to="/adm" className="page-nav-link">
          {t.backToAdm}
        </Link>
        <span className="page-nav-sep" aria-hidden="true">
          /
        </span>
        <span className="page-nav-current">{t.nodeToolsNav}</span>
      </nav>
      <header className="hero">
        <div className="hero-brand">
          <AppLogo className="hero-logo" variant="matrix" aria-label={t.logoAriaLabel} />
          <div className="hero-copy">
            <h1>{t.nodeDashTitle}</h1>
            <p>{t.nodeDashSubtitle}</p>
          </div>
        </div>
        <p className="hero-meta">{t.localeFixedBr}</p>
      </header>

      <div className="workspace">
        <section className="panel panel-rpc">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>{t.nodeChainHeading}</h2>
            <form onSubmit={onRefresh}>
              <button type="submit" disabled={loading}>
                {loading ? t.calling : t.nodeRefresh}
              </button>
            </form>
          </div>
          {apiError ? <p className="error">{apiError}</p> : null}
          <pre className="panel-pre rpc-response-pre">
            {chain
              ? JSON.stringify(chain, null, 2)
              : loading
                ? "…"
                : t.noRpcResponse}
          </pre>
        </section>

        <section className="panel panel-rpc">
          <h2>{t.nodeWalletHeading}</h2>
          <p className="panel-hint panel-hint-tight">{t.nodeWalletHint}</p>
          <pre className="panel-pre rpc-response-pre">
            {wallet
              ? JSON.stringify(wallet, null, 2)
              : loading
                ? "…"
                : t.noRpcResponse}
          </pre>
        </section>

        <section className="panel panel-zmq">
          <h2>{t.nodeEventsHeading}</h2>
          <p className="panel-hint panel-hint-tight">{t.nodeEventsHint}</p>
          <div className="row">
            <button
              type="button"
              onClick={() =>
                wsStatus === "connected" || wsStatus === "connecting"
                  ? disconnectWs()
                  : connectWs()
              }
              className={
                wsStatus === "connected" || wsStatus === "connecting"
                  ? "button-ws-stop"
                  : "button-ws-start"
              }
            >
              {wsStatus === "connected" || wsStatus === "connecting"
                ? t.stopStream
                : t.startStream}
            </button>
            <button type="button" className="button-ws-clear" onClick={() => setEvents([])}>
              {t.clearEvents}
            </button>
            <label className="zmq-filter-label">
              <span>{t.zmqTopicFilterLabel}</span>
              <select
                className="zmq-topic-filter"
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value as typeof topicFilter)}
              >
                <option value="all">{t.zmqTopicAll}</option>
                {ZMQ_TOPICS_UI.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </label>
            <span className={`status ${wsStatus}`}>{wsStatus}</span>
          </div>
          <pre className="panel-pre zmq-events-pre">
            {!filteredEvents.length
              ? t.noEvents
              : JSON.stringify(filteredEvents, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}
