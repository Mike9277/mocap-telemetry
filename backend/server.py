####################
#  server.py
#
# Lightweight Backend for Mocap Telemetry - no Pydantic, no dependencies
# Pure Python asyncio + WebSocket + HTTP
#
# Author: Michelangelo Guaitolini, 11.03.2026
####################

__doc__ = """
Lightweight Backend for Mocap Telemetry
Pure Python asyncio + WebSocket + HTTP
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
    print("✗ Error: websockets not installed")
    print("  Install: pip install websockets")
    exit(1)

logging.basicConfig(
    level=logging.INFO,
    format='%(message)s'
)
logger = logging.getLogger(__name__)

# Globals
connected_sensors: Set = set()
connected_dashboards: Set = set()
last_frames = {}
sensor_status = {}


async def handle_sensor_connection(ws, path):
    """Handle sensor connection"""
    sensor_id = None
    
    try:
        await ws.send(json.dumps({"type": "connected", "message": "Connected to backend"}))
        logger.info("✓ Sensor connected")
        connected_sensors.add(ws)
        
        async for message in ws:
            try:
                frame = json.loads(message)
                sensor_id = frame.get("sensor_id", "unknown")
                
                # Update status
                sensor_status[sensor_id] = {
                    "is_online": True,
                    "frame_count": frame.get("frame_count", 0),
                    "last_update": int(datetime.now().timestamp() * 1000)
                }
                
                # Save last frame
                last_frames[sensor_id] = frame
                
                # Broadcast to dashboards
                # If it contains keypoints, it's a pose detection sensor - send directly
                if frame.get("keypoints"):
                    broadcast_msg = json.dumps(frame, default=str)
                else:
                    # Otherwise it's traditional mocap - wrap in "mocap_frame" format
                    broadcast_msg = json.dumps({
                        "type": "mocap_frame",
                        "data": frame
                    }, default=str)
                
                # Send to all dashboards
                for dashboard in list(connected_dashboards):
                    try:
                        await dashboard.send(broadcast_msg)
                    except Exception:
                        connected_dashboards.discard(dashboard)
                
                if frame.get("frame_count", 0) % 30 == 0:
                    head = frame.get("joints", {}).get("head", [0, 0, 0])
                    logger.info(f"📊 {sensor_id} | Frame: {frame.get('frame_count')} | Head: {head}")
            
            except json.JSONDecodeError:
                logger.error("✗ Invalid JSON")
    
    except websockets.exceptions.ConnectionClosed:
        logger.warning(f"✗ Sensor disconnected")
        if sensor_id and sensor_id in sensor_status:
            sensor_status[sensor_id]["is_online"] = False
    
    except Exception as e:
        logger.error(f"✗ Sensor error: {e}")
    
    finally:
        connected_sensors.discard(ws)


async def handle_dashboard_connection(ws, path):
    """Handle dashboard connection"""
    try:
        logger.info("📱 Dashboard connected")
        connected_dashboards.add(ws)
        
        # Send the last known frames
        for sensor_id, frame in last_frames.items():
            msg = json.dumps({
                "type": "mocap_frame",
                "data": frame
            })
            await ws.send(msg)
        
        # Keep connection open
        async for message in ws:
            pass
    
    except websockets.exceptions.ConnectionClosed:
        logger.warning("📱 Dashboard disconnected")
    
    except Exception as e:
        logger.error(f"✗ Dashboard error: {e}")
    
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
        logger.error(f"✗ Health check error: {e}")
    finally:
        await ws.close()


# HTTP REST API Handler
class HTTPRequestHandler(BaseHTTPRequestHandler):
    """Handler for HTTP REST API"""
    
    def do_GET(self):
        """Handle GET requests"""
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
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        """Disable default HTTP logging"""
        pass


def run_http_server():
    """Run HTTP server in a separate thread"""
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
    
    # Start HTTP server in a separate thread
    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()
    
    # Wait a bit for HTTP server to be ready
    await asyncio.sleep(1)
    
    # WebSocket server for sensors and dashboards
    async with serve(handle_sensor_connection, "localhost", 8001):
        async with serve(handle_dashboard_connection, "localhost", 8002):
            async with serve(handle_health, "localhost", 8003):
                logger.info("✓ WebSocket Sensors: ws://localhost:8001")
                logger.info("✓ WebSocket Dashboard: ws://localhost:8002")
                logger.info("✓ Health Check: ws://localhost:8003\n")
                
                logger.info("⏳ Listening for connections...\n")
                
                await asyncio.Future()  # Run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("\n✓ Backend stopped")
