####################
#  main.py
#
# Real-time Wholebody Pose Detection Sensor
# Uses MediaPipe Tasks API (0.10.30+)
#   - PoseLandmarker  : body 33 pts
#   - HandLandmarker  : hands 21 pts x 2
# Computes joint angles in real-time via angle_utils
# Sends enriched data via WebSocket to the backend
#
# Author: Michelangelo Guaitolini, 12.03.2026
####################

import asyncio
import base64
import json
import os
import time
import urllib.request
from typing import Dict, List, Optional

import cv2
import mediapipe as mp
import numpy as np
import websockets
from websockets.asyncio.client import ClientConnection

from angle_utils import compute_all_angles

# -- MediaPipe Tasks API -------------------------------------------------------
BaseOptions        = mp.tasks.BaseOptions
PoseLandmarker     = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOpts = mp.tasks.vision.PoseLandmarkerOptions
HandLandmarker     = mp.tasks.vision.HandLandmarker
HandLandmarkerOpts = mp.tasks.vision.HandLandmarkerOptions
RunningMode        = mp.tasks.vision.RunningMode

draw_utils  = mp.tasks.vision.drawing_utils
draw_styles = mp.tasks.vision.drawing_styles
DrawingSpec = mp.tasks.vision.drawing_utils.DrawingSpec

PoseConns = mp.tasks.vision.PoseLandmarksConnections.POSE_LANDMARKS
HandConns = mp.tasks.vision.HandLandmarksConnections.HAND_CONNECTIONS

# -- Model paths & URLs --------------------------------------------------------
MODEL_DIR  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
POSE_MODEL = os.path.join(MODEL_DIR, "pose_landmarker_full.task")
HAND_MODEL = os.path.join(MODEL_DIR, "hand_landmarker.task")

POSE_URL = ("https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
            "pose_landmarker_full/float16/latest/pose_landmarker_full.task")
HAND_URL = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
            "hand_landmarker/float16/latest/hand_landmarker.task")


def _download(url: str, dest: str) -> None:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"  Downloading {os.path.basename(dest)} ...")
    urllib.request.urlretrieve(url, dest)
    print(f"  OK  {dest}")


def ensure_models() -> None:
    if not os.path.exists(POSE_MODEL):
        _download(POSE_URL, POSE_MODEL)
    else:
        print(f"  OK  {os.path.basename(POSE_MODEL)}")
    if not os.path.exists(HAND_MODEL):
        _download(HAND_URL, HAND_MODEL)
    else:
        print(f"  OK  {os.path.basename(HAND_MODEL)}")


