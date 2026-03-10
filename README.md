# Mocap Telemetry Platform

Real-time pose detection system using YOLOv8 with HD video streaming, skeleton visualization, and comprehensive keypoint data recording via WebSocket connection.

## Features

**Real-Time Video Streaming** - HD (1280x720) webcam stream at 24 FPS with embedded skeleton visualization  
**17-Point COCO Skeleton** - Full body pose detection using YOLOv8  
**Color-Coded Visualization** - Left limbs (Blue), right limbs (Red), center (Green)  
**2D Keypoint Trajectories** - Real-time XY position graphs for all joints  
**Complete Data Recording** - Captures all 17 keypoints every frame with confidence scores  
**CSV Export** - Full dataset with NaN for missing detections  
**Configurable Sampling** - Adjust sampling frequency (30-100 Hz)  
**Web Dashboard** - React + Vite frontend with TailwindCSS and Recharts  

## Architecture

```
Webcam (USB)
    ↓
Sensor (YOLOv8 Pose Detection)  [sensor-simulator/main.py]
    ↓ WebSocket (ws://localhost:8001)
Backend Server (WebSocket Broker)  [backend/server.py]
    ↓ WebSocket (ws://localhost:8002)
React Dashboard  [frontend/]
    ↓ HTTP REST
API Endpoints (localhost:8000)
```

**Data Flow:**
1. YOLOv8 processes webcam frames → extracts 17 COCO keypoints
2. Frame data (video + keypoints) streamed to backend via WebSocket
3. Backend broadcasts to all connected dashboards
4. Dashboard displays video + skeleton + 2D trajectory plots
5. Recording captures all 17 keypoints at configurable frequency

## Prerequisites

- **Python 3.11+** (with pip)
- **Node.js 18+** (with npm)
- **Webcam** (USB or integrated)
- **GPU** (optional, recommended for better pose detection performance)

## Quick Start

### Option 1: One-Click Startup (Recommended)

**Windows:**
```bash
start.bat
```

**Linux/Mac:**
```bash
bash start-all.sh
```

