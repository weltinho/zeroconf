from __future__ import annotations

from typing import Optional
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Permite variáveis extras no ambiente sem quebrar inicialização.
    model_config = SettingsConfigDict(extra="ignore")

    # Host base do bitcoind, compartilhado entre RPC e ZMQ.
    bitcoin_host: str = "bitcoind"
    # Credenciais e porta do JSON-RPC do bitcoind.
    bitcoin_rpc_user: str = "bitcoinrpc"
    bitcoin_rpc_password: str = "bitcoinrpcdevpassword"
    bitcoin_rpc_port: int = 8332
    # Rede usada (signet/regtest/testnet/main).
    bitcoin_network: str = "main"
    # Carteira nomeada do operador (RPC `/wallet/<nome>`). Vazio = não expõe dados de carteira no painel.
    bitcoin_operator_wallet: str = ""

    # Porta ZMQ onde o bitcoind publica todos os zmqpub* configurados no bitcoin.conf.
    bitcoin_zmq_port: int = 28332
    # Lista CSV: tópicos que o bitcoind publica (referência; o relay usa `bitcoin_zmq_relay_topics`).
    bitcoin_zmq_topics: str = "hashblock,hashtx,rawblock,rawtx,sequence"
    # Tópicos retransmitidos ao WebSocket admin — só bloco novo + txid no mempool (leve).
    bitcoin_zmq_relay_topics: str = "hashblock,hashtx"
    # Filtro de hashtx por carteira do operador (gettransaction no wallet RPC).
    zmq_filter_wallet_txs_only: bool = True
    # TTL do cache local de relevância de txid (evita repetir RPC para o mesmo txid).
    zmq_wallet_filter_cache_ttl_sec: int = 20
    # Limite de concorrência para checagem RPC de relevância de txid.
    zmq_wallet_filter_max_concurrency: int = 6
    # Tamanho máximo da fila interna de hashtx pendentes para filtro.
    zmq_wallet_filter_max_pending: int = 300
    # Chave de feature flag para ativar/desativar relay de eventos em tempo real.
    zmq_enabled: bool = True

    # MariaDB (admin auth + futuros domínios).
    mariadb_host: str = "mariadb"
    mariadb_port: int = 3306
    mariadb_user: str = "stack"
    mariadb_password: str = "stackdevpassword"
    mariadb_database: str = "stack"

    # Cookie de sessão admin (assinado); não commitar valor real.
    secret_key: str = "dev-secret-change-me-use-openssl-rand-hex-32"
    cookie_secure: bool = False
    adm_cookie_name: str = "zeroconf_adm"

    # Primeiro utilizador admin criado automaticamente se a tabela estiver vazia.
    adm_bootstrap_username: str = "admin"
    adm_bootstrap_password: Optional[str] = None

    # Boltz — integração com submarine swaps (BTC on-chain -> Lightning).
    # URL base da API Boltz v2 (ex.: https://api.boltz.exchange para mainnet).
    boltz_base_url: str = "https://api.boltz.exchange"
    # Timeout HTTP em segundos para chamadas à Boltz.
    boltz_timeout_sec: int = 20
    # Feature flag: desativa integração Boltz sem remover código.
    boltz_enabled: bool = True
    # Endereço reservado para taxa/depósito operacional (índice lógico 0 no painel).
    bitcoin_fee_address_label: str = "fee-index-0"

    @property
    def async_database_url(self) -> str:
        pw = quote_plus(self.mariadb_password)
        # aiomysql = driver puro Python (sem gcc na imagem slim); não usar asyncmy aqui.
        # connect_timeout evita ficar pendurado minutos se MariaDB/firewall não responder (TCP hang).
        return (
            f"mysql+aiomysql://{self.mariadb_user}:{pw}"
            f"@{self.mariadb_host}:{self.mariadb_port}/{self.mariadb_database}"
            "?connect_timeout=10"
        )

    @property
    def rpc_url(self) -> str:
        # URL final usada pelo cliente HTTP JSON-RPC.
        return f"http://{self.bitcoin_host}:{self.bitcoin_rpc_port}"

    @property
    def bitcoin_zmq_endpoint(self) -> str:
        # Endpoint único (PUB) para todos os notificadores ZMQ do bitcoind.
        return f"tcp://{self.bitcoin_host}:{self.bitcoin_zmq_port}"

    @property
    def bitcoin_zmq_topic_list(self) -> tuple[str, ...]:
        """Legado / referência — não usado diretamente pelo relay da consola."""
        return tuple(
            part.strip()
            for part in self.bitcoin_zmq_topics.split(",")
            if part.strip()
        )

    @property
    def bitcoin_zmq_relay_topic_list(self) -> tuple[str, ...]:
        """Tópicos SUB no relay ZMQ → WebSocket da consola do operador."""
        return tuple(
            part.strip()
            for part in self.bitcoin_zmq_relay_topics.split(",")
            if part.strip()
        )


# Instância singleton carregada de env vars automaticamente.
settings = Settings()