# -- Landmark name tables ------------------------------------------------------
POSE_LANDMARK_NAMES = [
    "nose",
    "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear",
    "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder",
    "left_elbow", "right_elbow",
    "left_wrist", "right_wrist",
    "left_pinky", "right_pinky",
    "left_index", "right_index",
    "left_thumb", "right_thumb",
    "left_hip", "right_hip",
    "left_knee", "right_knee",
    "left_ankle", "right_ankle",
    "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]

HAND_LANDMARK_NAMES = [
    "wrist",
    "thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip",
    "index_finger_mcp", "index_finger_pip", "index_finger_dip", "index_finger_tip",
    "middle_finger_mcp", "middle_finger_pip", "middle_finger_dip", "middle_finger_tip",
    "ring_finger_mcp", "ring_finger_pip", "ring_finger_dip", "ring_finger_tip",
    "pinky_mcp", "pinky_pip", "pinky_dip", "pinky_tip",
]


# -- Sensor --------------------------------------------------------------------
class WholeBodySensor:
    FREQUENCY      = 24
    FRAME_INTERVAL = 1.0 / FREQUENCY

    def __init__(self, sensor_id: str = "mediapipe_wholebody_001", camera_index: int = 0):
        self.sensor_id   = sensor_id
        self.frame_count = 0
        self.start_time  = time.time()
        self.websocket: Optional[ClientConnection] = None

        print(f"Camera {camera_index} ...")
        self.cap = cv2.VideoCapture(camera_index)
        if not self.cap.isOpened():
            raise RuntimeError(f"Cannot open webcam {camera_index}")
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        self.cap.set(cv2.CAP_PROP_FPS, self.FREQUENCY)

        print("Models ...")
        ensure_models()

        self.pose_landmarker = PoseLandmarker.create_from_options(
            PoseLandmarkerOpts(
                base_options=BaseOptions(model_asset_path=POSE_MODEL),
                running_mode=RunningMode.VIDEO,
                num_poses=1,
                min_pose_detection_confidence=0.5,
                min_pose_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        )
        self.hand_landmarker = HandLandmarker.create_from_options(
            HandLandmarkerOpts(
                base_options=BaseOptions(model_asset_path=HAND_MODEL),
                running_mode=RunningMode.VIDEO,
                num_hands=2,
                min_hand_detection_confidence=0.5,
                min_hand_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        )
        print("Ready.\n")

    # -- helpers ---------------------------------------------------------------

    def _lm_to_dict(self, landmarks: list, names: List[str], h: int, w: int) -> dict:
        out = {}
        for i, name in enumerate(names):
            lm = landmarks[i]
            out[name] = {
                "x":          round(float(lm.x), 5),
                "y":          round(float(lm.y), 5),
                "z":          round(float(lm.z), 5),
                "confidence": round(float(getattr(lm, "visibility", None) or getattr(lm, "presence", None) or 1.0), 3),
                "x_pixel":    int(lm.x * w),
                "y_pixel":    int(lm.y * h),
            }
        return out

    # -- drawing ---------------------------------------------------------------

    def _draw_pose(self, frame, pose_lms):
        draw_utils.draw_landmarks(
            frame, pose_lms, PoseConns,
            landmark_drawing_spec=draw_styles.get_default_pose_landmarks_style(),
            connection_drawing_spec=DrawingSpec(color=(0, 200, 255), thickness=2),
        )

    def _draw_hand(self, frame, hand_lms, color):
        draw_utils.draw_landmarks(
            frame, hand_lms, HandConns,
            landmark_drawing_spec=DrawingSpec(color=color, thickness=2, circle_radius=3),
            connection_drawing_spec=DrawingSpec(color=color, thickness=2),
        )

    def _draw_angles(self, frame, pose_lms, angles, h, w):
        if not pose_lms:
            return
        label_pos = {
            "left_shoulder": 11, "right_shoulder": 12,
            "left_elbow":    13, "right_elbow":    14,
            "left_wrist":    15, "right_wrist":    16,
            "left_hip":      23, "right_hip":      24,
            "left_knee":     25, "right_knee":     26,
            "left_ankle":    27, "right_ankle":    28,
        }
        for aname, idx in label_pos.items():
            if aname not in angles:
                continue
            lm  = pose_lms[idx]
            val = angles[aname]
            pt  = (int(lm.x * w), int(lm.y * h))
            label = f"{val:.0f}\u00b0"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            pad = 4
            ov = frame.copy()
            cv2.rectangle(ov, (pt[0]-tw//2-pad, pt[1]-th-pad-6),
                              (pt[0]+tw//2+pad, pt[1]-pad-2), (10,15,20), -1)
            cv2.addWeighted(ov, 0.7, frame, 0.3, 0, frame)
            color = (0, 230, 255) if "left" in aname else (50, 120, 255)
            cv2.putText(frame, label, (pt[0]-tw//2, pt[1]-pad-2),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)

    # -- frame -----------------------------------------------------------------

    def _process_frame(self, frame: np.ndarray) -> dict:
        h, w  = frame.shape[:2]
        ts_ms = int(time.time() * 1000)
        ts_mp = self.frame_count * int(1000 / self.FREQUENCY)

        rgb    = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        pose_result = self.pose_landmarker.detect_for_video(mp_img, ts_mp)
        hand_result = self.hand_landmarker.detect_for_video(mp_img, ts_mp)

        fd: dict = {
            "timestamp":            ts_ms,
            "frame_count":          self.frame_count,
            "sensor_id":            self.sensor_id,
            "image_shape":          [h, w],
            "has_person":           False,
            "keypoints":            {},
            "left_hand_keypoints":  {},
            "right_hand_keypoints": {},
            "joint_angles":         {},
            "joints":               {},
        }

        pose_lms = None
        if pose_result.pose_landmarks:
            pose_lms         = pose_result.pose_landmarks[0]
            fd["has_person"] = True
            fd["keypoints"]  = self._lm_to_dict(pose_lms, POSE_LANDMARK_NAMES, h, w)
            kp = fd["keypoints"]
            fd["joints"] = {
                "head":           [kp["nose"]["x"],           kp["nose"]["y"],           kp["nose"]["confidence"]],
                "shoulder_left":  [kp["left_shoulder"]["x"],  kp["left_shoulder"]["y"],  kp["left_shoulder"]["confidence"]],
                "shoulder_right": [kp["right_shoulder"]["x"], kp["right_shoulder"]["y"], kp["right_shoulder"]["confidence"]],
                "hand_left":      [kp["left_wrist"]["x"],     kp["left_wrist"]["y"],     kp["left_wrist"]["confidence"]],
                "hand_right":     [kp["right_wrist"]["x"],    kp["right_wrist"]["y"],    kp["right_wrist"]["confidence"]],
            }
            self._draw_pose(frame, pose_lms)

        left_hand_lms = right_hand_lms = None
        if hand_result.hand_landmarks:
            for i, hand_lms in enumerate(hand_result.hand_landmarks):
                side = hand_result.handedness[i][0].category_name
                if side == "Left":
                    left_hand_lms           = hand_lms
                    fd["left_hand_keypoints"] = self._lm_to_dict(hand_lms, HAND_LANDMARK_NAMES, h, w)
                    self._draw_hand(frame, hand_lms, (57, 255, 20))
                else:
                    right_hand_lms            = hand_lms
                    fd["right_hand_keypoints"] = self._lm_to_dict(hand_lms, HAND_LANDMARK_NAMES, h, w)
                    self._draw_hand(frame, hand_lms, (0, 100, 255))

        fd["joint_angles"] = compute_all_angles(
            pose_landmarks=pose_lms,
            left_hand_landmarks=left_hand_lms,
            right_hand_landmarks=right_hand_lms,
        )
        self._draw_angles(frame, pose_lms, fd["joint_angles"], h, w)

        self.frame_count += 1
        return fd

    def _encode(self, frame: np.ndarray, quality: int = 72) -> str:
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return base64.b64encode(buf).decode("utf-8")

    # -- websocket -------------------------------------------------------------

    async def stream_to_websocket(self, uri: str) -> None:
        try:
            async with websockets.connect(uri, max_size=10 * 1024 * 1024) as ws:
                print(f"Connected to {uri}")
                next_t = time.perf_counter()
                while True:
                    now = time.perf_counter()
                    if now < next_t:
                        await asyncio.sleep(next_t - now)
                    ret, frame = self.cap.read()
                    if not ret:
                        await asyncio.sleep(0.05)
                        continue
                    frame = cv2.flip(frame, 1)
                    fd = self._process_frame(frame)
                    fd["video"] = self._encode(frame)
                    try:
                        await ws.send(json.dumps(fd))
                    except websockets.exceptions.ConnectionClosed:
                        print("Connection closed.")
                        break
                    if self.frame_count % 30 == 0:
                        e   = time.time() - self.start_time
                        fps = self.frame_count / e if e > 0 else 0
                        na  = len(fd["joint_angles"])
                        lh  = "OK" if fd["left_hand_keypoints"]  else "--"
                        rh  = "OK" if fd["right_hand_keypoints"] else "--"
                        print(f"frame {self.frame_count:5d} | {fps:4.1f} fps | angles {na:2d} | LH {lh} | RH {rh}")
                    next_t += self.FRAME_INTERVAL
        except (OSError, ConnectionRefusedError):
            print(f"Connection refused: {uri}\n  Start backend first.")
        finally:
            self.cap.release()
            self.pose_landmarker.close()
            self.hand_landmarker.close()
            print("Sensor stopped.")


# -- Entry point ---------------------------------------------------------------
async def main():
    print("=" * 55)
    print("  Wholebody Sensor - MediaPipe Tasks API 0.10.30+")
    print("=" * 55)
    sensor = WholeBodySensor(sensor_id="mediapipe_wholebody_001", camera_index=0)
    uri = "ws://localhost:8001"
    while True:
        try:
            await sensor.stream_to_websocket(uri)
        except KeyboardInterrupt:
            break
        except Exception as exc:
            import traceback
            traceback.print_exc()
            print("Retrying in 3 s ...")
            await asyncio.sleep(3)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Stopped.")