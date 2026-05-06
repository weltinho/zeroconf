export type UiText = {
  backToHome: string;
  backToAdm: string;
  homeTitle: string;
  homeSubtitle: string;
  matrixNavFlux: string;
  matrixNavInfo: string;
  matrixNavAdm: string;
  matrixHeroTitle: string;
  matrixHeroBullet1: string;
  matrixHeroBullet2: string;
  matrixNetStatus: string;
  clientFooterOperators: string;
  cardToolsTitle: string;
  cardToolsDesc: string;
  cardRoadmapTitle: string;
  cardRoadmapDesc: string;
  logoAriaLabel: string;
  locale: string;
  /** Interface fixada em pt-BR (independente do navegador). */
  localeFixedBr: string;
  admLoginKicker: string;
  admLoginTitle: string;
  admUsernameLabel: string;
  admPasswordLabel: string;
  admSubmit: string;
  admCheckingSession: string;
  admErrorGeneric: string;
  admLoginFoot: string;
  admHomeTitle: string;
  admHomeSubtitle: string;
  admNavConsole: string;
  admNavNode: string;
  admNavSwaps: string;
  admNavPublic: string;
  admLogout: string;
  nodeToolsNav: string;
  nodeDashTitle: string;
  nodeDashSubtitle: string;
  nodeChainHeading: string;
  nodeWalletHeading: string;
  nodeWalletHint: string;
  nodeEventsHeading: string;
  nodeEventsHint: string;
  nodeRefresh: string;
  nodeToolsTitle: string;
  nodeToolsSubtitle: string;
  nodeToolsRpcHeading: string;
  paramsLabel: string;
  typeToFilter: string;
  noMethods: string;
  docs: string;
  calling: string;
  callRpc: string;
  transportWithParams: string;
  transportNoParams: string;
  exampleHint: string;
  paramsPlaceholder: string;
  walletPlaceholder: string;
  noRpcResponse: string;
  zmqTitle: string;
  zmqRelayHint: string;
  zmqTopicFilterLabel: string;
  zmqTopicAll: string;
  zmqEventsVisible: string;
  zmqNoEventsForFilter: string;
  stopStream: string;
  startStream: string;
  clearEvents: string;
  noEvents: string;
  wsMalformed: string;
  wsError: string;
  paramsJsonError: string;
  paramsArrayError: string;
  rpcFailed: string;
  unknownRpcError: string;
  customCategory: string;
  genericMethodDescription: string;
};

