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

    # Porta ZMQ onde o bitcoind publica todos os zmqpub* configurados no bitcoin.conf.
    bitcoin_zmq_port: int = 28332
    # Lista CSV de tópicos SUB (ex.: hashblock,hashtx,rawblock,rawtx,sequence).
    bitcoin_zmq_topics: str = "hashblock,hashtx,rawblock,rawtx,sequence"
    # Chave de feature flag para ativar/desativar relay de eventos em tempo real.
    zmq_enabled: bool = True

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
        # Tópicos normalizados para setsockopt(ZMQ_SUBSCRIBE, ...).
        return tuple(
            part.strip()
            for part in self.bitcoin_zmq_topics.split(",")
            if part.strip()
        )


# Instância singleton carregada de env vars automaticamente.
settings = Settings()
