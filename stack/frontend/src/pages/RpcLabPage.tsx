import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppLogo } from "../components/AppLogo";
import { METHOD_DESCRIPTION_MAP } from "../i18n/methodDescriptions";
import { getUiText } from "../i18n";

type RpcResult = {
  method: string;
  wallet?: string | null;
  params?: unknown[];
  result: unknown;
};

/** Tópicos ZMQ que o backend subscreve por default (alinhar com `bitcoin.conf` / settings). */
const ZMQ_RELAY_TOPIC_OPTIONS = [
  "hashblock",
  "hashtx",
  "rawblock",
  "rawtx",
  "sequence",
] as const;

type ZmqTopicFilterValue = "all" | (typeof ZMQ_RELAY_TOPIC_OPTIONS)[number];

type RelayEvent = {
  topic: string;
  payload_hex: string | null;
  sequence: number | null;
  middle_hex?: string[];
  rest_hex?: string[];
};

type RpcMethodSpec = {
  name: string;
  params: "none" | "optional" | "required";
  exampleParams?: unknown[];
};

type RpcCategory = {
  label: string;
  methods: RpcMethodSpec[];
};

function m(
  name: string,
  params: RpcMethodSpec["params"] = "optional",
  exampleParams: unknown[] = []
): RpcMethodSpec {
  return { name, params, exampleParams };
}

const WALLET_RPC_NAMES = [
  "abandontransaction","abortrescan","addmultisigaddress","backupwallet","bumpfee","createwallet","dumpprivkey",
  "dumpwallet","encryptwallet","getaddressesbylabel","getaddressinfo","getbalance","getbalances","getnewaddress",
  "getrawchangeaddress","getreceivedbyaddress","getreceivedbylabel","gettransaction","getunconfirmedbalance",
  "getwalletinfo","importaddress","importdescriptors","importmulti","importprivkey","importprunedfunds",
  "importpubkey","importwallet","keypoolrefill","listaddressgroupings","listlabels","listlockunspent",
  "listreceivedbyaddress","listreceivedbylabel","listsinceblock","listtransactions","listunspent","listwalletdir",
  "listwallets","loadwallet","lockunspent","psbtbumpfee","removeprunedfunds","rescanblockchain","send","sendmany",
  "sendtoaddress","sethdseed","setlabel","settxfee","setwalletflag","signmessage","signrawtransactionwithwallet",
  "unloadwallet","upgradewallet","walletcreatefundedpsbt","walletlock","walletpassphrase","walletpassphrasechange",
  "walletprocesspsbt",
];

const WALLET_NO_PARAMS = new Set([
  "getwalletinfo","getbalances","listwallets","listwalletdir","listlabels","listaddressgroupings","getbalance",
  "getnewaddress","getrawchangeaddress","getunconfirmedbalance","listtransactions","listunspent","walletlock",
]);

const WALLET_EXAMPLE_MAP: Record<string, unknown[]> = {
  createwallet: ["student-wallet"],
  loadwallet: ["student-wallet"],
  unloadwallet: ["student-wallet"],
  getaddressinfo: ["<address>"],
  getreceivedbyaddress: ["<address>"],
  gettransaction: ["<txid>"],
  sendtoaddress: ["<address>", 0.001],
  sendmany: ["", { "<address>": 0.001 }],
  send: [{ outputs: [{ "<address>": 0.001 }] }],
  walletpassphrase: ["<passphrase>", 60],
  walletpassphrasechange: ["<old>", "<new>"],
};