export const UI_TEXT: Record<"en" | "pt", UiText> = {
  en: {
    backToHome: "Home",
    backToAdm: "[ADM]",
    homeTitle: "ZeroConf Prop",
    homeSubtitle:
      "Bitcoin Core as the backend: mempool visibility and wallet RPC for prop liquidity workflows.",
    matrixNavFlux: "FLUXO",
    matrixNavInfo: "INFO",
    matrixNavAdm: "ADM",
    matrixHeroTitle: "> ENTER_ZERoconf",
    matrixHeroBullet1:
      "> Liquidity rails backed by your node — mempool-first, no fairy tales.",
    matrixHeroBullet2: "> Small capital on-chain; integrate swaps later. Freedom to iterate.",
    matrixNetStatus: "● NETWORK: Bitcoin Signet — operator wallet",
    clientFooterOperators: "Operators: [ADM] for node dashboard and admin tools.",
    cardToolsTitle: "Node console",
    cardToolsDesc: "Chain state, single operator wallet, light ZMQ (new block / tx).",
    cardRoadmapTitle: "Guided flow (next)",
    cardRoadmapDesc:
      "Issue address → mempool payment → spend unconfirmed → MariaDB audit trail.",
    logoAriaLabel: "ZeroConf Prop — Bitcoin Core backend",
    locale: "Browser locale",
    localeFixedBr: "Interface fixed to Portuguese (Brazil)",
    admLoginKicker: "// zeroconf.admin ▸ authentication_required",
    admLoginTitle: "ACCESS_CONSOLE",
    admUsernameLabel: "operator_id",
    admPasswordLabel: "passphrase",
    admSubmit: "UNLOCK ▸",
    admCheckingSession: "// verifying_session_with_backend…",
    admErrorGeneric: "Login failed — check API and database.",
    admLoginFoot:
      "Password is verified server-side (bcrypt in MariaDB); session cookie is HTTP-only.",
    admHomeTitle: "Admin console",
    admHomeSubtitle:
      "Operator-facing tools. End users stay on the public surface.",
    admNavConsole: "HOME",
    admNavNode: "NODE",
    admNavSwaps: "SWAPS",
    admNavPublic: "Public site",
    admLogout: "LOCK_SESSION",
    nodeToolsNav: "NODE",
    nodeDashTitle: "Node dashboard",
    nodeDashSubtitle:
      "Chain status and operator wallet (no generic RPC passthrough). ZMQ: new blocks and mempool tx ids only.",
    nodeChainHeading: "Chain",
    nodeWalletHeading: "Wallet",
    nodeWalletHint:
      "Set BITCOIN_OPERATOR_WALLET in backend env. Fee address index 0 is auto-created and shown with balance.",
    nodeEventsHeading: "Live events",
    nodeEventsHint: "WebSocket: hashblock + hashtx only (configured on the API).",
    nodeRefresh: "Refresh",
    nodeToolsTitle: "Operator tools",
    nodeToolsSubtitle:
      "Chain/mempool, raw transactions, wallet RPC — filtered for ZeroConf workflows.",
    nodeToolsRpcHeading: "RPC",
    paramsLabel: "params",
    typeToFilter: "Type to filter methods...",
    noMethods: "No methods found.",
    docs: "docs",
    calling: "Calling...",
    callRpc: "Call RPC",
    transportWithParams: "(JSON-RPC params supported)",
    transportNoParams: "(no params expected for this method)",
    exampleHint: "Example params load when you pick a method from the list.",
    paramsPlaceholder: 'JSON array, e.g. [1] or ["tb1...", 1]',
    walletPlaceholder: "Wallet name (optional), e.g. operator-wallet",
    noRpcResponse: "No RPC response yet.",
    zmqTitle: "ZMQ → WebSocket",
    zmqRelayHint:
      "Live summary: new blocks + wallet-relevant txids only (filtered in backend).",
    zmqTopicFilterLabel: "Topic",
    zmqTopicAll: "All topics",
    zmqEventsVisible: "{visible} of {total} events",
    zmqNoEventsForFilter: "No events for this topic in the buffer yet.",
    stopStream: "Stop stream",
    startStream: "Start stream",
    clearEvents: "Clear events",
    noEvents: "No events captured yet.",
    wsMalformed: "Received malformed WS payload",
    wsError: "WebSocket error",
    paramsJsonError: "Params must be valid JSON",
    paramsArrayError: 'Params JSON must be an array, e.g. [1, "label"]',
    rpcFailed: "RPC request failed",
    unknownRpcError: "Unknown RPC error",
    customCategory: "Custom method",
    genericMethodDescription:
      "RPC method in this category. See the official reference for complete semantics.",
  },
  pt: {
    backToHome: "Início",
    backToAdm: "[ADM]",
    homeTitle: "ZeroConf Prop",
    homeSubtitle:
      "Bitcoin Core como backend: visibilidade na mempool e RPC de carteira para liquidez prop.",
    matrixNavFlux: "FLUXO",
    matrixNavInfo: "INFO",
    matrixNavAdm: "ADM",
    matrixHeroTitle: "> ENTRAR_ZERoconf",
    matrixHeroBullet1:
      "> Liquidez apoiada no teu nó — mempool primeiro, sem ilusões.",
    matrixHeroBullet2: "> Capital fino on-chain; swaps externos depois. Liberdade para iterar.",
    matrixNetStatus: "● REDE: Bitcoin Signet — carteira operador",
    clientFooterOperators: "Operadores: [ADM] para painel do nó e admin.",
    cardToolsTitle: "Consola do nó",
    cardToolsDesc: "Estado da cadeia, carteira única do operador, ZMQ leve (bloco / tx).",
    cardRoadmapTitle: "Fluxo guiado (a seguir)",
    cardRoadmapDesc:
      "Endereço → pagamento na mempool → gastar sem confirmação → auditoria MariaDB.",
    logoAriaLabel: "ZeroConf Prop — backend Bitcoin Core",
    locale: "Idioma do navegador",
    localeFixedBr: "Idioma da interface: Português (Brasil)",
    admLoginKicker: "// zeroconf.admin ▸ autenticação necessária",
    admLoginTitle: "ACCESS_CONSOLE",
    admUsernameLabel: "operator_id",
    admPasswordLabel: "senha",
    admSubmit: "DESBLOQUEAR ▸",
    admCheckingSession: "// a_verificar_sessão_no_backend…",
    admErrorGeneric: "Falha no login — verifica API e base de dados.",
    admLoginFoot:
      "Senha validada no servidor (bcrypt na MariaDB); cookie de sessão é HTTP-only.",
    admHomeTitle: "Consola administrativa",
    admHomeSubtitle:
      "Ferramentas do operador. Utilizadores finais ficam na área pública.",
    admNavConsole: "INÍCIO",
    admNavNode: "NODE",
    admNavSwaps: "SWAPS",
    admNavPublic: "Site público",
    admLogout: "BLOQUEAR_SESSÃO",
    nodeToolsNav: "NODE",
    nodeDashTitle: "Painel do nó",
    nodeDashSubtitle:
      "Estado da blockchain e carteira do operador (sem passthrough RPC genérico). ZMQ só bloco novo e txid na mempool.",
    nodeChainHeading: "Blockchain",
    nodeWalletHeading: "Carteira",
    nodeWalletHint:
      "Carteira definida no backend. Endereço de taxa índice 0 é auto-criado e exibido com saldo.",
    nodeEventsHeading: "Eventos ao vivo",
    nodeEventsHint: "WebSocket: só hashblock + hashtx pertinentes a ESTE node (configurado na API).",
    nodeRefresh: "Atualizar",
    nodeToolsTitle: "Ferramentas do operador",
    nodeToolsSubtitle:
      "Chain/mempool, transacções raw, RPC de carteira — focado em ZeroConf.",
    nodeToolsRpcHeading: "RPC",
    paramsLabel: "parâmetros",
    typeToFilter: "Digite para filtrar métodos...",
    noMethods: "Nenhum método encontrado.",
    docs: "docs",
    calling: "Chamando...",
    callRpc: "Chamar RPC",
    transportWithParams: "(suporta parâmetros JSON-RPC)",
    transportNoParams: "(este método não espera parâmetros)",
    exampleHint: "Parâmetros de exemplo ao escolher um método da lista.",
    paramsPlaceholder: 'Array JSON, ex.: [1] ou ["tb1...", 1]',
    walletPlaceholder: "Nome da carteira (opcional), ex.: operator-wallet",
    noRpcResponse: "Sem resposta RPC ainda.",
    zmqTitle: "Eventos do nó (ZMQ)",
    zmqRelayHint:
      "Só resumos úteis: blocos novos e txids relevantes para tua carteira (filtrado no backend).",
    zmqTopicFilterLabel: "Tópico",
    zmqTopicAll: "Todos os tópicos",
    zmqEventsVisible: "{visible} de {total} eventos",
    zmqNoEventsForFilter: "Ainda não há eventos deste tópico no buffer.",
    stopStream: "Parar stream",
    startStream: "Iniciar stream",
    clearEvents: "Limpar eventos",
    noEvents: "Nenhum evento capturado ainda.",
    wsMalformed: "Payload WS inválido recebido",
    wsError: "Erro de WebSocket",
    paramsJsonError: "Os parâmetros precisam ser JSON válido",
    paramsArrayError: 'O JSON de params deve ser um array, ex.: [1, "label"]',
    rpcFailed: "Falha na chamada RPC",
    unknownRpcError: "Erro RPC desconhecido",
    customCategory: "Método customizado",
    genericMethodDescription:
      "Método RPC desta categoria. Veja a referência oficial para semântica completa.",
  },
};
