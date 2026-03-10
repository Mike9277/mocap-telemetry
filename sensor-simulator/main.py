#!/usr/bin/env python3
"""
Real-time Pose Detection Sensor
Usa YOLOv8 per rilevare keypoint del corpo in tempo reale dalla webcam
Invia i dati via WebSocket al backend
"""

import asyncio
import base64
import io
import json
import time
from datetime import datetime
from typing import Dict, List, Tuple, Optional

import cv2
import numpy as np
from PIL import Image
from ultralytics import YOLO
import websockets
from websockets.asyncio.client import ClientConnection


class PoseDetectionSensor:
    """Rileva pose dal corpo umano usando YOLOv8"""
    
    # Frequenza del sensore (Hz) - limitata a 24 FPS per HD
    FREQUENCY = 24
    FRAME_INTERVAL = 1.0 / FREQUENCY
    
    # Keypoint names from YOLOv8 (17 keypoints)
    KEYPOINT_NAMES = [
        "nose", "left_eye", "right_eye", "left_ear", "right_ear",
        "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
        "left_wrist", "right_wrist", "left_hip", "right_hip",
        "left_knee", "right_knee", "left_ankle", "right_ankle"
    ]
    
    # Skeletons connections (per disegnare le linee)
    SKELETON_CONNECTIONS = [
        (0, 1), (0, 2), (1, 3), (2, 4),  # Head
        (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),  # Arms
        (5, 11), (6, 12), (11, 12),  # Torso
        (11, 13), (13, 15), (12, 14), (14, 16)  # Legs
    ]
    
    def __init__(self, sensor_id: str = "yolo_pose_001", camera_index: int = 0):
        self.sensor_id = sensor_id
        self.frame_count = 0
        self.start_time = time.time()
        
        # Carica il modello YOLOv8 Pose
        print("📥 Caricamento modello YOLOv8 Pose...")
        self.model = YOLO("yolov8m-pose.pt")  # medium model per velocità/accuratezza
        
        # Apri la webcam
        print(f"📷 Apertura webcam (camera {camera_index})...")
        self.cap = cv2.VideoCapture(camera_index)
        
        if not self.cap.isOpened():
            raise RuntimeError(f"Impossibile aprire la webcam: {camera_index}")
        
        # Imposta risoluzione a HD (1280x720) e FPS a 24
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        self.cap.set(cv2.CAP_PROP_FPS, 24)
        
        # Buffer per tracciamento (ultimi 100 frame)
        self.keypoint_history = {name: [] for name in self.KEYPOINT_NAMES}
        self.max_history_length = 100
        
        self.websocket: Optional[ClientConnection] = None
        self.last_inference_time = 0.0
        self.inference_fps = 0.0
    
    def _process_frame(self, frame: np.ndarray) -> Dict:
        """Processa un frame da webcam ed estrae i keypoint"""
        
        # Esegui inferenza YOLOv8
        results = self.model(frame, verbose=False, conf=0.6, iou=0.5)
        
        # Struttura dati frame
        frame_data = {
            "timestamp": int(time.time() * 1000),
            "frame_count": self.frame_count,
            "sensor_id": self.sensor_id,
            "image_shape": list(frame.shape[:2]),  # height, width
            "joints": {},
            "keypoints": {},
            "has_person": False
        }
        
        # Estrai i keypoint dalla prima persona rilevata (più vicina)
        if results and results[0].keypoints is not None:
            keypoints = results[0].keypoints.xy[0].cpu().numpy()  # (17, 2) - x, y
            confidences = results[0].keypoints.conf[0].cpu().numpy() if hasattr(results[0].keypoints, 'conf') else np.ones(17)
            
            frame_data["has_person"] = True
            
            # Normalizza le coordinate (0-1)
            h, w = frame.shape[:2]
            keypoints_normalized = keypoints.copy()
            keypoints_normalized[:, 0] /= w  # x
            keypoints_normalized[:, 1] /= h  # y
            
            # Salva i keypoint per tracciamento
            for i, name in enumerate(self.KEYPOINT_NAMES):
                x_norm = float(keypoints_normalized[i, 0])
                y_norm = float(keypoints_normalized[i, 1])
                conf = float(confidences[i])
                
                # Formato: [x_normalized, y_normalized, confidence]
                frame_data["keypoints"][name] = {
                    "x": x_norm,
                    "y": y_norm,
                    "confidence": conf,
                    "x_pixel": int(keypoints[i, 0]),
                    "y_pixel": int(keypoints[i, 1])
                }
                
                # Mantieni storico (per tracciamento)
                self.keypoint_history[name].append({
                    "x": x_norm,
                    "y": y_norm,
                    "confidence": conf,
                    "timestamp": frame_data["timestamp"]
                })
                
                # Limite history length
                if len(self.keypoint_history[name]) > self.max_history_length:
                    self.keypoint_history[name].pop(0)
            
            # Crea dati "joints" semplificati (backwards compatible)
            frame_data["joints"] = {
                "head": [
                    frame_data["keypoints"]["nose"]["x"],
                    frame_data["keypoints"]["nose"]["y"],
                    frame_data["keypoints"]["nose"]["confidence"]
                ],
                "shoulder_left": [
                    frame_data["keypoints"]["left_shoulder"]["x"],
                    frame_data["keypoints"]["left_shoulder"]["y"],
                    frame_data["keypoints"]["left_shoulder"]["confidence"]
                ],
                "shoulder_right": [
                    frame_data["keypoints"]["right_shoulder"]["x"],
                    frame_data["keypoints"]["right_shoulder"]["y"],
                    frame_data["keypoints"]["right_shoulder"]["confidence"]
                ],
                "hand_left": [
                    frame_data["keypoints"]["left_wrist"]["x"],
                    frame_data["keypoints"]["left_wrist"]["y"],
                    frame_data["keypoints"]["left_wrist"]["confidence"]
                ],
                "hand_right": [
                    frame_data["keypoints"]["right_wrist"]["x"],
                    frame_data["keypoints"]["right_wrist"]["y"],
                    frame_data["keypoints"]["right_wrist"]["confidence"]
                ],
            }
        
        self.frame_count += 1
        return frame_data
    
    def get_keypoint_traces(self, keypoint_name: str, max_points: int = 50) -> List[Dict]:
        """Ritorna la traccia storica di un keypoint"""
        history = self.keypoint_history.get(keypoint_name, [])
        # Ritorna solo gli ultimi max_points
        return history[-max_points:] if history else []
    
    def _encode_frame_to_base64(self, frame: np.ndarray, quality: int = 70) -> str:
        """Codifica il frame come JPEG base64 per trasmissione via WebSocket"""
        # Comprimi il frame HD con JPEG
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        # Converti in base64
        frame_base64 = base64.b64encode(buffer).decode('utf-8')
        return frame_base64
    
    async def stream_to_websocket(self, uri: str) -> None:
        """Cattura dalla webcam e invia dati via WebSocket"""
        try:
            async with websockets.connect(uri) as websocket:
                self.websocket = websocket
                print(f"✓ Connesso a {uri}")
                print(f"✓ Inizio streaming da {self.sensor_id}")
                print("  Premi 'q' nella finestra della webcam per fermare\n")
                
                frame_skip_counter = 0
                target_skip = max(1, int(30 / self.FREQUENCY))  # Skip frame se necessario
                
                while True:
                    ret, frame = self.cap.read()
                    
                    if not ret:
                        print("✗ Errore lettura webcam")
                        break
                    
                    # Skip frame se necessario per mantenere frequenza
                    frame_skip_counter += 1
                    if frame_skip_counter < target_skip:
                        continue
                    frame_skip_counter = 0
                    
                    # Processa il frame
                    frame_data = self._process_frame(frame)
                    
                    # Visualizza preview ed estrai il frame disegnato
                    self._draw_skeleton(frame, frame_data)
                    
                    # Mostra FPS e info
                    fps_text = f"FPS: {self.inference_fps:.1f} | Frames: {self.frame_count}"
                    cv2.putText(frame, fps_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                    
                    if frame_data["has_person"]:
                        cv2.putText(frame, f"Person detected: {len(frame_data['keypoints'])} keypoints", 
                                  (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                    else:
                        cv2.putText(frame, "No person detected", (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                    
                    # Invia il video frame OGNI FRAME in HD con qualità media
                    try:
                        video_base64 = self._encode_frame_to_base64(frame, quality=35)
                        frame_data["video"] = video_base64
                    except Exception as e:
                        print(f"⚠️  Errore codifica video al frame {self.frame_count}: {e}")
                        frame_data["video"] = None
                    
                    # Invia i dati
                    try:
                        await websocket.send(json.dumps(frame_data, default=str))
                        
                        # Log ogni 30 frame
                        if self.frame_count % 30 == 0:
                            joint_str = f"Head: ({frame_data['joints']['head'][0]:.2f}, {frame_data['joints']['head'][1]:.2f})"
                            print(f"  Frame {self.frame_count} inviato | {joint_str}")
                        
                    # Calcola FPS
                        now = time.time()
                        if self.last_inference_time > 0:
                            fps = 1.0 / (now - self.last_inference_time)
                            self.inference_fps = self.inference_fps * 0.7 + fps * 0.3  # Smoothing
                        self.last_inference_time = now
                        
                        # Throttle a max 24 FPS
                        elapsed = time.time() - now
                        sleep_time = max(0, 1.0/24.0 - elapsed)
                        if sleep_time > 0:
                            time.sleep(sleep_time)
                    
                    except websockets.exceptions.ConnectionClosed:
                        print("✗ Connessione chiusa dal server")
                        break
                    
                    # Controlla tasti
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord('q'):
                        print("✓ Interrupt dall'utente")
                        break
        
        except ConnectionRefusedError:
            print(f"✗ Errore: Impossibile connettersi a {uri}")
            print("  Assicurati che il backend sia in esecuzione: python backend/server.py")
        
        except Exception as e:
            print(f"✗ Errore: {e}")
        
        finally:
            self.cap.release()
            cv2.destroyAllWindows()
    
    def _draw_skeleton(self, frame: np.ndarray, frame_data: Dict) -> None:
        """Disegna lo skeleton sulla frame con colori left/right differenti"""
        
        if not frame_data["has_person"]:
            return
        
        h, w = frame.shape[:2]
        
        # Disegna le connessioni (linee) con colori left/right
        for start_idx, end_idx in self.SKELETON_CONNECTIONS:
            start_name = self.KEYPOINT_NAMES[start_idx]
            end_name = self.KEYPOINT_NAMES[end_idx]
            
            if start_name in frame_data["keypoints"] and end_name in frame_data["keypoints"]:
                start_point = frame_data["keypoints"][start_name]
                end_point = frame_data["keypoints"][end_name]
                
                # Solo disegna se confidence è alta
                if start_point["confidence"] > 0.3 and end_point["confidence"] > 0.3:
                    pt1 = (start_point["x_pixel"], start_point["y_pixel"])
                    pt2 = (end_point["x_pixel"], end_point["y_pixel"])
                    
                    # Colore: BLU per "left", ROSSO per "right", VERDE per centro (head, torso)
                    conf = (start_point["confidence"] + end_point["confidence"]) / 2
                    intensity = int(255 * conf)
                    
                    if "left" in start_name or "left" in end_name:
                        color = (255, 0, 0)  # BLU (BGR format)
                    elif "right" in start_name or "right" in end_name:
                        color = (0, 0, 255)  # ROSSO (BGR format)
                    else:
                        color = (0, 255, 0)  # VERDE (BGR format)
                    
                    cv2.line(frame, pt1, pt2, color, 2)
        
        # Disegna i keypoint (cerchi) con colori left/right
        for name, kpt in frame_data["keypoints"].items():
            if kpt["confidence"] > 0.3:
                pt = (kpt["x_pixel"], kpt["y_pixel"])
                
                # Stessi colori: BLU/ROSSO/VERDE
                conf = kpt["confidence"]
                intensity = int(255 * conf)
                
                if "left" in name:
                    color = (255, 0, 0)  # BLU
                elif "right" in name:
                    color = (0, 0, 255)  # ROSSO
                else:
                    color = (0, 255, 0)  # VERDE
                
                cv2.circle(frame, pt, 5, color, -1)
                cv2.circle(frame, pt, 5, (255, 255, 255), 1)


async def main():
    """Main entry point"""
    print("=" * 60)
    print("🎯 Real-time Pose Detection Sensor (YOLOv8)")
    print("=" * 60)
    print()
    
    try:
        # Crea il sensor
        sensor = PoseDetectionSensor(sensor_id="yolo_pose_001", camera_index=0)
        
        # Connetti e inizia streaming
        backend_uri = "ws://localhost:8001"
        await sensor.stream_to_websocket(backend_uri)
    
    except KeyboardInterrupt:
        print("\n✓ Arresto richiesto")
    except RuntimeError as e:
        print(f"\n✗ Errore: {e}")
        print("  Assicurati che:")
        print("    1. Una webcam sia collegata e funzionante")
        print("    2. Il backend sia in esecuzione (python backend/server.py)")
    except Exception as e:
        print(f"\n✗ Errore inaspettato: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
