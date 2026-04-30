# bitcoind-realtime-lab

Playground para **JSON-RPC** e **eventos ZMQ** (`hashblock`, `hashtx`, `rawblock`, `rawtx`, `sequence`) de um nó Bitcoin Core, com stack pronta em Docker.

- **`bitcoind`** em **mainnet** com **prune** (~15 GiB de blocos no `bitcoin.conf`), imagem [`bitcoin/bitcoin:31.0`](https://hub.docker.com/r/bitcoin/bitcoin) (multi-arquitetura).
- **Backend** Python (FastAPI): repasse de RPC para o nó e relay WebSocket dos eventos ZMQ.
- **Frontend** React + Vite: interface didática para testar RPC e visualizar eventos.
- **Caddy**: HTTPS e proxy reverso entre navegador e serviços.

## Layout

- `docker-compose.yml`: bitcoind, backend, frontend, Caddy
- `infra/bitcoin/bitcoin.conf`: mainnet prune, RPC, ZMQ (rede Docker)
- `infra/caddy/Caddyfile`: proxy HTTPS
- `backend/`: API
- `frontend/`: UI de apoio

## Bitcoind (mainnet leve)

Este lab foi ajustado para **rodar mainnet de forma mais leve** em VPS pequena (ex.: AWS free tier), sem abrir mão de um nó real para os **blocos mais recentes** e para o fluxo didático de RPC + ZMQ.

### Objetivo

- Mostrar um setup de Bitcoin Core que cabe em ambiente barato/grátis.
- Entregar uma experiência "mainnet de respeito" para monitorar tip, mempool e eventos em tempo real. E demais coisas que podem evoluir disto
- Evitar o custo de disco de um nó archival completo.

### Configuração usada no `bitcoin.conf`

- `prune=15000`: mantém aproximadamente 15 GiB de blocos no disco.
- `dbcache=400`: reduz pressão de memória em instâncias pequenas.
- `par=1`: limita paralelismo para suavizar pico de CPU.
- `server=1` e `listen=1`: RPC ativo e P2P habilitado.
- ZMQ em `28332` para eventos (`hashblock`, `hashtx`, `rawblock`, `rawtx`, `sequence`).

### Trade-offs (importante para iniciantes)

- O nó continua a fazer IBD da mainnet inteira; o prune reduz **armazenamento final**, não o download inicial.
- `txindex` não pode ser usado com prune; consultas históricas muito antigas ficam limitadas.
- Em AWS muito pequena (`t3/t4g micro`), sincronização pode ser lenta e sensível a CPU/RAM.
- Mesmo com prune, reserve margem de disco para SO, Docker, chainstate e logs.

## Quick start

1. Copie o env de exemplo. **`BITCOIN_RPC_USER` / `BITCOIN_RPC_PASSWORD`** vão para o **backend** e, pelo `docker-compose`, também para o **bitcoind** (`-rpcuser` / `-rpcpassword`) — uma fonte só (o `bitcoin.conf` fica só com rede/ZMQ/bind).

```bash
cp .env.example .env
```

2. Suba tudo (ou só os serviços que precisar):

```bash
docker compose up -d --build
```

3. Saúde da API:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/rpc/getblockchaininfo
```

4. Abra a UI no navegador:

`https://localhost` (aceite o certificado local do Caddy na primeira vez).

## HTTPS (local / IP)

O Caddy escuta em **`:80` / `:443`** (qualquer `Host`), para o Docker encaminhar tráfego da EC2 pelo IP público. Usa **`tls internal`**; o aviso do navegador é esperado sem domínio com Let’s Encrypt. Em produção, prefira **domínio + ACME**.

Para **`https://<IPv4-público>`** (ex. na EC2), o certificado interno tem de incluir esse IP. No `.env`, defina **`CADDY_SITE_ADDRESSES`** com o IP no fim da lista (ver `.env.example`). Depois: `docker compose up -d --force-recreate caddy`.

Muitos clientes **`curl`** (p.ex. LibreSSL no macOS) **não enviam SNI** em URLs só com IPv4; o Caddy pode responder com erro TLS. Defina também **`CADDY_DEFAULT_SNI`** com o **mesmo** IPv4 público (ver `.env.example`).

## Testes (backend)

Dentro do container (como no dia a dia do projeto):

```bash
docker compose exec -T backend pip install -r requirements-dev.txt
docker compose exec -T backend sh -lc 'PYTHONPATH=/app pytest tests/'
```

## Notas

- **Mainnet**: na primeira subida o nó faz **IBD** (download grande; prune só limita o disco final, não o tráfego inicial). **Sem `txindex`** (incompatível com prune): `getrawtransaction` é limitado para tx muito antigas.
- **Portas default mainnet:** RPC **8332** (só rede Docker), P2P **8333** (`8333:8333` no host). ZMQ em **28332** (`BITCOIN_ZMQ_PORT` no backend).
- Ao mudar de **rede** (main/signet/etc.), use **volume novo** para `bitcoin-data` ou apague o antigo — dados de chain são incompatíveis.
- RPC e ZMQ do `bitcoind` ficam na **rede Docker**; o host expõe **80/443** (Caddy) e **8333** (P2P) se precisar de peer externo.