This opens 3 separate terminal windows:
1. **Backend** - WebSocket server (ports 8000-8003)
2. **Frontend** - React dashboard (http://localhost:5173)
3. **Sensor** - YOLOv8 pose detection (webcam stream)

The dashboard initializes with video view showing the live skeleton overlay.

### Option 2: Manual Setup

**Terminal 1 - Backend:**
```bash
cd backend
pip install -r requirements.txt
python server.py
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Terminal 3 - Sensor:**
```bash
cd sensor-simulator
pip install -r requirements.txt
python main.py
```

Then open **http://localhost:5173** in your browser.

## First Time Setup

On first run, YOLOv8 will download the model (~47MB). This happens automatically:
```
Downloading https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8m-pose.pt to ...
```

Download takes ~30-60 seconds depending on internet speed. Subsequent runs load from cache instantly.

## Project Structure

```
mocap-telemetry/
├── sensor-simulator/          # YOLOv8 Pose Detection
│   ├── main.py               # Real-time pose detection + video encoding
│   └── requirements.txt
├── backend/                  # WebSocket Broker
│   ├── server.py             # Central data routing
│   ├── app/
│   │   ├── main.py
│   │   └── ws/               # WebSocket handlers
│   └── requirements.txt
├── frontend/                 # React Dashboard
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Dashboard.jsx          # Main UI + CSV export
│   │   │   ├── PoseVisualization.jsx  # Video display
│   │   │   ├── JointChart.jsx         # 2D trajectory plots
│   │   │   └── SensorStatus.jsx       # Connection status
│   │   ├── hooks/
│   │   │   └── useMocapWebSocket.js   # WebSocket management
│   │   └── utils/
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── start.bat                 # Windows startup script
├── start-all.sh              # Linux/Mac startup script
└── README.md
```

## Key Components

### Sensor Module (`sensor-simulator/main.py`)

**Real-time YOLOv8 pose detection with video streaming**

- **Model**: YOLOv8m-pose (17-point COCO skeleton)
- **Capture**: 1280x720 HD @ 24 FPS (throttled to avoid overwhelming network)
- **Keypoints**: nose, eyes (2), ears (2), shoulders (2), elbows (2), wrists (2), hips (2), knees (2), ankles (2)
- **Data per frame**:
  - Video: base64-encoded JPEG
  - Keypoints: x, y, confidence for each of 17 joints
  - Timestamp

**Skeleton Visualization**:
- **Blue** connections: Left limbs (left_shoulder → left_elbow → left_wrist, etc.)
- **Red** connections: Right limbs (right_shoulder → right_elbow → right_wrist, etc.)
- **Green** connections: Center (nose, eyes, torso connections)
- Confidence threshold: Only draws keypoints with confidence > 0

### Backend Server (`backend/server.py`)

**Python asyncio WebSocket broker with multi-client support**

- Receives pose detection frames from sensor
- Routes frames to all connected dashboard clients
- Endpoint: `ws://localhost:8001` (receive) → `ws://localhost:8002` (broadcast)
- HTTP API on port 8000 for health checks
- Handles frame buffering and client management

### Frontend Dashboard (`frontend/src/components/Dashboard.jsx`)

**React-based real-time monitoring and recording UI**

**Left Panel**:
- Live video with embedded skeleton overlay
- Connection status indicator
- Frame counter and detection statistics

**Right Panel**:
- **Keypoint Selector** - Toggle ON/OFF for 2D visualization (doesn't affect recording)
- **2D Trajectory Charts** - Real-time XY plots for selected keypoints using Recharts
- **Recording Controls**:
  - Start/Stop recording button
  - Sampling frequency input (30-100 Hz) with validation
  - Download CSV button
- **Status Display** - Frames recorded, session duration

**Data Recording**:
- Records **ALL 17 keypoints** regardless of UI selection
- Every frame from sensor is captured with full keypoint data + confidence
- Missing detections marked as `NaN`

## Dashboard Features

| Feature | Details |
|---------|---------|
| **Live Video** | HD (1280x720) webcam stream with skeleton overlay |
| **Skeleton** | Color-coded: Blue (left), Red (right), Green (center) |
| **Keypoint Selector** | Toggle visualization of individual joints (XY plots) |
| **2D Trajectories** | Real-time XY position graphs via Recharts |
| **Recording** | Captures all 17 keypoints every frame to memory |
| **Sampling Frequency** | Configurable 30-100 Hz with validation |
| **CSV Export** | Complete 17-keypoint dataset with NaN for missing |
| **Status Display** | Connection status, frame count, recording indicator |
| **Performance** | FPS counter, detection reliability metric |

## Usage Guide

1. **Dashboard Opens** - Live video appears in yellow-framed box on the left
2. **View Skeleton** - Color-coded joints visible on video (Blue/Red/Green)
3. **Select Keypoints** - Click joint buttons to toggle 2D trajectory display (right panel)
4. **Monitor FPS** - Frame rate displayed in video info (target: 24 FPS)
5. **Start Recording** - Click "Start Recording" button to capture data
6. **Record Duration** - Adjust sampling frequency (30-100 Hz) if needed
7. **Stop & Export** - Click "Stop Recording" then "Download CSV"
8. **CSV Contents** - All 17 keypoints with x, y, confidence per frame

**Recording Behavior:**
- Recording always captures **ALL 17 COCO keypoints**
- Keypoint selector only affects visualization (XY plots)
- Missing detections recorded as `NaN`
- Timestamp included for each frame

## API Endpoints

**WebSocket Connections:**
- `WS ws://localhost:8001` - Sensor → Backend (pose detection stream)
- `WS ws://localhost:8002` - Backend → Dashboard (broadcast to clients)

**HTTP REST API:**
- `GET http://localhost:8000/health` - Backend health check
- `GET http://localhost:8000/api/sensors` - Sensor status

**Ports:**
- `8000` - HTTP serve + WebSocket listener
- `8001` - Sensor WebSocket input
- `8002` - Dashboard WebSocket broadcast
- `8003` - Secondary dashboard connection

## Data Format

**WebSocket Frame (Sensor → Dashboard):**
```json
{
  "timestamp": 1710000000.123,
  "frame_count": 1234,
  "video": "iVBORw0KG...[base64 JPEG]",
  "keypoints": {
    "nose": {"x": 0.512, "y": 0.384, "confidence": 0.98},
    "left_eye": {"x": 0.502, "y": 0.365, "confidence": 0.97},
    "right_eye": {"x": 0.522, "y": 0.365, "confidence": 0.96},
    "left_ear": {"x": 0.482, "y": 0.355, "confidence": 0.95},
    "right_ear": {"x": 0.542, "y": 0.355, "confidence": 0.94},
    "left_shoulder": {"x": 0.412, "y": 0.512, "confidence": 0.99},
    "right_shoulder": {"x": 0.612, "y": 0.512, "confidence": 0.99},
    "left_elbow": {"x": 0.312, "y": 0.612, "confidence": 0.88},
    "right_elbow": {"x": 0.712, "y": 0.612, "confidence": 0.87},
    "left_wrist": {"x": 0.212, "y": 0.712, "confidence": 0.82},
    "right_wrist": {"x": 0.812, "y": 0.712, "confidence": 0.81},
    "left_hip": {"x": 0.442, "y": 0.712, "confidence": 0.95},
    "right_hip": {"x": 0.582, "y": 0.712, "confidence": 0.94},
    "left_knee": {"x": 0.442, "y": 0.812, "confidence": 0.92},
    "right_knee": {"x": 0.582, "y": 0.812, "confidence": 0.91},
    "left_ankle": {"x": 0.442, "y": 0.912, "confidence": 0.89},
    "right_ankle": {"x": 0.582, "y": 0.912, "confidence": 0.88}
  }
}
```

**CSV Export Format:**
```
timestamp,frame_count,nose_x,nose_y,nose_confidence,left_eye_x,left_eye_y,left_eye_confidence,...,right_ankle_confidence
1710000000.123,1,0.512,0.384,0.98,0.502,0.365,0.97,...,0.88
1710000000.164,2,0.513,0.385,0.97,NaN,NaN,NaN,...,0.87
1710000000.205,3,0.514,0.386,0.98,0.504,0.367,0.95,...,0.89
```

**Coordinates:**
- **x, y**: Normalized 0-1 (0=left/top, 1=right/bottom)
- **confidence**: 0-1 scale (detector confidence score)
- **NaN**: Keypoint not detected in frame

## Technology Stack

| Layer | Technology | Version |
|-------|----------|---------|
| **Pose Detection** | YOLOv8 (Ultralytics) | Latest |
| **Sensor** | Python asyncio | 3.11+ |
| **Backend** | Python asyncio, websockets | 3.11+ |
| **Frontend** | React + Vite | 18.x + 5.x |
| **Styling** | TailwindCSS | Latest |
| **Charts** | Recharts | Latest |
| **Video Encoding** | OpenCV (JPEG base64) | 4.x |
| **Protocol** | JSON over WebSocket | - |
| **Browsers** | Chrome, Firefox, Safari, Edge | Latest

## Troubleshooting

**Video not appearing on dashboard**
- Ensure sensor is running and printing frame updates to console
- Check browser console (F12) for WebSocket connection errors
- Verify backend is listening: check ports 8001-8002 are open
- Try refreshing browser page

**Low FPS (< 20)**
- YOLOv8 may be CPU-bottlenecked (GPU recommended)
- Check system resources (Activity Monitor / Task Manager)
- Reduce video resolution temporarily for testing
- Verify no other heavy processes running

**Skeleton not visible on video**
- Check confidence threshold > 0 (adjust view if needed)
- Ensure good lighting for webcam
- Face front of camera for optimal detection
- Verify person is fully in frame

**Connection refused on WebSocket**
- Ensure all 3 services are running (backend, frontend, sensor)
- Check ports 8000-8003 are available: `netstat -ano | findstr "8000"`
- Verify firewall not blocking localhost connections
- Restart all services if ports stuck

**Frontend won't load on localhost:5173**
- Run `npm install` in frontend directory
- Check Node version: `node -v` (must be 18+)
- Clear npm cache: `npm cache clean --force`
- Delete node_modules and package-lock.json, reinstall

**Sensor crash at startup**
- Verify webcam is accessible: check Device Manager
- Ensure webcam not in use by other application
- Try: `python main.py` from sensor-simulator directory with full path
- Check Python 3.11+ installed: `python --version`

**"No module named 'ultralytics'"**
- Run: `pip install -r requirements.txt` in sensor-simulator/
- Ensure using correct Python environment
- Try: `pip install ultralytics` directly

**"Permission denied" on Windows batch startup**
- Run PowerShell as Administrator
- Or use direct Python commands in Manual Setup section

**CSV file is empty or has NaN everywhere**
- Verify recording was started before person moved into frame
- Check that keypoints detected: look for non-NaN values in 1st few frames
- Ensure sampling frequency in valid range (30-100 Hz)
- Review browser console for WebSocket errors during recording

## Performance

| Metric | Target | Notes |
|--------|--------|-------|
| **Video FPS** | 24 FPS | Throttled at source to optimize bandwidth |
| **Latency** | < 100 ms | End-to-end (webcam → detection → display) |
| **Resolution** | 1280×720 HD | Quality 35 JPEG compression |
| **Bandwidth** | ~3-5 Mbps | Per active client, varies with motion |
| **Memory** | ~80 MB | Per 1000 frames recorded in browser |
| **CPU Usage** | 20-35% | YOLOv8 inference on single core |
| **GPU Usage** | Optional | Recommended for real-time performance |
| **Browsers** | Chrome, Firefox, Safari, Edge | Latest versions supported |

**System Requirements:**
- **Minimum**: CPU with 4+ cores, 8GB RAM, USB 2.0 webcam
- **Recommended**: GPU (NVIDIA/AMD), 16GB RAM, USB 3.0 webcam, stable WiFi/LAN

## Future Enhancements

- [ ] **3D Skeleton Viewer** - Three.js visualization with depth estimation
- [ ] **Multi-Person Detection** - Track multiple people simultaneously
- [ ] **Pose Analysis** - Angle calculations (joint angles, posture assessment)
- [ ] **Gesture Recognition** - Detect common body poses/gestures
- [ ] **Movement Classification** - ML-based activity recognition
- [ ] **Data Analytics** - Statistical analysis and trend visualization
- [ ] **Cloud Storage** - Export recordings to cloud services
- [ ] **Real-time Database** - InfluxDB or similar for larger datasets
- [ ] **Mobile App** - React Native dashboard for tablets
- [ ] **GPU Optimization** - CUDA/TensorRT acceleration

## Contributing

Contributions welcome! Areas of interest:
- Performance optimization (FPS, latency)
- Additional pose analysis features
- UI/UX improvements
- Platform-specific fixes

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or suggestions:
1. Check Troubleshooting section above
2. Review browser console (F12) for error messages
3. Verify all three services are running
4. Check port availability on localhost

## Acknowledgments

- **YOLOv8** by Ultralytics for pose detection model
- **Recharts** for charting library
- **TailwindCSS** for styling framework
- Database persistence
- Cloud deployment

## License

MIT
