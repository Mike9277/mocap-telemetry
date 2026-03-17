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


def _convert_nan_to_none(obj):
    """Recursively convert NaN values to None for JSON serialization"""
    import math
    if isinstance(obj, dict):
        return {k: _convert_nan_to_none(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_nan_to_none(v) for v in obj]
    elif isinstance(obj, float) and math.isnan(obj):
        return None
    else:
        return obj


async def handle_sensor_connection(ws, path):
    """Handle sensor connection"""
    sensor_id = None
    
    try:
        await ws.send(json.dumps({"type": "connected", "message": "Connected to backend"}))
        logger.info("✓ Sensor connected")
        connected_sensors.add(ws)
        
        frame_count = 0
        async for message in ws:
            try:
                frame = json.loads(message)
                sensor_id = frame.get("sensor_id", "unknown")
                frame_count += 1
                
                # Update status
                sensor_status[sensor_id] = {
                    "is_online": True,
                    "frame_count": frame.get("frame_count", 0),
                    "last_update": int(datetime.now().timestamp() * 1000)
                }
                
                # Save last frame
                last_frames[sensor_id] = frame
                
                # Broadcast to dashboards
                # Include full frame with video for dashboards (frontend displays video stream)
                frame_to_send = dict(frame)

                # Convert NaN to None for JSON serialization
                frame_to_send = _convert_nan_to_none(frame_to_send)
                broadcast_msg = json.dumps(frame_to_send, default=str)
                
                # Send to all dashboards
                dashboards_count = len(connected_dashboards)
                if dashboards_count > 0:
                    # Log message structure on first frame
                    if frame.get("frame_count", 0) == 1:
                        msg_keys = list(frame_to_send.keys())
                        logger.info(f"  Message structure: {msg_keys}")
                    
                    for dashboard in list(connected_dashboards):
                        try:
                            await dashboard.send(broadcast_msg)
                        except Exception as e:
                            logger.warning(f"Error sending to dashboard: {e}")
                            connected_dashboards.discard(dashboard)
                
                if frame.get("frame_count", 0) % 30 == 0:
                    has_kpts = "keypoints" in frame
                    has_angles = "joint_angles" in frame
                    logger.info(f"📊 {sensor_id} | Frame: {frame.get('frame_count')} | Dashboards: {dashboards_count} | Keypoints: {has_kpts} | Angles: {has_angles}")
            
            except json.JSONDecodeError as e:
                logger.error(f"✗ Invalid JSON: {e}")
            except Exception as e:
                logger.error(f"✗ Frame processing error: {e}")
    
    except websockets.exceptions.ConnectionClosed:
        logger.warning(f"✗ Sensor disconnected (received {frame_count} frames)")
        if sensor_id and sensor_id in sensor_status:
            sensor_status[sensor_id]["is_online"] = False
    
    except Exception as e:
        logger.error(f"✗ Sensor error: {e}")
    
    finally:
        connected_sensors.discard(ws)


async def handle_dashboard_connection(ws, path):
    """Handle dashboard connection"""
    try:
        logger.info(f"📱 Dashboard connected | Total dashboards: {len(connected_dashboards) + 1}")
        connected_dashboards.add(ws)
        
        # Send the last known frames (include video so dashboard shows image immediately)
        sent_count = 0
        for sensor_id, frame in last_frames.items():
            frame_to_send = _convert_nan_to_none(dict(frame))
            msg = json.dumps(frame_to_send)
            try:
                await ws.send(msg)
                sent_count += 1
                logger.info(f"  Sent initial frame from {sensor_id}")
            except Exception as e:
                logger.warning(f"  Error sending initial frame: {e}")
        
        if sent_count == 0:
            logger.warning(f"  No initial frames to send (no sensors connected yet)")
        
        # Keep connection open
        async for message in ws:
            pass
    
    except websockets.exceptions.ConnectionClosed:
        logger.warning(f"📱 Dashboard disconnected | Remaining dashboards: {len(connected_dashboards) - 1}")
    
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
                "connected_dashboards": len(connected_dashboards),
                "connected_sensors": len(connected_sensors),
                "last_frames_count": len(last_frames)
            })
            self.wfile.write(response.encode())
        
        elif self.path == '/api/last-frame':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Return the last frame from the first sensor
            if last_frames:
                sensor_id = list(last_frames.keys())[0]
                frame = last_frames[sensor_id]
                # Remove video to avoid huge response
                frame_to_send = {k: v for k, v in frame.items() if k != 'video'}
                response = json.dumps(frame_to_send, default=str)
            else:
                response = json.dumps({"error": "No frames received yet"})
            
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
