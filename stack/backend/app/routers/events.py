from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.deps import zmq_relay
from app.settings import settings

router = APIRouter(tags=["events"])


@router.websocket("/ws/events")
async def websocket_events(websocket: WebSocket) -> None:
    if not settings.zmq_enabled:
        await websocket.close(code=1008, reason="ZMQ relay disabled")
        return

    await websocket.accept()
    await zmq_relay.add_client(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await zmq_relay.remove_client(websocket)
