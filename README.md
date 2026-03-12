# Mocap Telemetry Platform

Real-time **wholebody** pose detection system using **MediaPipe Tasks API** with HD video streaming, joint angle estimation, hand tracking, and comprehensive data recording via WebSocket.

## Features

| Feature | Details |
|---------|---------|
| **Wholebody Detection** | Body 33 pts + Left hand 21 pts + Right hand 21 pts via MediaPipe Holistic Tasks |
| **Joint Angle Estimation** | 13 body angles + 10 finger angles per hand (MCP + PIP) — computed in real-time |
| **Angle Overlay** | Degree values drawn directly on the video stream at each joint |
| **HD Video Streaming** | 1280×720 @ 24 FPS with skeleton + angle labels embedded |
| **2D Keypoint Trajectories** | Real-time XY position graphs for selectable joints |
| **Joint Angle Panel** | Live gauges, progress bars, and sparkline trend charts per articulation |
| **Complete Data Recording** | Body keypoints (33), hand keypoints (21×2), all angles — every frame |
| **CSV Export** | Full dataset with NaN for missing detections |
| **Configurable Sampling** | Adjust sampling frequency (10–60 Hz) |
| **Web Dashboard** | React + Vite + TailwindCSS + Recharts |

## Architecture

```
Webcam (USB / Integrated)
    ↓
Sensor — MediaPipe Tasks API  [sensor-simulator/main.py]
    • PoseLandmarker  (body 33 pts)
    • HandLandmarker  (hands 21 pts × 2)
    • angle_utils.py  (joint angle computation)
    ↓ WebSocket (ws://localhost:8001)
Backend Server — WebSocket Broker  [backend/server.py]
    ↓ WebSocket (ws://localhost:8002)
React Dashboard  [frontend/]
    ↓ HTTP REST
API Endpoints  (localhost:8000)
```

**Data Flow:**
1. MediaPipe processes each webcam frame → extracts body + hand landmarks
2. `angle_utils.py` computes all joint angles (3D dot-product method)
3. Angle labels are drawn on the video frame in real time
4. Frame payload (video + keypoints + angles) streams to backend via WebSocket
5. Backend broadcasts to all connected dashboards
6. Dashboard shows video, 2D trajectories, and the Joint Angle Panel
7. Recording captures all keypoints and all angles at configurable frequency

## Joint Angles Computed

**Body (13 angles):**

| Angle | Vertex | Notes |
|-------|--------|-------|
| `left_shoulder` / `right_shoulder` | Shoulder | Hip – Shoulder – Elbow |
| `left_elbow` / `right_elbow` | Elbow | Shoulder – Elbow – Wrist |
| `left_wrist` / `right_wrist` | Wrist | Elbow – Wrist – Index MCP |
| `left_hip` / `right_hip` | Hip | Shoulder – Hip – Knee |
| `left_knee` / `right_knee` | Knee | Hip – Knee – Ankle |
| `left_ankle` / `right_ankle` | Ankle | Knee – Ankle – Foot Index |
| `trunk_lean` | Spine | Angle of spine vs. vertical axis |
| `shoulder_tilt` | Shoulder line | Angle of shoulder line vs. horizontal |

**Hands (10 angles per hand = 20 total):**
- Thumb, Index, Middle, Ring, Pinky → **MCP** and **PIP** flexion angles

All angles use the formula: `arccos(BA·BC / |BA||BC|)` in 3D space. Range: 0°–180°.

## Prerequisites

- **Python 3.11+** (with pip)
- **Node.js 18+** (with npm)
- **Webcam** (USB or integrated)
- **Internet connection** on first run (to download model files ~40 MB total)

## Quick Start

### Option 1: One-Click (Recommended)

**Windows:**
```bash
start.bat
```

**Linux/Mac:**
```bash
bash start-all.sh
```

