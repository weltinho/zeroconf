from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.bitcoin_rpc import BitcoinRpcClient, BitcoinRpcError
from app.settings import settings
from app.zmq_events import ZmqEventRelay

# Instancia principal da API HTTP/WebSocket.
app = FastAPI(title="bitcoin-coder API", version="0.1.0")
# Cliente que conversa com o bitcoind via JSON-RPC (HTTP).
rpc = BitcoinRpcClient()
# Relay que escuta ZMQ do bitcoind e retransmite para clientes WebSocket.
zmq_relay = ZmqEventRelay()


class RpcCallRequest(BaseModel):
    # Lista posicional de parâmetros JSON-RPC.
    params: list[object] = []


@app.get("/health")
async def health() -> dict[str, str]:
    # Endpoint simples para verificar se a API subiu.
    # "network" ajuda a confirmar se estamos em signet/regtest/testnet/mainnet.
    return {"status": "ok", "network": settings.bitcoin_network}


# Endpoint para passar métodos RPC para o bitcoind.(Assim nosso app vai ter os mesmos metodos do bitcoind) =P
@app.get("/rpc/{method}")
async def passthrough_rpc(
    method: str, wallet: str | None = Query(default=None)
) -> dict[str, object]:
    # "pass-through": recebe o nome do método e encaminha para o bitcoind.
    # Exemplo: /rpc/getblockchaininfo
    try:
        result = await rpc.call(method, wallet=wallet)
        # Retorno padronizado para o frontend/consumidor.
        return {"method": method, "wallet": wallet, "result": result}
    except BitcoinRpcError as exc:
        # Erro funcional do JSON-RPC (método inválido, parâmetro incorreto etc).
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        # Falha de infraestrutura/comunicação com o node.
        raise HTTPException(status_code=502, detail=f"RPC unavailable: {exc}") from exc


@app.post("/rpc/{method}")
async def passthrough_rpc_with_params(
    method: str,
    payload: RpcCallRequest,
    wallet: str | None = Query(default=None),
) -> dict[str, object]:
    # Variante com body JSON para métodos que recebem params.
    try:
        result = await rpc.call(method, payload.params, wallet=wallet)
        return {
            "method": method,
            "wallet": wallet,
            "params": payload.params,
            "result": result,
        }
    except BitcoinRpcError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"RPC unavailable: {exc}") from exc


# Endpoint para capturar eventos do ZMQ do bitcoind. Assim podemos receber eventos do bitcoind em tempo real, de forma assincrona.
# e idêntica ao zmq do próprio bitcoind, apenas retransmitindo para o cliente WebSocket.
@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket) -> None:
    # Endpoint de push em tempo real para eventos vindos do ZMQ.
    # Só funciona se a feature estiver habilitada em settings.
    if not settings.zmq_enabled:
        # 1008 = Policy Violation (bom para recusar conexão por regra de app).
        await websocket.close(code=1008, reason="ZMQ relay disabled")
        return

    # Aceita o handshake WebSocket.
    await websocket.accept()
    # Registra cliente para começar a receber broadcast de eventos.
    await zmq_relay.add_client(websocket)
    try:
        while True:
            # Mantém conexão viva enquanto cliente estiver conectado.
            # Se o cliente cair/fechar aba, cai no WebSocketDisconnect.
            await websocket.receive_text()
    except WebSocketDisconnect:
        # Desconexão esperada do lado do cliente.
        pass
    finally:
        # Garante limpeza da lista de clientes mesmo em erro.
        await zmq_relay.remove_client(websocket)


@app.on_event("startup")
async def startup_event() -> None:
    # Ao iniciar API, inicia consumidor ZMQ em background.
    await zmq_relay.start()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    # Ordem de desligamento:
    # 1) para relay/broadcast ZMQ e fecha conexões WebSocket
    # 2) fecha cliente HTTP do JSON-RPC
    await zmq_relay.stop()
    await rpc.aclose()
