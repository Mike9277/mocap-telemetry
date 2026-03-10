"""Modelli Pydantic per Mocap Telemetry"""

from pydantic import BaseModel
from typing import Dict, List, Optional
from datetime import datetime


class JointData(BaseModel):
    """Dati di un singolo joint"""
    x: float
    y: float
    z: float


class MocapFrame(BaseModel):
    """Frame di dati motion capture"""
    timestamp: int
    frame_count: int
    sensor_id: str
    joints: Dict[str, List[float]]
    
    class Config:
        schema_extra = {
            "example": {
                "timestamp": 1710000000,
                "frame_count": 0,
                "sensor_id": "mocap_001",
                "joints": {
                    "head": [0.0, 0.5, 0.75],
                    "shoulder_left": [-0.25, 0.35, 0.65],
                    "shoulder_right": [0.25, 0.35, 0.65],
                    "hand_left": [-0.5, 0.4, 0.5],
                    "hand_right": [0.5, 0.4, 0.5]
                }
            }
        }


class ProcessedFrame(BaseModel):
    """Frame dopo elaborazione"""
    timestamp: int
    frame_count: int
    sensor_id: str
    joints: Dict[str, List[float]]
    velocity: Dict[str, List[float]] = None
    acceleration: Dict[str, List[float]] = None
    anomalies: List[str] = []


class SensorStatus(BaseModel):
    """Stato del sensore"""
    sensor_id: str
    is_online: bool = False
    frame_count: int = 0
    last_frame: Optional[MocapFrame] = None
    last_update: datetime = datetime.now()


class AlertEvent(BaseModel):
    """Evento di alert"""
    timestamp: int
    sensor_id: str
    alert_type: str  # "spike", "anomaly", "disconnection"
    joint: Optional[str] = None
    message: str
