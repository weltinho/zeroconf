# Plano: limites “Enviar Mín / Máx” (Boltz submarine)

Objetivo: reproduzir programaticamente os valores que a web da Boltz mostra para **montante on-chain a enviar** (ex.: **Enviar Mín** e **Máx** em sats), alinhado com [Swap limits & fees](https://api.docs.boltz.exchange/swap-limits-and-fees.html).

## Endpoint

- `GET https://api.boltz.exchange/v2/swap/submarine`  
  Resposta: objeto por par `from → to` (ex.: chave aninhada `BTC.BTC` para BTC on-chain → LN na mesma moeda).

Passos no código:

1. Fazer o GET (idealmente em cada sessão de troca ou com cache curto — fees mudam).
2. Escolher o par correto (`from`, `to`).
3. Ler `limits`, `fees` e `hash` (`pairHash` recomendado no `POST`).

## O que são “mínimo” e “máximo” na API

Para **submarine swaps**, os limites aplicam-se ao **valor da invoice Lightning** (em sats), não ao valor bruto on-chain:

| Campo API       | Significado |
|-----------------|-------------|
| `limits.minimal`  | Invoice mínima (sats). |
| `limits.maximal`  | Invoice máxima (sats). |
| `limits.maximalZeroConf` | Teto para aceitar lockup sem confirmação (quando > 0). |
| `limits.minimalBatched` | (Quando existe) mínimo alternativo para swaps em batch. |

Isto está explícito na doc Boltz: limites submarine são **enforced on invoice amount**.

## Da invoice para “quanto enviar on-chain” (igual à UI)

A doc Boltz define (submarine), com `percentageFeeRate = fees.percentage / 100` (ex.: `0.1` → `0.001`):

```text
percentageFee = ceil(invoiceAmount × percentageFeeRate)
amountToSend  = invoiceAmount + minerFee + percentageFee
```

`minerFee` vem de `fees.minerFees` no par (componente usado nesta fórmula para o total a enviar).

### Enviar Mín (como no ecrã)

Usar o **invoice mínimo** permitido:

```text
invoiceMin    = limits.minimal
percentageFee = ceil(invoiceMin × (fees.percentage / 100))
enviarMin     = invoiceMin + fees.minerFees + percentageFee
```

Exemplo coerente com a UI: invoice mín. `25_000` sats, `minerFees = 378`, taxa `0,1%` → `25 + 378 + 25_000 = 25_403` sats a enviar.

### Enviar Máx (como no ecrã)

```text
invoiceMax    = limits.maximal
percentageFee = ceil(invoiceMax × (fees.percentage / 100))
enviarMax     = invoiceMax + fees.minerFees + percentageFee
```

Pequenas diferenças face ao site são normais se o `minerFees` ou os limites tiverem sido atualizados entre o teu GET e o GET da interface.

## Fluxo já acordado (resumo)

1. **Cotação / limites:** `GET /v2/swap/submarine` + fórmulas acima → mostrar `enviarMin`, `enviarMax`, taxas e opcionalmente `pairHash`.
2. **Criar swap:** `POST /v2/swap/submarine` com BOLT11, `refundPublicKey`, `from`/`to`, `pairHash`.
3. **Monitorizar:** `wss://api.boltz.exchange/v2/ws` (`swap.update`) e/ou `GET /v2/swap/{id}`.

## Notas

- **Arredondamentos:** percentagem sempre `ceil`, como na doc Boltz.
- **LNURL / BOLT12 na UI:** resolvem para uma BOLT11; a API de criação continua a precisar de **invoice** válida.
- **Routing fee** mostrada na web (ex. ppm) é política de produto da Boltz para pagamento LN; o GET dos pares foca **limites + fees de par**; não substituir o `POST` pelo cálculo local — o lockup exato vem na resposta do create.
