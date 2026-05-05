# Notas — integração Boltz (API v2)

Notas de trabalho sobre a API pública da [Boltz](https://boltz.exchange/) para swaps atómicos, em especial **BTC on-chain → Lightning** (submarine swap). Documentação oficial: [Boltz API](https://api.docs.boltz.exchange/), [REST API v2](https://api.docs.boltz.exchange/api-v2.html), [Swagger](https://api.boltz.exchange/swagger), [Swap limits & fees](https://api.docs.boltz.exchange/swap-limits-and-fees.html), [Swap types & states](https://api.docs.boltz.exchange/lifecycle.html).

---

## Instâncias

- **Mainnet:** `https://api.boltz.exchange/`  
- **WebSocket mainnet:** `wss://api.boltz.exchange/v2/ws`  
- **Tor:** ver [Introduction](https://api.docs.boltz.exchange/) (path `/api/` no onion).  
- **Regtest:** para desenvolvimento local (ex. [Boltz regtest](https://github.com/BoltzExchange/regtest)); testnet público está deprecado na doc.

---

## Tipos de swap

| Tipo | Direção | Uso típico |
|------|---------|------------|
| **Submarine** | Chain → Lightning | Enviar BTC on-chain, receber no LN (invoice). |
| **Reverse** | Lightning → Chain | Pagar invoice Boltz, receber BTC on-chain. |
| **Chain** | Chain → Chain | Entre cadeias (ex. BTC ↔ Liquid), sem LN. |

Para “trocar bitcoin por Lightning”, o fluxo relevante é o **submarine**.

---

## Submarine swap (ideia)

1. O utilizador fornece uma **BOLT11** pelo valor que quer receber no LN (respeitando limites do par).  
2. O cliente gera chaves e chama `POST /v2/swap/submarine` com `invoice`, `from`/`to`, `refundPublicKey` e, recomendado, `pairHash`.  
3. A resposta traz endereço de **lockup**, árvore Taproot (`swapTree`), timeouts, id do swap, etc.  
4. O utilizador envia BTC on-chain para o lockup.  
5. A Boltz paga a invoice LN; depois reivindica o lock on-chain (com possível passo de **claim cooperativo** MuSig em swaps Taproot modernos).  
6. Estados e falhas (expirar, invoice não paga, refund) estão na doc [lifecycle](https://api.docs.boltz.exchange/lifecycle.html).

Os exemplos oficiais em TypeScript usam `boltz-core`, `@vulpemventures/secp256k1-zkp`, etc.; a doc avisa que exemplos são educativos e não cobrem todos os edge cases.

---

## Endpoints úteis (v2)

| Ação | Método | Caminho (base mainnet) |
|------|--------|-------------------------|
| Pares submarine (limites, fees %, minerFees, `hash`) | GET | `/v2/swap/submarine` |
| Criar submarine swap | POST | `/v2/swap/submarine` |
| Estado do swap | GET | `/v2/swap/{id}` |
| Subscrição em tempo real | WebSocket | `/v2/ws`, canal `swap.update` |
| Claim cooperativo (submarine) | GET/POST | `/v2/swap/submarine/{id}/claim` |

Outros caminhos por swap id (invoice, refund, transação, preimage, etc.) aparecem no Swagger — confirmar sempre a versão em produção.

---

## Invoice vs LNURL / BOLT12

- O corpo do `POST /v2/swap/submarine` usa uma **invoice BOLT11** (`invoice`).  
- **LNURL-Pay** e **BOLT12** na UI resolvem para uma invoice; no backend, primeiro resolves o destino → obténs BOLT11 → envias à Boltz.

---

## Taxas e limites

- **Taxa percentual:** para submarine, calculada sobre o **montante da invoice** (não sobre o total on-chain).  
- **Miner fee (claim):** incluída no total que o utilizador envia on-chain (ver tabela na doc de fees).  
- **Fórmulas** e arredondamentos (`ceil` na percentagem) estão em [Swap limits & fees](https://api.docs.boltz.exchange/swap-limits-and-fees.html).  
- Os campos `limits.minimal` / `limits.maximal` no GET submarine referem-se ao **valor da invoice**; a UI “Enviar Mín / Máx” soma taxas ao montante da invoice. Detalhe passo a passo e fórmulas para espelhar a UI: [`docs/planos-boltz-submarine.md`](planos-boltz-submarine.md).

---

## `pairHash`

Cada par devolve um `hash` que resume fees e limites atuais. Incluir `pairHash` no `POST` evita criar swaps com dados de fee desatualizados; se falhar com “invalid pair hash”, voltar a fazer GET e atualizar.

---

## Monitorização

- **WebSocket:** `op: subscribe`, `channel: swap.update`, `args: [swapId]`.  
- **Polling:** `GET /v2/swap/{id}`.  
Mensagens de update alinham com o que o GET devolve (ver doc WebSocket na API v2).

---

## Segurança e cliente

- Validar **endereço de lockup**, **swap tree** e parâmetros com **boltz-core** (ou equivalente), como nos exemplos Go/TS — não confiar só no JSON.  
- Em estados como `transaction.claim.pending`, pode ser necessária co-assinatura cooperativa; seguir GET/POST de claim da doc.

---

## Integração em duas fases (produto)

1. **Cotação:** `GET /v2/swap/submarine` + fórmulas → mostrar taxas, líquido LN esperado, limites, `enviarMin`/`enviarMax` (ver plano de limites).  
2. **Execução:** invoice válida → `POST /v2/swap/submarine` → enviar on-chain conforme resposta → monitorizar até estado terminal ou refund.

---

## Ligações rápidas

- [Claim & refund transactions](https://api.docs.boltz.exchange/claiming-swaps.html)  
- [0-conf](https://api.docs.boltz.exchange/0-conf.html)  
- `extraFees` opcional no create (markup da integração): ver doc de fees.
