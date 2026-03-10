"""
FastAPI Backend per Real-Time Mocap Telemetry
Gestisce WebSocket per ingestion dati e REST API
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import json
import asyncio
from datetime import datetime
from typing import Dict, Set
import logging

from app.models import MocapFrame, SensorStatus
from app.processing import MotionProcessor
from app.db import DataStore

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Inizializza FastAPI
app = FastAPI(
    title="Mocap Telemetry Backend",
    description="Real-time motion capture telemetry system",
    version="0.1.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Globali
connected_clients: Set[WebSocket] = set()
processor = MotionProcessor()
data_store = DataStore()
sensor_status: Dict[str, SensorStatus] = {}


@app.on_event("startup")
async def startup():
    """Inizializzazione al startup"""
    logger.info("🚀 Backend Mocap Telemetry avviato")


@app.on_event("shutdown")
async def shutdown():
    """Cleanup al shutdown"""
    logger.info("🛑 Backend Mocap Telemetry fermato")


@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "connected_clients": len(connected_clients),
        "sensors": sensor_status
    }


@app.get("/api/sensors")
async def get_sensors():
    """Restituisce lo stato di tutti i sensori"""
    return {
        "sensors": sensor_status,
        "count": len(sensor_status)
    }


@app.get("/api/history")
async def get_history(joint: str = "head", limit: int = 100):
    """Restituisce lo storico di un joint"""
    history = data_store.get_joint_history(joint, limit)
    return {
        "joint": joint,
        "data": history,
        "count": len(history)
    }


@app.websocket("/ws/sensor")
async def websocket_sensor_endpoint(websocket: WebSocket):
    """WebSocket per ricevere dati dai sensori"""
    await websocket.accept()
    connected_clients.add(websocket)
    
    logger.info(f"✓ Sensore connesso | Client totali: {len(connected_clients)}")
    
    try:
        while True:
            # Ricevi frame dal sensore
            data = await websocket.receive_text()
            frame_dict = json.loads(data)
            
            # Parse al modello
            frame = MocapFrame(**frame_dict)
            
            # Aggiorna status sensore
            if frame.sensor_id not in sensor_status:
                sensor_status[frame.sensor_id] = SensorStatus(sensor_id=frame.sensor_id)
            
            sensor_status[frame.sensor_id].last_frame = frame
            sensor_status[frame.sensor_id].frame_count += 1
            sensor_status[frame.sensor_id].is_online = True
            
            # Processa il frame (smoothing, velocità, etc.)
            processed_frame = processor.process(frame)
            
            # Salva nel database
            await data_store.save_frame(processed_frame)
            
            # Broadcast a tutti i client connessi (frontend)
            await broadcast_to_clients(processed_frame)
            
            # Log (ogni 30 frame = 1 secondo a 30 Hz)
            if sensor_status[frame.sensor_id].frame_count % 30 == 0:
                logger.info(
                    f"📊 {frame.sensor_id} | Frame: {sensor_status[frame.sensor_id].frame_count} | "
                    f"Head: {frame.joints['head']}"
                )
    
    except WebSocketDisconnect:
        connected_clients.discard(websocket)
        logger.warning(f"✗ Sensore disconnesso | Client totali: {len(connected_clients)}")
        if frame and frame.sensor_id in sensor_status:
            sensor_status[frame.sensor_id].is_online = False
    
    except json.JSONDecodeError as e:
        logger.error(f"✗ Errore parsing JSON: {e}")
        await websocket.close(code=1003, reason="Invalid JSON")
    
    except Exception as e:
        logger.error(f"✗ Errore WebSocket: {e}")


@app.websocket("/ws/dashboard")
async def websocket_dashboard_endpoint(websocket: WebSocket):
    """WebSocket per inviare dati reali-time al frontend"""
    await websocket.accept()
    connected_clients.add(websocket)
    
    logger.info(f"📱 Dashboard connesso | Client totali: {len(connected_clients)}")
    
    try:
        while True:
            # Mantieni la connessione aperta
            await asyncio.sleep(1)
    
    except WebSocketDisconnect:
        connected_clients.discard(websocket)
        logger.info(f"📱 Dashboard disconnesso | Client totali: {len(connected_clients)}")


async def broadcast_to_clients(frame: Dict):
    """Invia il frame a tutti i client connessi (frontend)"""
    if not connected_clients:
        return
    
    message = json.dumps({
        "type": "mocap_frame",
        "data": frame.dict() if hasattr(frame, 'dict') else frame
    })
    
    # Invia a tutti i client (specialmente dashboard)
    disconnected = set()
    for client in connected_clients:
        try:
            # Invia solo ai dashboard, non ai sensori
            if client.client:
                await client.send_text(message)
        except Exception as e:
            disconnected.add(client)
            logger.warning(f"Errore invio broadcast: {e}")
    
    # Rimuovi client disconnessi
    for client in disconnected:
        connected_clients.discard(client)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        ws_ping_interval=20
    )