const RPC_CATALOG: RpcCategory[] = [
  {
    label: "Blockchain RPCs",
    methods: [
      m("getbestblockhash", "none"),
      m("getblock", "required", ["<blockhash>", 2]),
      m("getblockchaininfo", "none"),
      m("getblockcount", "none"),
      m("getblockfilter", "required", ["<blockhash>", "basic"]),
      m("getblockhash", "required", [1]),
      m("getblockheader", "required", ["<blockhash>", true]),
      m("getblockstats", "required", [1]),
      m("getchaintips", "none"),
      m("getchaintxstats", "optional", [100]),
      m("getdifficulty", "none"),
      m("getmempoolancestors", "required", ["<txid>"]),
      m("getmempooldescendants", "required", ["<txid>"]),
      m("getmempoolentry", "required", ["<txid>"]),
      m("getmempoolinfo", "none"),
      m("getrawmempool", "optional", [true]),
      m("gettxout", "required", ["<txid>", 0]),
      m("gettxoutproof", "required", [["<txid>"]]),
      m("gettxoutsetinfo", "optional", ["none"]),
      m("preciousblock", "required", ["<blockhash>"]),
      m("pruneblockchain", "required", [1000]),
      m("savemempool", "none"),
      m("scantxoutset", "required", ["start", ["addr(tb1q...)"]]),
      m("verifychain", "optional", [3, 6]),
      m("verifytxoutproof", "required", ["<proof-hex>"]),
    ],
  },
  {
    label: "Control RPCs",
    methods: [
      m("getmemoryinfo", "none"),
      m("getrpcinfo", "none"),
      m("help", "optional", ["getblockchaininfo"]),
      m("logging", "optional", [["rpc"], ["net"]]),
      m("stop", "none"),
      m("uptime", "none"),
    ],
  },
  {
    label: "Generating RPCs",
    methods: [
      m("generateblock", "required", ["<output>", ["<txid>"]]),
      m("generatetoaddress", "required", [1, "<address>"]),
      m("generatetodescriptor", "required", [1, "addr(tb1q...)"]),
    ],
  },
  {
    label: "Mining RPCs",
    methods: [
      m("getblocktemplate", "optional", [{ rules: ["segwit"] }]),
      m("getmininginfo", "none"),
      m("getnetworkhashps", "optional", [120, -1]),
      m("prioritisetransaction", "required", ["<txid>", 0, 1000]),
      m("submitblock", "required", ["<block-hex>"]),
      m("submitheader", "required", ["<header-hex>"]),
    ],
  },
  {
    label: "Network RPCs",
    methods: [
      m("addnode", "required", ["127.0.0.1:8333", "add"]),
      m("clearbanned", "none"),
      m("disconnectnode", "required", ["127.0.0.1:8333"]),
      m("getaddednodeinfo", "none"),
      m("getconnectioncount", "none"),
      m("getnettotals", "none"),
      m("getnetworkinfo", "none"),
      m("getnodeaddresses", "optional", [10]),
      m("getpeerinfo", "none"),
      m("listbanned", "none"),
      m("ping", "none"),
      m("setban", "required", ["10.0.0.0/24", "add"]),
      m("setnetworkactive", "required", [true]),
    ],
  },
  {
    label: "Rawtransactions RPCs",
    methods: [
      m("analyzepsbt", "required", ["<psbt>"]),
      m("combinepsbt", "required", [["<psbt1>", "<psbt2>"]]),
      m("combinerawtransaction", "required", [["<hex1>", "<hex2>"]]),
      m("converttopsbt", "required", ["<rawtx-hex>"]),
      m("createpsbt", "required", [[], [{}], 0]),
      m("createrawtransaction", "required", [[], {}]),
      m("decodepsbt", "required", ["<psbt>"]),
      m("decoderawtransaction", "required", ["<rawtx-hex>"]),
      m("decodescript", "required", ["<script-hex>"]),
      m("finalizepsbt", "required", ["<psbt>"]),
      m("fundrawtransaction", "required", ["<rawtx-hex>"]),
      m("getrawtransaction", "required", ["<txid>", true]),
      m("joinpsbts", "required", [["<psbt1>", "<psbt2>"]]),
      m("sendrawtransaction", "required", ["<rawtx-hex>"]),
      m("signrawtransactionwithkey", "required", ["<rawtx-hex>", []]),
      m("testmempoolaccept", "required", [["<rawtx-hex>"]]),
      m("utxoupdatepsbt", "required", ["<psbt>"]),
    ],
  },
  {
    label: "Util RPCs",
    methods: [
      m("createmultisig", "required", [2, ["<pubkey1>", "<pubkey2>"]]),
      m("deriveaddresses", "required", ["<descriptor>"]),
      m("estimatesmartfee", "required", [6]),
      m("getdescriptorinfo", "required", ["<descriptor>"]),
      m("getindexinfo", "optional", ["txindex"]),
      m("signmessagewithprivkey", "required", ["<wif>", "hello"]),
      m("validateaddress", "required", ["<address>"]),
      m("verifymessage", "required", ["<address>", "<sig>", "hello"]),
    ],
  },
  {
    label: "Wallet RPCs",
    methods: WALLET_RPC_NAMES.map((name) =>
      m(name, WALLET_NO_PARAMS.has(name) ? "none" : "optional", WALLET_EXAMPLE_MAP[name] ?? [])
    ),
  },
];

