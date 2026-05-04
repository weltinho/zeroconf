export type UiText = {
  backToHome: string;
  homeTitle: string;
  homeSubtitle: string;
  cardRpcTitle: string;
  cardRpcDesc: string;
  cardSoonTitle: string;
  cardSoonDesc: string;
  title: string;
  subtitle: string;
  logoAriaLabel: string;
  locale: string;
  rpcPlayground: string;
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
    homeTitle: "Bitcoin Coder Lab",
    homeSubtitle:
      "Pick a workspace. The RPC playground and ZMQ stream live on the lab page.",
    cardRpcTitle: "RPC + ZMQ lab",
    cardRpcDesc: "JSON-RPC passthrough and real-time relay events from your node.",
    cardSoonTitle: "More soon",
    cardSoonDesc: "Additional guides and tools will appear here.",
    title: "Bitcoin Coder Lab UI",
    subtitle: "Test RPC passthrough and inspect real-time ZMQ relay events.",
    logoAriaLabel: "Bitcoin Real Time — Requests and Events",
    locale: "Browser locale",
    rpcPlayground: "RPC Playground",
    paramsLabel: "params",
    typeToFilter: "Type to filter methods...",
    noMethods: "No methods found.",
    docs: "docs",
    calling: "Calling...",
    callRpc: "Call RPC",
    transportWithParams: "(JSON-RPC params supported)",
    transportNoParams: "(no params expected for this method)",
    exampleHint: "Example params auto-loaded from RPC catalog when selected.",
    paramsPlaceholder: 'JSON array, e.g. [1] or ["tb1...", 1]',
    walletPlaceholder: "Wallet context (optional), e.g. student-wallet",
    noRpcResponse: "No RPC response yet.",
    zmqTitle: "ZMQ Event Stream",
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
    homeTitle: "Bitcoin Coder Lab",
    homeSubtitle:
      "Escolha um espaço de trabalho. O laboratório RPC e o stream ZMQ ficam na página do lab.",
    cardRpcTitle: "Laboratório RPC + ZMQ",
    cardRpcDesc: "Passthrough JSON-RPC e eventos do relay em tempo real do seu nó.",
    cardSoonTitle: "Em breve",
    cardSoonDesc: "Outros guias e ferramentas aparecerão aqui.",
    title: "Bitcoin Coder Lab UI",
    subtitle: "Teste o passthrough RPC e inspecione eventos ZMQ em tempo real.",
    logoAriaLabel: "Bitcoin em tempo real — requisições e eventos",
    locale: "Idioma do navegador",
    rpcPlayground: "Laboratório RPC",
    paramsLabel: "parâmetros",
    typeToFilter: "Digite para filtrar métodos...",
    noMethods: "Nenhum método encontrado.",
    docs: "docs",
    calling: "Chamando...",
    callRpc: "Chamar RPC",
    transportWithParams: "(suporta parâmetros JSON-RPC)",
    transportNoParams: "(este método não espera parâmetros)",
    exampleHint: "Exemplo de parâmetros carregado automaticamente ao selecionar.",
    paramsPlaceholder: 'Array JSON, ex.: [1] ou ["tb1...", 1]',
    walletPlaceholder: "Contexto de wallet (opcional), ex.: student-wallet",
    noRpcResponse: "Sem resposta RPC ainda.",
    zmqTitle: "Stream de Eventos ZMQ",
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
