# AssumeUTXO — arranque rápido com snapshot UTXO (Bitcoin Core 31)

Este projeto usa a imagem `bitcoin/bitcoin:31.0`. O **assumeUTXO** não se activa com uma linha no `bitcoin.conf`: é preciso um ficheiro de snapshot compatível e o RPC **`loadtxoutset`**.

## O que o Core valida sozinho

Para cada altura suportada, o binário traz **hardcoded** o hash do UTXO serializado. Se o ficheiro não bater certo, o `loadtxoutset` falha — não precisas de verificar SHA manualmente, mas o ficheiro tem de corresponder **exactamente** a uma altura listada na tua versão.

### Mainnet (Core 31.x — exemplos)

Alturas com snapshot em `chainparams`: **840 000**, **880 000**, **910 000**, **935 000**. Quanto mais recente o snapshot, menos blocos tens de ir buscar depois até ao tip.

### Signet (Core 31.x — rede `[signet]` no teu `bitcoin.conf`)

Alturas suportadas: **160 000** e **290 000**.

Para signet **não há** um “mirror oficial” único como torrent da mainnet; o caminho típico é **`dumptxoutset`** no **teu** nó signet já sincronizado (ex.: na DigitalOcean) e copiar o `.dat` para a nova máquina.

---

## Fluxo recomendado (Docker na raiz do repo)

Alinhado ao guia típico (Core ≥28, torrent/ficheiro `.dat` válido):

1. Arranca **sem ligação a peers** (`-maxconnections=0`) para o `loadtxoutset` não competir com IBD descarregar blocos ao mesmo tempo.
2. **`loadtxoutset`** com ficheiro completo e `-rpcclienttimeout=0` (pode demorar muito).
3. Reinicia com **ligações normais**; o tip “salta” para a altura do snapshot e o nó fica usável enquanto valida desde o génesis **em fundo**.

No compose da raiz: no `.env`, define `BITCOIN_MAX_CONNECTIONS=0` antes de `docker compose up -d`, corre o `loadtxoutset`, depois **remove** essa linha (ou repõe `125`) e volta a `docker compose up -d`.

### 1) Arranca o `bitcoind` com dados “quase vazios”

Idealmente **volume novo** ou pasta sem `chainstate`/`blocks` corrompidos. O `bitcoin.conf` pode manter `prune=` — o assumeUTXO funciona com prune (ver nota de espaço abaixo).

### 2) Coloca o snapshot onde o container veja o ficheiro

Coloca o `.dat` na pasta **`snapshots/`** na raiz do repo no host (cria com `mkdir -p snapshots`). Na VPS com repo em `/var/projetos/bitcoind-realtime-lab`, isso é `.../bitcoind-realtime-lab/snapshots/`. Exemplo de nomes:

```text
./snapshots/utxo-935000.dat
```

No `docker-compose.yml` do **bitcoind** monta-se essa pasta em `/mnt/snapshots` (read-only). Assim evitas o bug do Docker: bind de um **ficheiro** que ainda não existe no host vira um **directório** vazio dentro do container e o `loadtxoutset` rebenta ao ler.

Montagem no `docker-compose.yml` da raiz (comenta ou remove quando não precisares):

```yaml
volumes:
  - ./snapshots:/mnt/snapshots:ro
```

### 3) Carrega o snapshot (timeout infinito no cliente RPC)

Com credenciais do teu `.env` (ou `-rpcuser` / `-rpcpassword`):

```bash
docker compose exec bitcoind bitcoin-cli \
  -rpcclienttimeout=0 \
  -rpcuser="$BITCOIN_RPC_USER" -rpcpassword="$BITCOIN_RPC_PASSWORD" \
  loadtxoutset /mnt/snapshots/utxo-935000.dat
```

Ajusta o último segmento ao nome real do ficheiro em `snapshots/` (ex. `utxo-935000.dat`, signet `utxo-290000.dat`).

### 4) Acompanha o estado

```bash
docker compose exec bitcoind bitcoin-cli getchainstates
```

Vais ver **dois** estados em paralelo: o da snapshot e o da validação em fundo — é normal.

### 5) Espaço em disco (importante)

Com **prune**, o Core pode usar **mais** espaço temporário durante a validação em fundo (dois `chainstate` grandes). O documento oficial avisa que pode ultrapassar o mínimo habitual de prune — prevê margem no volume.

### 6) Depois de carregar

Podes **apagar o ficheiro snapshot no host** para poupar espaço (o Core já ingere o conteúdo). Remove também a linha do volume `.../snapshots:/mnt/snapshots` do `docker-compose.yml` se já não precisares.

---

## Obter o ficheiro

| Rede    | Origem típica |
|---------|----------------|
| Mainnet | Torrent / mirrors da comunidade para alturas **oficialmente listadas** no Core (ex.: ficheiros tipo `utxo-935000.dat`). Verifica que a **altura** do nome do ficheiro coincide com uma entrada suportada pelo teu Core 31. |
| Signet  | No teu nó já sincronizado: `bitcoin-cli -rpcclienttimeout=0 dumptxoutset /caminho/saida.dat rollback` com altura compatível (ex. rollback até **290 000**). |

**Confiança:** em mainnet, muitos usam mirrors comunitários; o hash é validado pelo Core, mas o **fornecedor do ficheiro** ainda é uma escolha tua (integridade do download, MITM, etc.).

---

## Gerar snapshot no teu nó (DigitalOcean) — exemplo Signet 290 000

No nó **já** com altura ≥ 290 000:

```bash
bitcoin-cli -rpcclienttimeout=0 -named dumptxoutset /tmp/utxo-290000-signet.dat rollback height=290000
```

Copia o ficheiro para `snapshots/` na raiz do repo no host (scp/rsync) e corre `loadtxoutset` com o path em `/mnt/snapshots/...` como acima.

---

## Referências

- Documentação upstream: `doc/assumeutxo.md` no repositório [bitcoin/bitcoin](https://github.com/bitcoin/bitcoin/blob/master/doc/assumeutxo.md)
- RPC: `loadtxoutset`, `dumptxoutset`, `getchainstates`
