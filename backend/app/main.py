####################
#  main.py
#
# FastAPI Backend for Real-Time Mocap Telemetry
# Handles WebSocket for data ingestion and REST API
#
# Author: Michelangelo Guaitolini, 11.03.2026
####################

__doc__ = """
FastAPI Backend for Real-Time Mocap Telemetry
Handles WebSocket for data ingestion and REST API
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
    """Initialization at startup"""
    logger.info("🚀 Mocap Telemetry Backend started")


@app.on_event("shutdown")
async def shutdown():
    """Cleanup at shutdown"""
    logger.info("🛑 Mocap Telemetry Backend stopped")


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
    """Return status of all sensors"""
    return {
        "sensors": sensor_status,
        "count": len(sensor_status)
    }


@app.get("/api/history")
async def get_history(joint: str = "head", limit: int = 100):
    """Return history of a joint"""
    history = data_store.get_joint_history(joint, limit)
    return {
        "joint": joint,
        "data": history,
        "count": len(history)
    }


@app.websocket("/ws/sensor")
async def websocket_sensor_endpoint(websocket: WebSocket):
    """WebSocket to receive data from sensors"""
    await websocket.accept()
    connected_clients.add(websocket)
    
    logger.info(f"✓ Sensor connected | Total clients: {len(connected_clients)}")
    
    try:
        while True:
            # Receive frame from sensor
            data = await websocket.receive_text()
            frame_dict = json.loads(data)
            
            # Parse to model
            frame = MocapFrame(**frame_dict)
            
            # Update sensor status
            if frame.sensor_id not in sensor_status:
                sensor_status[frame.sensor_id] = SensorStatus(sensor_id=frame.sensor_id)
            
            sensor_status[frame.sensor_id].last_frame = frame
            sensor_status[frame.sensor_id].frame_count += 1
            sensor_status[frame.sensor_id].is_online = True
            
            # Process the frame (smoothing, velocity, etc.)
            processed_frame = processor.process(frame)
            
            # Save to database
            await data_store.save_frame(processed_frame)
            
            # Broadcast to all connected clients (frontend)
            await broadcast_to_clients(processed_frame)
            
            # Log (every 30 frames = 1 second at 30 Hz)
            if sensor_status[frame.sensor_id].frame_count % 30 == 0:
                logger.info(
                    f"📊 {frame.sensor_id} | Frame: {sensor_status[frame.sensor_id].frame_count} | "
                    f"Head: {frame.joints['head']}"
                )
    
    except WebSocketDisconnect:
        connected_clients.discard(websocket)
        logger.warning(f"✗ Sensor disconnected | Total clients: {len(connected_clients)}")
        if frame and frame.sensor_id in sensor_status:
            sensor_status[frame.sensor_id].is_online = False
    
    except json.JSONDecodeError as e:
        logger.error(f"✗ Error parsing JSON: {e}")
        await websocket.close(code=1003, reason="Invalid JSON")
    
    except Exception as e:
        logger.error(f"✗ WebSocket error: {e}")


@app.websocket("/ws/dashboard")
async def websocket_dashboard_endpoint(websocket: WebSocket):
    """WebSocket to send real-time data to frontend"""
    await websocket.accept()
    connected_clients.add(websocket)
    
    logger.info(f"📱 Dashboard connected | Total clients: {len(connected_clients)}")
    
    try:
        while True:
            # Keep connection open
            await asyncio.sleep(1)
    
    except WebSocketDisconnect:
        connected_clients.discard(websocket)
        logger.info(f"📱 Dashboard disconnected | Total clients: {len(connected_clients)}")


async def broadcast_to_clients(frame: Dict):
    """Send the frame to all connected clients (frontend)"""
    if not connected_clients:
        return
    
    message = json.dumps({
        "type": "mocap_frame",
        "data": frame.dict() if hasattr(frame, 'dict') else frame
    })
    
    # Send to all clients (especially dashboards)
    disconnected = set()
    for client in connected_clients:
        try:
            # Send only to dashboards, not sensors
            if client.client:
                await client.send_text(message)
        except Exception as e:
            disconnected.add(client)
            logger.warning(f"Error sending broadcast: {e}")
    
    # Remove disconnected clients
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