const METHOD_INDEX = new Map<string, RpcMethodSpec>(
  RPC_CATALOG.flatMap((category) => category.methods.map((entry) => [entry.name, entry] as const))
);
const METHOD_CATEGORY_INDEX = new Map<string, string>(
  RPC_CATALOG.flatMap((category) =>
    category.methods.map((entry) => [entry.name, category.label] as const)
  )
);
export function RpcLabPage() {
  const [method, setMethod] = useState("");
  const [methodInput, setMethodInput] = useState("");
  const [methodMenuOpen, setMethodMenuOpen] = useState(false);
  const [paramsText, setParamsText] = useState("[]");
  const [walletName, setWalletName] = useState("");
  const [rpcResponse, setRpcResponse] = useState<RpcResult | null>(null);
  const [rpcError, setRpcError] = useState<string>("");
  const [isLoadingRpc, setIsLoadingRpc] = useState(false);

  const [wsStatus, setWsStatus] = useState<"disconnected" | "connecting" | "connected">(
    "disconnected"
  );
  const [events, setEvents] = useState<RelayEvent[]>([]);
  const [zmqTopicFilter, setZmqTopicFilter] = useState<ZmqTopicFilterValue>("all");
  const [wsError, setWsError] = useState("");
  const browserLocale = useMemo(() => navigator.language || "unknown", []);
  const t = useMemo(() => getUiText(browserLocale), [browserLocale]);
  const wsRef = useRef<WebSocket | null>(null);
  const wsStartTimerRef = useRef<number | null>(null);

  const wsUrl = useMemo(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/events`;
  }, []);

  const filteredZmqEvents = useMemo(() => {
    if (zmqTopicFilter === "all") {
      return events;
    }
    return events.filter((e) => e.topic === zmqTopicFilter);
  }, [events, zmqTopicFilter]);

  const methodSpec = useMemo(
    () => METHOD_INDEX.get(method) ?? { name: method, params: "optional" as const, exampleParams: [] },
    [method]
  );

  const transport = methodSpec.params === "none" ? "GET" : "POST";
  const methodCategory = METHOD_CATEGORY_INDEX.get(method) ?? t.customCategory;
  const methodDescription =
    METHOD_DESCRIPTION_MAP[method] ??
    `${t.genericMethodDescription} (${methodCategory})`;
  const methodDocUrl = `https://developer.bitcoin.org/reference/rpc/${method}.html`;
  const methodSuggestions = useMemo(
    () => Array.from(METHOD_INDEX.keys()).sort((a, b) => a.localeCompare(b)),
    []
  );
  const filteredMethodSuggestions = useMemo(() => {
    const value = methodInput.trim().toLowerCase();
    if (!value) {
      return methodSuggestions;
    }
    return methodSuggestions.filter((name) => name.toLowerCase().includes(value));
  }, [methodInput, methodSuggestions]);
  const methodBoxRef = useRef<HTMLDivElement | null>(null);
  const methodRef = useRef(method);
  methodRef.current = method;
  const methodMenuOpenRef = useRef(methodMenuOpen);
  methodMenuOpenRef.current = methodMenuOpen;

  function closeMethodMenuWithoutNewSelection() {
    setMethodMenuOpen(false);
    setMethodInput(methodRef.current);
  }

  function openMethodMenu() {
    setMethodInput("");
    setMethodMenuOpen(true);
  }

  function toggleMethodMenu() {
    if (methodMenuOpen) {
      closeMethodMenuWithoutNewSelection();
    } else {
      openMethodMenu();
    }
  }

  function applyMethod(methodName: string) {
    setMethod(methodName);
    setMethodInput(methodName);
    setMethodMenuOpen(false);
    const spec = METHOD_INDEX.get(methodName);
    if (spec && spec.params !== "none") {
      setParamsText(JSON.stringify(spec.exampleParams ?? [], null, 2));
    }
  }

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!methodBoxRef.current) {
        return;
      }
      if (!methodBoxRef.current.contains(event.target as Node)) {
        if (methodMenuOpenRef.current) {
          closeMethodMenuWithoutNewSelection();
        }
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleRpcSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoadingRpc(true);
    setRpcError("");
    setRpcResponse(null);
    try {
      const wallet = walletName.trim();
      const query = wallet ? `?wallet=${encodeURIComponent(wallet)}` : "";
      let response: Response;
      if (transport === "GET") {
        response = await fetch(`/api/rpc/${encodeURIComponent(method)}${query}`);
      } else {
        let parsedParams: unknown = [];
        try {
          parsedParams = JSON.parse(paramsText || "[]");
        } catch {
          throw new Error(t.paramsJsonError);
        }
        if (!Array.isArray(parsedParams)) {
          throw new Error(t.paramsArrayError);
        }
        response = await fetch(`/api/rpc/${encodeURIComponent(method)}${query}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params: parsedParams }),
        });
      }
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.detail ?? t.rpcFailed);
      }
      setRpcResponse(body);
    } catch (err) {
      setRpcError(err instanceof Error ? err.message : t.unknownRpcError);
    } finally {
      setIsLoadingRpc(false);
    }
  }

  function connectWs() {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
      return;
    }
    setWsError("");
    setWsStatus("connecting");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
    };

    ws.onmessage = (event) => {
      try {
        const parsed: RelayEvent = JSON.parse(event.data);
        setEvents((prev) => [parsed, ...prev].slice(0, 200));
      } catch {
        setWsError(t.wsMalformed);
      }
    };

    ws.onerror = () => {
      setWsError(t.wsError);
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
      wsRef.current = null;
    };
  }

  function disconnectWs() {
    wsRef.current?.close();
    wsRef.current = null;
  }

  useEffect(() => {
    // Em dev com React StrictMode, efeitos montam/desmontam duas vezes.
    // O pequeno delay evita abrir e fechar o WS imediatamente no primeiro ciclo.
    wsStartTimerRef.current = window.setTimeout(() => {
      connectWs();
    }, 0);

    return () => {
      if (wsStartTimerRef.current !== null) {
        window.clearTimeout(wsStartTimerRef.current);
        wsStartTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl]);

  function toggleWs() {
    if (wsStatus === "connected" || wsStatus === "connecting") {
      disconnectWs();
      return;
    }
    connectWs();
  }

  return (
    <main className="layout">
      <nav className="page-nav" aria-label="Navigation">
        <Link to="/" className="page-nav-link">
          {t.backToHome}
        </Link>
        <span className="page-nav-sep" aria-hidden="true">
          /
        </span>
        <span className="page-nav-current">{t.rpcPlayground}</span>
      </nav>
      <header className="hero">
        <div className="hero-brand">
          <AppLogo className="hero-logo" aria-label={t.logoAriaLabel} />
          <div className="hero-copy">
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
        </div>
        <p className="hero-meta">
          {t.locale}: {browserLocale}
        </p>
      </header>

      <div className="workspace">
      <section className="panel panel-rpc">
        <h2>{t.rpcPlayground}</h2>
        <div className="badges">
          <span className="badge">{methodCategory}</span>
          <span className="badge">HTTP {transport}</span>
          <span className="badge">
            {t.paramsLabel}: {methodSpec.params}
          </span>
        </div>
        <div className="method-toolbar">
          <div className="method-combobox" ref={methodBoxRef}>
            <button
              type="button"
              className="method-combobox-trigger"
              onClick={toggleMethodMenu}
            >
              <span>{method}</span>
              <span>{methodMenuOpen ? "▲" : "▼"}</span>
            </button>
            {methodMenuOpen ? (
              <div className="method-combobox-menu">
                <input
                  value={methodInput}
                  onChange={(e) => setMethodInput(e.target.value)}
                  placeholder={t.typeToFilter}
                  autoFocus
                />
                <div className="method-options">
                  {filteredMethodSuggestions.length === 0 ? (
                    <p className="method-empty">{t.noMethods}</p>
                  ) : (
                    filteredMethodSuggestions.map((name) => (
                      <button
                        type="button"
                        key={name}
                        className={`method-option ${name === method ? "active" : ""}`}
                        onClick={() => applyMethod(name)}
                      >
                        {name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <p className="method-description">
          {methodDescription}{" "}
          <a href={methodDocUrl} target="_blank" rel="noreferrer">
            {t.docs}
          </a>
        </p>
        <form onSubmit={handleRpcSubmit} className="row">
          <input
            type="text"
            value={walletName}
            onChange={(e) => setWalletName(e.target.value)}
            placeholder={t.walletPlaceholder}
          />
          <button type="submit" disabled={isLoadingRpc || !method}>
            {isLoadingRpc ? t.calling : t.callRpc}
          </button>
        </form>
        <p className="panel-hint">
          Transport: <strong>{transport}</strong>{" "}
          {transport === "POST"
            ? t.transportWithParams
            : t.transportNoParams}
        </p>
        {transport === "POST" ? (
          <p className="panel-hint">{t.exampleHint}</p>
        ) : null}
        {transport === "POST" ? (
          <textarea
            className="rpc-params"
            rows={4}
            value={paramsText}
            onChange={(e) => setParamsText(e.target.value)}
            placeholder={t.paramsPlaceholder}
          />
        ) : null}
        {rpcError ? <p className="error">{rpcError}</p> : null}
        <pre className="panel-pre rpc-response-pre">
          {rpcResponse ? JSON.stringify(rpcResponse, null, 2) : t.noRpcResponse}
        </pre>
      </section>

      <section className="panel panel-zmq">
        <h2>{t.zmqTitle}</h2>
        <div className="row">
          <button
            type="button"
            onClick={toggleWs}
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
          <button onClick={() => setEvents([])} type="button">
            {t.clearEvents}
          </button>
          <label className="zmq-filter-label">
            <span>{t.zmqTopicFilterLabel}</span>
            <select
              className="zmq-topic-filter"
              value={zmqTopicFilter}
              onChange={(e) => setZmqTopicFilter(e.target.value as ZmqTopicFilterValue)}
            >
              <option value="all">{t.zmqTopicAll}</option>
              {ZMQ_RELAY_TOPIC_OPTIONS.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </label>
          <span className={`status ${wsStatus}`}>{wsStatus}</span>
        </div>
        {wsError ? <p className="error">{wsError}</p> : null}
        {events.length ? (
          <p className="panel-hint">
            {t.zmqEventsVisible
              .replace("{visible}", String(filteredZmqEvents.length))
              .replace("{total}", String(events.length))}
          </p>
        ) : null}
        <pre className="panel-pre zmq-events-pre">
          {!events.length
            ? t.noEvents
            : filteredZmqEvents.length
              ? JSON.stringify(filteredZmqEvents, null, 2)
              : t.zmqNoEventsForFilter}
        </pre>
      </section>
      </div>
    </main>
  );
}
