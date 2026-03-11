####################
#  processing/__init__.py
#
# Motion Capture Data Processing
# Provides filtering, velocity calculation, and anomaly detection
#
# Author: Michelangelo Guaitolini, 11.03.2026
####################

__doc__ = """
Motion Capture Data Processing
"""

"""Motion capture data processing"""

from typing import Dict, List
from app.models import MocapFrame, ProcessedFrame
import math
from collections import deque


class MotionProcessor:
    """Process frames from motion capture"""
    
    def __init__(self, smoothing_window: int = 5):
        """
        Args:
            smoothing_window: moving average window (frames)
        """
        self.smoothing_window = smoothing_window
        self.history: Dict[str, deque] = {}
        self.last_position: Dict[str, Dict[str, float]] = {}
        self.last_velocity: Dict[str, Dict[str, float]] = {}
    
    def process(self, frame: MocapFrame) -> Dict:
        """Process a frame"""
        
        # Extract joint from frame
        joints = {}
        for joint_name, pos in frame.joints.items():
            joints[joint_name] = {"x": pos[0], "y": pos[1], "z": pos[2]}
        
        # Smoothing (moving average)
        smoothed_joints = self._smooth_joints(frame.sensor_id, joints)
        
        # Calculate velocity and acceleration
        velocity = self._calculate_velocity(frame.sensor_id, smoothed_joints)
        acceleration = self._calculate_acceleration(frame.sensor_id, velocity)
        
        # Anomaly detection
        anomalies = self._detect_anomalies(smoothed_joints, velocity, acceleration)
        
        return {
            "timestamp": frame.timestamp,
            "frame_count": frame.frame_count,
            "sensor_id": frame.sensor_id,
            "joints": smoothed_joints,
            "velocity": velocity,
            "acceleration": acceleration,
            "anomalies": anomalies
        }
    
    def _smooth_joints(self, sensor_id: str, joints: Dict) -> Dict[str, List[float]]:
        """Smoothing with moving average"""
        
        # Initialize history if necessary
        if sensor_id not in self.history:
            self.history[sensor_id] = {}
        
        smoothed = {}
        
        for joint_name, pos in joints.items():
            # Create history for this joint if it doesn't exist
            if joint_name not in self.history[sensor_id]:
                self.history[sensor_id][joint_name] = deque(maxlen=self.smoothing_window)
            
            # Add new value
            self.history[sensor_id][joint_name].append(pos)
            
            # Moving average
            history = list(self.history[sensor_id][joint_name])
            avg = {
                "x": sum(p["x"] for p in history) / len(history),
                "y": sum(p["y"] for p in history) / len(history),
                "z": sum(p["z"] for p in history) / len(history),
            }
            
            smoothed[joint_name] = [round(avg["x"], 3), round(avg["y"], 3), round(avg["z"], 3)]
        
        return smoothed
    
    def _calculate_velocity(self, sensor_id: str, joints: Dict[str, List[float]]) -> Dict[str, List[float]]:
        """Calculate differential velocity"""
        
        if sensor_id not in self.last_position:
            self.last_position[sensor_id] = {}
            self.last_velocity[sensor_id] = {}
        
        velocity = {}
        
        for joint_name, pos in joints.items():
            if joint_name in self.last_position[sensor_id]:
                last_pos = self.last_position[sensor_id][joint_name]
                # Velocity = (current position - previous position) / dt
                # Assume dt = 1/30 Hz = 0.033s
                dt = 0.033
                v = [
                    (pos[0] - last_pos[0]) / dt,
                    (pos[1] - last_pos[1]) / dt,
                    (pos[2] - last_pos[2]) / dt,
                ]
                velocity[joint_name] = [round(v_i, 3) for v_i in v]
            else:
                velocity[joint_name] = [0.0, 0.0, 0.0]
            
            self.last_position[sensor_id][joint_name] = pos
        
        return velocity
    
    def _calculate_acceleration(self, sensor_id: str, velocity: Dict[str, List[float]]) -> Dict[str, List[float]]:
        """Calcola accelerazione differenziale"""
        
        acceleration = {}
        dt = 0.033
        
        for joint_name, vel in velocity.items():
            if joint_name in self.last_velocity[sensor_id]:
                last_vel = self.last_velocity[sensor_id][joint_name]
                a = [
                    (vel[0] - last_vel[0]) / dt,
                    (vel[1] - last_vel[1]) / dt,
                    (vel[2] - last_vel[2]) / dt,
                ]
                acceleration[joint_name] = [round(a_i, 3) for a_i in a]
            else:
                acceleration[joint_name] = [0.0, 0.0, 0.0]
            
            self.last_velocity[sensor_id][joint_name] = vel
        
        return acceleration
    
    def _detect_anomalies(self, joints: Dict[str, List[float]], 
                         velocity: Dict[str, List[float]],
                         acceleration: Dict[str, List[float]]) -> List[str]:
        """Rilevamento anomalie (spike, movimenti irrealistici)"""
        
        anomalies = []
        
        # Soglia di velocità anomala (m/s)
        velocity_threshold = 5.0
        
        # Soglia di accelerazione anomala
        acceleration_threshold = 50.0
        
        for joint_name in joints:
            vel = velocity[joint_name]
            acc = acceleration[joint_name]
            
            # Magnitudine velocità
            vel_mag = math.sqrt(sum(v**2 for v in vel))
            if vel_mag > velocity_threshold:
                anomalies.append(f"High velocity on {joint_name}: {vel_mag:.2f} m/s")
            
            # Magnitudine accelerazione
            acc_mag = math.sqrt(sum(a**2 for a in acc))
            if acc_mag > acceleration_threshold:
                anomalies.append(f"High acceleration on {joint_name}: {acc_mag:.2f} m/s²")
        
        return anomalies
