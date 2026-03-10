"""Database e storage per dati mocap"""

import sqlite3
import json
from datetime import datetime
from typing import List, Dict
import asyncio


class DataStore:
    """Gestisce lo storage dei dati mocap"""
    
    def __init__(self, db_path: str = "mocap_data.db"):
        self.db_path = db_path
        self.init_db()
    
    def init_db(self):
        """Inizializza il database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Tabella per i frame
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS frames (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER,
                frame_count INTEGER,
                sensor_id TEXT,
                joints_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Tabella per alert
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER,
                sensor_id TEXT,
                alert_type TEXT,
                joint TEXT,
                message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        conn.commit()
        conn.close()
    
    async def save_frame(self, frame_data: Dict):
        """Salva un frame nel database"""
        # Esegui in thread per non bloccare
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._save_frame_sync, frame_data)
    
    def _save_frame_sync(self, frame_data: Dict):
        """Versione sincrona di save_frame"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO frames (timestamp, frame_count, sensor_id, joints_data)
            VALUES (?, ?, ?, ?)
        """, (
            frame_data["timestamp"],
            frame_data["frame_count"],
            frame_data["sensor_id"],
            json.dumps(frame_data["joints"])
        ))
        
        conn.commit()
        conn.close()
    
    def get_joint_history(self, joint: str, limit: int = 100) -> List[Dict]:
        """Recupera lo storico di un joint"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT timestamp, joints_data 
            FROM frames 
            ORDER BY timestamp DESC 
            LIMIT ?
        """, (limit,))
        
        rows = cursor.fetchall()
        conn.close()
        
        # Estrai il joint specifico da ogni frame
        history = []
        for timestamp, joints_data in reversed(rows):
            joints = json.loads(joints_data)
            if joint in joints:
                history.append({
                    "timestamp": timestamp,
                    "position": joints[joint]
                })
        
        return history
    
    def get_recent_frames(self, minutes: int = 5) -> List[Dict]:
        """Recupera i frame recenti"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Timestamp di cutoff (5 minuti fa in secondi)
        cutoff = int(datetime.now().timestamp() * 1000) - (minutes * 60 * 1000)
        
        cursor.execute("""
            SELECT timestamp, frame_count, sensor_id, joints_data
            FROM frames 
            WHERE timestamp > ?
            ORDER BY timestamp DESC
        """, (cutoff,))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [
            {
                "timestamp": row[0],
                "frame_count": row[1],
                "sensor_id": row[2],
                "joints": json.loads(row[3])
            }
            for row in rows
        ]
