#!/usr/bin/env python3
"""
Motion Capture Sensor Simulator
Genera dati realistici di posizione 3D a 30 Hz
"""

import asyncio
import json
import math
import random
import time
from datetime import datetime
from typing import Dict, List, Tuple

import websockets
from websockets.asyncio.client import ClientConnection


class MocapSimulator:
    """Simula un sensore mocap con movimento realistico"""
    
    # Frequenza del sensore (Hz)
    FREQUENCY = 30
    FRAME_INTERVAL = 1.0 / FREQUENCY
    
    # Limiti di movimento (in metri)
    LIMITS = {
        "head": {"x": (-0.3, 0.3), "y": (0.4, 0.7), "z": (0.5, 1.0)},
        "shoulder_left": {"x": (-0.5, 0.0), "y": (0.2, 0.5), "z": (0.3, 1.0)},
        "shoulder_right": {"x": (0.0, 0.5), "y": (0.2, 0.5), "z": (0.3, 1.0)},
        "hand_left": {"x": (-1.0, 0.0), "y": (0.0, 0.8), "z": (-0.5, 1.5)},
        "hand_right": {"x": (0.0, 1.0), "y": (0.0, 0.8), "z": (-0.5, 1.5)},
    }
    
    def __init__(self, sensor_id: str = "mocap_001"):
        self.sensor_id = sensor_id
        self.frame_count = 0
        self.start_time = time.time()
        
        # Posizione iniziale di ogni joint
        self.position = {
            joint: {
                "x": (self.LIMITS[joint]["x"][0] + self.LIMITS[joint]["x"][1]) / 2,
                "y": (self.LIMITS[joint]["y"][0] + self.LIMITS[joint]["y"][1]) / 2,
                "z": (self.LIMITS[joint]["z"][0] + self.LIMITS[joint]["z"][1]) / 2,
            }
            for joint in self.LIMITS.keys()
        }
        
        # Velocità target per il movimento
        self.velocity = {joint: {"x": 0.0, "y": 0.0, "z": 0.0} for joint in self.LIMITS.keys()}
    
    def _update_position(self, elapsed: float) -> None:
        """Aggiorna le posizioni con movimento realistico"""
        
        # Movimento delle braccia (oscillazione seno)
        arm_amp = 0.3
        arm_freq = 0.5  # Hz
        
        left_hand_x = self.LIMITS["hand_left"]["x"][0] + arm_amp * (math.sin(elapsed * arm_freq * 2 * math.pi) + 1) / 2
        right_hand_x = self.LIMITS["hand_right"]["x"][1] - arm_amp * (math.sin(elapsed * arm_freq * 2 * math.pi) + 1) / 2
        
        # Movimento testa (leggera rotazione)
        head_x = (math.sin(elapsed * 0.3 * 2 * math.pi) * 0.2)
        head_y = 0.5 + (math.cos(elapsed * 0.4 * 2 * math.pi) * 0.1)
        
        # Aggiorna posizioni con smoothing
        lerp_factor = 0.1  # Smoothing factor
        
        self.position["hand_left"]["x"] += (left_hand_x - self.position["hand_left"]["x"]) * lerp_factor
        self.position["hand_right"]["x"] += (right_hand_x - self.position["hand_right"]["x"]) * lerp_factor
        
        self.position["head"]["x"] += (head_x - self.position["head"]["x"]) * lerp_factor
        self.position["head"]["y"] += (head_y - self.position["head"]["y"]) * lerp_factor
        
        # Spalle seguono leggermente le braccia
        self.position["shoulder_left"]["x"] += (self.position["hand_left"]["x"] * 0.2 - self.position["shoulder_left"]["x"]) * lerp_factor * 0.5
        self.position["shoulder_right"]["x"] += (self.position["hand_right"]["x"] * 0.2 - self.position["shoulder_right"]["x"]) * lerp_factor * 0.5
        
        # Rumore casuale per realismo (jitter 1-2 cm)
        for joint in self.position:
            for axis in ["x", "y", "z"]:
                noise = random.gauss(0, 0.01)
                self.position[joint][axis] += noise
                
                # Assicura che stia dentro i limiti
                min_val, max_val = self.LIMITS[joint][axis]
                self.position[joint][axis] = max(min_val, min(max_val, self.position[joint][axis]))
    
    def generate_frame(self) -> Dict:
        """Genera un frame di dati mocap"""
        elapsed = time.time() - self.start_time
        self._update_position(elapsed)
        
        frame = {
            "timestamp": int(time.time() * 1000),  # millisecondi
            "frame_count": self.frame_count,
            "sensor_id": self.sensor_id,
            "joints": {
                joint: [round(self.position[joint][axis], 3) for axis in ["x", "y", "z"]]
                for joint in self.LIMITS.keys()
            }
        }
        
        self.frame_count += 1
        return frame
    
    async def stream_to_websocket(self, uri: str) -> None:
        """Invia dati in streaming via WebSocket"""
        try:
            async with websockets.connect(uri) as websocket:
                print(f"✓ Connesso a {uri}")
                print(f"✓ Inizio streaming da {self.sensor_id} @ {self.FREQUENCY} Hz")
                
                while True:
                    frame = self.generate_frame()
                    
                    try:
                        await websocket.send(json.dumps(frame))
                        
                        if self.frame_count % 30 == 0:  # Ogni secondo (30 Hz)
                            print(f"  Frame {self.frame_count} inviato | "
                                  f"Head: ({frame['joints']['head'][0]}, "
                                  f"{frame['joints']['head'][1]}, "
                                  f"{frame['joints']['head'][2]})")
                        
                        await asyncio.sleep(self.FRAME_INTERVAL)
                    
                    except websockets.exceptions.ConnectionClosed:
                        print("✗ Connessione chiusa dal server")
                        break
        
        except ConnectionRefusedError:
            print(f"✗ Errore: Impossibile connettersi a {uri}")
            print("  Assicurati che il backend sia in esecuzione")
        except Exception as e:
            print(f"✗ Errore: {e}")


async def main():
    """Main entry point"""
    print("=" * 60)
    print("🎯 Motion Capture Sensor Simulator")
    print("=" * 60)
    
    simulator = MocapSimulator(sensor_id="mocap_001")
    
    # Prova a connettersi al backend
    backend_uri = "ws://localhost:8001"
    
    print(f"\n⏳ Tentativo di connessione a {backend_uri}...\n")
    
    await simulator.stream_to_websocket(backend_uri)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n✓ Sensore fermato")
