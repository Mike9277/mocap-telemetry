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
sensor_clients: Set[WebSocket] = set()      # Sensori che inviano dati
dashboard_clients: Set[WebSocket] = set()   # Dashboard che ricevono dati
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
        "connected_sensors": len(sensor_clients),
        "connected_dashboards": len(dashboard_clients),
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
    sensor_clients.add(websocket)
    
    logger.info(f"✓ Sensor connected | Total sensors: {len(sensor_clients)}")
    
    frame = None
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
            
            # Broadcast to all connected dashboards
            await broadcast_to_dashboards(processed_frame)
            
            # Log (every 30 frames = 1 second at 30 Hz)
            if sensor_status[frame.sensor_id].frame_count % 30 == 0:
                logger.info(
                    f"📊 {frame.sensor_id} | Frame: {sensor_status[frame.sensor_id].frame_count} | "
                    f"Dashboards: {len(dashboard_clients)}"
                )
    
    except WebSocketDisconnect:
        sensor_clients.discard(websocket)
        logger.warning(f"✗ Sensor disconnected | Total sensors: {len(sensor_clients)}")
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
    dashboard_clients.add(websocket)
    
    logger.info(f"📱 Dashboard connected | Total dashboards: {len(dashboard_clients)}")
    
    try:
        while True:
            # Keep connection open
            await asyncio.sleep(1)
    
    except WebSocketDisconnect:
        dashboard_clients.discard(websocket)
        logger.info(f"📱 Dashboard disconnected | Total dashboards: {len(dashboard_clients)}")


async def broadcast_to_dashboards(frame: Dict):
    """Send the frame to all connected dashboards"""
    if not dashboard_clients:
        return
    
    # Serialize frame data
    if hasattr(frame, 'dict'):
        frame_data = frame.dict()
    else:
        frame_data = frame
    
    message = json.dumps(frame_data)
    
    # Send to all dashboards
    disconnected = set()
    for client in dashboard_clients:
        try:
            await client.send_text(message)
        except Exception as e:
            disconnected.add(client)
            logger.warning(f"Error sending to dashboard: {e}")
    
    # Remove disconnected clients
    for client in disconnected:
        dashboard_clients.discard(client)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        ws_ping_interval=20
    )
