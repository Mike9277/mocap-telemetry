#!/usr/bin/env python3
"""
Backend minimalista per Mocap Telemetry - no Pydantic, no dependencies
Puro Python asyncio + WebSocket + HTTP
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Set
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading

try:
    import websockets
    from websockets.server import serve
except ImportError:
    print("✗ Errore: websockets non installato")
    print("  Installa: pip install websockets")
    exit(1)

logging.basicConfig(
    level=logging.INFO,
    format='%(message)s'
)
logger = logging.getLogger(__name__)

# Globali
connected_sensors: Set = set()
connected_dashboards: Set = set()
last_frames = {}
sensor_status = {}


async def handle_sensor_connection(ws, path):
    """Gestisce connessione di un sensore"""
    sensor_id = None
    
    try:
        await ws.send(json.dumps({"type": "connected", "message": "Connected to backend"}))
        logger.info("✓ Sensore connesso")
        connected_sensors.add(ws)
        
        async for message in ws:
            try:
                frame = json.loads(message)
                sensor_id = frame.get("sensor_id", "unknown")
                
                # Aggiorna status
                sensor_status[sensor_id] = {
                    "is_online": True,
                    "frame_count": frame.get("frame_count", 0),
                    "last_update": int(datetime.now().timestamp() * 1000)
                }
                
                # Salva ultimo frame
                last_frames[sensor_id] = frame
                
                # Broadcast ai dashboard
                broadcast_msg = json.dumps({
                    "type": "mocap_frame",
                    "data": frame
                })
                
                # Invia a tutti i dashboard
                for dashboard in list(connected_dashboards):
                    try:
                        await dashboard.send(broadcast_msg)
                    except Exception:
                        connected_dashboards.discard(dashboard)
                
                if frame.get("frame_count", 0) % 30 == 0:
                    head = frame.get("joints", {}).get("head", [0, 0, 0])
                    logger.info(f"📊 {sensor_id} | Frame: {frame.get('frame_count')} | Head: {head}")
            
            except json.JSONDecodeError:
                logger.error("✗ JSON non valido")
    
    except websockets.exceptions.ConnectionClosed:
        logger.warning(f"✗ Sensore disconnesso")
        if sensor_id and sensor_id in sensor_status:
            sensor_status[sensor_id]["is_online"] = False
    
    except Exception as e:
        logger.error(f"✗ Errore sensore: {e}")
    
    finally:
        connected_sensors.discard(ws)


async def handle_dashboard_connection(ws, path):
    """Gestisce connessione di un dashboard"""
    try:
        logger.info("📱 Dashboard connesso")
        connected_dashboards.add(ws)
        
        # Invia gli ultimi frame noti
        for sensor_id, frame in last_frames.items():
            msg = json.dumps({
                "type": "mocap_frame",
                "data": frame
            })
            await ws.send(msg)
        
        # Mantieni connessione aperta
        async for message in ws:
            pass
    
    except websockets.exceptions.ConnectionClosed:
        logger.warning("📱 Dashboard disconnesso")
    
    except Exception as e:
        logger.error(f"✗ Errore dashboard: {e}")
    
    finally:
        connected_dashboards.discard(ws)


async def handle_health(ws, path):
    """Health check endpoint"""
    try:
        health_data = {
            "status": "ok",
            "timestamp": int(datetime.now().timestamp() * 1000),
            "sensors": sensor_status,
            "connected_dashboards": len(connected_dashboards)
        }
        await ws.send(json.dumps(health_data))
    except Exception as e:
        logger.error(f"✗ Errore health: {e}")
    finally:
        await ws.close()


# HTTP REST API Handler
class HTTPRequestHandler(BaseHTTPRequestHandler):
    """Handler per REST API HTTP"""
    
    def do_GET(self):
        """Gestisci GET requests"""
        if self.path == '/api/sensors':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = json.dumps({
                "sensors": sensor_status,
                "count": len(sensor_status)
            })
            self.wfile.write(response.encode())
        
        elif self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = json.dumps({
                "status": "ok",
                "timestamp": int(datetime.now().timestamp() * 1000),
                "sensors": sensor_status,
                "connected_dashboards": len(connected_dashboards)
            })
            self.wfile.write(response.encode())
        
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_OPTIONS(self):
        """Gestisci CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        """Disabilita i log HTTP di default"""
        pass


def run_http_server():
    """Esegui il server HTTP in un thread separato"""
    server = HTTPServer(('localhost', 8000), HTTPRequestHandler)
    logger.info("✓ HTTP API: http://localhost:8000")
    logger.info("  Endpoints:")
    logger.info("    - GET /api/sensors")
    logger.info("    - GET /health\n")
    server.serve_forever()


async def main():
    logger.info("\n" + "="*60)
    logger.info("🚀 Mocap Telemetry Backend (Lightweight)")
    logger.info("="*60 + "\n")
    
    # Avvia HTTP server in un thread separato
    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()
    
    # Attendi un po' che il server HTTP sia pronto
    await asyncio.sleep(1)
    
    # Server WebSocket per sensori e dashboard
    async with serve(handle_sensor_connection, "localhost", 8001):
        async with serve(handle_dashboard_connection, "localhost", 8002):
            async with serve(handle_health, "localhost", 8003):
                logger.info("✓ WebSocket Sensori: ws://localhost:8001")
                logger.info("✓ WebSocket Dashboard: ws://localhost:8002")
                logger.info("✓ Health Check: ws://localhost:8003\n")
                
                logger.info("⏳ In ascolto per connessioni...\n")
                
                await asyncio.Future()  # Run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("\n✓ Backend fermato")