Opens 3 terminal windows:
1. **Backend** — WebSocket broker (ports 8000–8003)
2. **Frontend** — React dashboard (http://localhost:5173)
3. **Sensor** — MediaPipe wholebody stream

### Option 2: Manual

**Terminal 1 — Backend:**
```bash
cd backend
pip install -r requirements.txt
python server.py
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Terminal 3 — Sensor:**
```bash
cd sensor-simulator
pip install -r requirements.txt
python main.py
```

Then open **http://localhost:5173**.

## First Time Setup

On first run, the sensor automatically downloads the MediaPipe model files into `sensor-simulator/models/`:

```
Downloading pose_landmarker_full.task ...   (~30 MB)
Downloading hand_landmarker.task ...        (~9 MB)
```

Download takes ~20–60 seconds depending on connection speed. Subsequent runs load from cache instantly.

## Project Structure

```
mocap-telemetry/
├── sensor-simulator/
│   ├── main.py               # MediaPipe Tasks sensor — body + hands + angles
│   ├── angle_utils.py        # Joint angle computation (3D dot-product)
│   ├── requirements.txt      # mediapipe>=0.10.30, opencv, websockets, numpy
│   └── models/               # Auto-downloaded .task model files (gitignored)
│       ├── pose_landmarker_full.task
│       └── hand_landmarker.task
├── backend/
│   ├── server.py             # Asyncio WebSocket broker
│   ├── app/
│   │   ├── main.py
│   │   └── ws/
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── components/
│       │   ├── Dashboard.jsx          # Main UI — wholebody mode + legacy mocap
│       │   ├── JointAnglePanel.jsx    # Real-time angle gauges + sparklines
│       │   ├── PoseVisualization.jsx  # Live video display
│       │   ├── JointChart.jsx         # 2D trajectory plots (legacy)
│       │   ├── KeypointXYTraces.jsx   # XY coordinate charts
│       │   ├── KeypointTraces.jsx     # 2D scatter traces
│       │   └── SensorStatus.jsx       # Connection indicator
│       └── hooks/
│           └── useMocapWebSocket.js   # WebSocket + jointAngles + angleHistory state
├── start.bat
├── start-all.sh
└── README.md
```

## Key Components

### Sensor (`sensor-simulator/main.py`)

- **Models**: `PoseLandmarker` (full, float16) + `HandLandmarker` (float16) via MediaPipe Tasks API
- **Running mode**: `VIDEO` (monotonic timestamp per frame)
- **Capture**: 1280×720 @ 24 FPS
- **Per-frame output**:
  - `keypoints` — 33 body landmarks (x, y, z, confidence, pixel coords)
  - `left_hand_keypoints` / `right_hand_keypoints` — 21 landmarks each
  - `joint_angles` — flat dict of all computed angles in degrees
  - `video` — base64-encoded JPEG with skeleton + angle labels
  - `joints` — legacy 5-joint dict (backward-compatible)

### Angle Utils (`sensor-simulator/angle_utils.py`)

Pure-NumPy module. Key function:

```python
compute_all_angles(pose_landmarks, left_hand_landmarks, right_hand_landmarks) → dict
```

Internally uses:
```python
angle_at_vertex(a, b, c) = degrees(arccos(clip(dot(b→a, b→c) / (|b→a| · |b→c|), -1, 1)))
```

Landmarks with `visibility < 0.4` are skipped to avoid noisy readings.

### Frontend Hook (`useMocapWebSocket.js`)

Exposes:
- `jointAngles` — latest snapshot `{ angle_name: degrees }`
- `angleHistory` — ring buffer (100 frames) `{ angle_name: [d0, d1, ...] }`
- `getAngleHistory(name)` — helper for sparkline components

### Joint Angle Panel (`JointAnglePanel.jsx`)

- 7 body groups (Shoulders, Elbows, Wrists, Hips, Knees, Ankles, Trunk)
- Each card: numeric value + colour-coded progress bar + Recharts sparkline
- Separate hand section (toggle ON/OFF) with MCP + PIP bars for all 5 fingers
- Alert highlight (red pulse) when angle exceeds physiological range limits

## Dashboard Features

| Feature | Details |
|---------|---------|
| **Live Video** | HD stream with MediaPipe skeleton + angle labels overlay |
| **Skeleton colours** | Body: cyan/orange; Left hand: green; Right hand: blue |
| **Angle overlay** | Degree labels drawn at each joint directly on video |
| **Joint Angle Panel** | Gauges + sparklines for 13 body + 20 finger angles |
| **Keypoint Selector** | Toggle individual joints for XY trajectory charts |
| **Recording** | Captures body kpts + hand kpts + all angles every frame |
| **CSV Export** | 33 body cols + 21×2 hand cols + N angle cols + NaN for missing |
| **Status Panel** | Person detected, body kpts count, hand presence, angle count |

## Usage Guide

1. Launch all three services (see Quick Start)
2. Open **http://localhost:5173** — live skeleton appears automatically
3. Move in front of the camera — angle values appear on the video and in the panel
4. Use the **keypoint selector** to add XY trajectory charts for specific joints
5. Toggle **Hands ON/OFF** in the Joint Angle Panel to show/hide finger angles
6. Click **Start Recording** to begin capturing data
7. Click **Stop Recording** then **Download CSV** to export

## Data Format

**WebSocket Frame (Sensor → Dashboard):**
```json
{
  "timestamp": 1773309758123,
  "frame_count": 1234,
  "sensor_id": "mediapipe_wholebody_001",
  "has_person": true,
  "keypoints": {
    "nose":           {"x": 0.512, "y": 0.384, "z": -0.12, "confidence": 0.98, "x_pixel": 655, "y_pixel": 277},
    "left_shoulder":  {"x": 0.412, "y": 0.512, "z": -0.05, "confidence": 0.99, "x_pixel": 527, "y_pixel": 369}
  },
  "left_hand_keypoints": {
    "wrist":          {"x": 0.21, "y": 0.71, "z": 0.0, "confidence": 1.0, "x_pixel": 269, "y_pixel": 512}
  },
  "right_hand_keypoints": { ... },
  "joint_angles": {
    "left_elbow":     142.3,
    "right_elbow":    138.7,
    "left_knee":      171.2,
    "left_index_mcp": 24.5,
    "left_index_pip": 18.1
  },
  "joints": {
    "head":           [0.512, 0.384, 0.98],
    "shoulder_left":  [0.412, 0.512, 0.99]
  },
  "video": "iVBORw0KG...[base64 JPEG]"
}
```

**CSV Columns (Download):**
```
timestamp, frame_count, sensor_id,
nose_x, nose_y, nose_z, nose_conf, ...(×33 body),
lh_wrist_x, lh_wrist_y, lh_wrist_conf, ...(×21 left hand),
rh_wrist_x, rh_wrist_y, rh_wrist_conf, ...(×21 right hand),
left_elbow, right_elbow, left_knee, ...(all angle columns)
```

## API Endpoints

| Type | URL | Direction |
|------|-----|-----------|
| WebSocket | `ws://localhost:8001` | Sensor → Backend |
| WebSocket | `ws://localhost:8002` | Backend → Dashboard |
| HTTP GET | `http://localhost:8000/health` | Health check |
| HTTP GET | `http://localhost:8000/api/sensors` | Sensor status |

## Troubleshooting

**`ModuleNotFoundError: No module named 'mediapipe'`**
```bash
cd sensor-simulator
pip install -r requirements.txt
```

**`AttributeError: module 'mediapipe' has no attribute 'solutions'`**
- Versions 0.10.30+ removed `mp.solutions`. The current `main.py` uses the Tasks API directly — make sure you have the latest version of the file.

**Model download fails**
- Check internet connection; files are hosted on `storage.googleapis.com`
- Or download manually and place in `sensor-simulator/models/`:
  - `pose_landmarker_full.task`
  - `hand_landmarker.task`

**Low FPS (< 15)**
- MediaPipe Tasks runs on CPU by default — normal on laptops (~4–8 FPS per model)
- Reduce `model_complexity` or switch to `pose_landmarker_lite.task` for faster inference
- Ensure no other heavy applications running

**Skeleton not visible / angles all `---`**
- Ensure good lighting and that the full body is in frame
- `confidence threshold = 0.5` — increase distance from camera if detection is unstable
- Check browser console for WebSocket errors

**Webcam not found**
- Change `camera_index=0` to `camera_index=1` at the bottom of `main.py`

**Connection refused on WebSocket**
- Ensure backend is running first, then sensor, then open the browser
- Check ports 8001–8002 are not blocked: `netstat -ano | findstr "8001"`

**CSV has NaN everywhere**
- Start recording only after the skeleton is visible on screen
- Missing hand detections are normal when hands are not in frame

## Performance

| Metric | Typical | Notes |
|--------|---------|-------|
| **Video FPS** | 24 FPS | Throttled at source |
| **Inference FPS** | 4–10 FPS | CPU-only, depends on hardware |
| **Latency** | 100–300 ms | End-to-end webcam → display |
| **Resolution** | 1280×720 | JPEG quality 72 |
| **Body landmarks** | 33 pts | PoseLandmarker full |
| **Hand landmarks** | 21 pts × 2 | HandLandmarker |
| **Angles computed** | up to 33 | 13 body + 10/hand |

## License

MIT License — see LICENSE file for details.

## Acknowledgments

- **MediaPipe** by Google for the Tasks API and landmark models
- **Recharts** for the charting library
- **TailwindCSS** for the styling framework
- **websockets** (Python) for async WebSocket support