# zeroconf — ZeroConf Prop

Produto do hackathon **CoreCraft** (Bitcoin Coders): usar **Bitcoin Core** como backend real — **JSON-RPC**, **ZMQ** e (na próxima fase) persistência **MariaDB** para um fluxo de **prop liquidity** em que importa ver e mover fundos **antes da confirmação**.

Esta fase do repositório foca stack estável (**mainnet** prune, FastAPI, React, Caddy, MariaDB no compose) e UI/backend orientados a esse propósito — já não é um “lab” genérico só para espetar eventos ZMQ na consola.

## O que há aqui

- **`bitcoind`** em **mainnet** com **prune** (~15 GiB de blocos no `bitcoin.conf`), imagem [`bitcoin/bitcoin:31.0`](https://hub.docker.com/r/bitcoin/bitcoin).
- **Backend** FastAPI (**ZeroConf API**): passthrough RPC para o nó e relay WebSocket dos eventos ZMQ.
- **Frontend** React + Vite (**ZeroConf Prop**): entrada principal + ferramentas de operador (RPC curado e stream ZMQ).
- **Caddy**: HTTPS e proxy reverso.
- **MariaDB**: serviço no `stack/docker-compose.yml`; integração da API com schema de fluxos virá na fase seguinte.

## Layout

- **`docker-compose.yml` (raiz):** só **bitcoind** — rede Docker nomeada `bitcoin-coder-net` e volume `bitcoin-data`.
- **`stack/docker-compose.yml`:** MariaDB, backend, frontend e Caddy — iterar aqui sem recriar o nó.
- `infra/bitcoin/bitcoin.conf`: mainnet prune, RPC, ZMQ (rede Docker)
- `stack/infra/caddy/Caddyfile`: proxy HTTPS da stack da app
- `stack/backend/`: API
- `stack/frontend/`: UI

## Bitcoind (mainnet leve)

### Objetivo

- Setup de Bitcoin Core adequado a VPS pequena (ex.: free tier).
- Nó real para blocos recentes, mempool e eventos em tempo real para o produto ZeroConf.
- Disco contido com prune (não arquivo completo).

### Configuração (`bitcoin.conf`)

- `prune=15000`, `dbcache=400`, `par=1`, `server=1`, `listen=1`.
- ZMQ na porta interna **28332** (`hashblock`, `hashtx`, `rawblock`, `rawtx`, `sequence`).

### Trade-offs

- IBD da mainnet inteira ainda corre; o prune limita **armazenamento final**, não o download inicial.
- Sem `txindex` com prune: `getrawtransaction` para txs muito antigas é limitado — documentado para demos.
- Instâncias muito pequenas podem sincronizar devagar.

## Quick start

1. **Dois ficheiros de ambiente** (não commits com passwords reais):
   - **Raiz** — só o que o `bitcoind` precisa (e as mesmas `BITCOIN_RPC_*` que o backend vai ler).
   - **`stack/.env`** — MariaDB, Caddy, `SECRET_KEY`, admin bootstrap, portas `STACK_*`.

```bash
cp .env.example .env
cp stack/.env.example stack/.env
```

   Alinha **`BITCOIN_RPC_USER` / `BITCOIN_RPC_PASSWORD`** entre **`.env` na raiz** e o que o backend espera: o serviço **backend** carrega **`../.env`** e depois **`stack/.env`** (sem precisares de duplicar RPC na stack).

2. Suba o **bitcoind** na raiz (cria a rede `bitcoin-coder-net` partilhada com a stack):

```bash
docker compose up -d
```

3. Suba a **stack** em `stack/`:

```bash
cd stack && docker compose up -d --build
```

4. Saúde da API (porta **8200** no host por omissão, ver `STACK_BACKEND_HOST_PORT` em **`stack/.env`**):

```bash
curl http://localhost:8200/health
curl http://localhost:8200/rpc/getblockchaininfo
```

5. Abrir a UI: `https://localhost:9443` (mapeamento **9443→443** no Caddy; aceitar certificado interno na primeira vez).

**UI:** área pública `/` (tema “Matrix” + ZeroConf); módulo operador `/adm` com login **no backend** (utilizador na MariaDB, bcrypt, cookie HTTP-only assinado com `SECRET_KEY`). Define `ADM_BOOTSTRAP_PASSWORD` em **`stack/.env`** na primeira subida para criar o utilizador `admin`. Consola RPC + ZMQ: `/adm/node`. Redirecionamentos: `/tools/node` e `/lab/rpc` → `/adm/node`.

## HTTPS (local / IP)

O Caddy escuta **`:80` / `:443`** no contentor; no host **9080/9443** por omissão. Usa **`tls internal`**; aviso do browser é esperado sem domínio com Let’s Encrypt.

O **`stack/.env`** define **`CADDY_SITE_ADDRESSES`** e **`CADDY_DEFAULT_SNI`**. Se o host não estiver na lista: **ERR_SSL_PROTOCOL_ERROR**. Depois de editar: `cd stack && docker compose up -d --force-recreate caddy`.

Muitos **`curl`** no macOS não enviam SNI em URLs só com IPv4; define **`CADDY_DEFAULT_SNI`** coerente (ver **`stack/.env.example`**). Exemplo edge: `stack/infra/caddy/Caddyfile.edge.example`.

## Testes (backend)

```bash
cd stack
docker compose exec -T backend pip install -r requirements-dev.txt
docker compose exec -T backend sh -lc 'PYTHONPATH=/app pytest tests/'
```

## Segurança e mainnet

- **Mainnet** envolve valor real: montantes mínimos, **carteira dedicada** ao operador, backups conscientes.
- **Não** expor RPC Bitcoin à Internet sem proteção (modelo actual: RPC só na rede Docker).
- **Não** commitar passwords RPC, **SECRET_KEY**, `ADM_BOOTSTRAP_PASSWORD` ou segredos — `.env` / `stack/.env` locais e os `.env.example` só com placeholders.
- **Admin web:** senha nunca vai no bundle do Vite; só **HTTPS** em produção e `COOKIE_SECURE=1` atrás do Caddy com TLS real.

## Notas operacionais

- **Dois `.env`:** na **raiz** só variáveis do `docker-compose` do **bitcoind** + credenciais RPC partilhadas; em **`stack/.env`** toda a config da app (MariaDB, Caddy, `SECRET_KEY`, portas). Se tinhas um `.env` único antigo, parte o conteúdo para estes dois ficheiros (ou copia os exemplos e volta a preencher).
- **Dois composes:** `docker compose down` **só em `stack/`** derruba MariaDB, API, frontend e Caddy; o **bitcoind** na raiz e o volume **bitcoin-data** mantêm-se.
- **Nomes Docker:** projecto Compose `stack`; contentores `stack-mariadb`, `stack-backend`, etc. Contentores antigos noutros nomes podem colidir nas portas (**8200**, **5177**, **9080**, **9443**).
- Rede **`bitcoin-coder-net`** e volumes nomeados (`bitcoin-coder_*`) mantêm compatibilidade com deploys anteriores do mesmo repositório.

## Roadmap (próxima fase)

- Modelos **MariaDB** (`flows` / eventos), endpoints de domínio, fluxo guiado na UI: endereço → pagamento na mempool (ZMQ) → segunda tx `sendrawtransaction` → estados persistidos.
