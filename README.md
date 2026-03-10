# Mocap Telemetry Platform

A real-time motion capture simulation and visualization system with WebSocket streaming, multi-channel data recording, and CSV export capabilities.

## Features

✨ **Real-Time Streaming** - 30 Hz motion capture simulator with realistic 3D movement  
📊 **Multi-Channel Visualization** - View multiple joints simultaneously  
📈 **Live Charts** - Recharts-based visualization of X/Y/Z coordinates  
🎬 **Recording & Export** - Start/stop recording and export data as CSV  
⚙️ **Configurable Sampling** - Adjust sampling frequency (1-200 Hz)  
🌐 **Web Dashboard** - React + Vite frontend with TailwindCSS styling  

## Architecture

```
Sensor Simulator (Python)
         ↓ WebSocket (ws://localhost:8001)
    Backend Server (Python asyncio)
         ↓ WebSocket (ws://localhost:8002)
    React Dashboard
         ↓ HTTP REST
    API Endpoints (localhost:8000)
```

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **npm** (comes with Node.js)

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

This opens 3 separate windows:
1. Backend server (ws://localhost:8001-8003)
2. Frontend dashboard (http://localhost:5173)
3. Sensor simulator (streaming 30 Hz)

### Option 2: Manual Setup

**Terminal 1 - Backend:**
```bash
cd backend
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
python main.py
```

Then open http://localhost:5173 in your browser.

## Project Structure

```
mocap-telemetry/
├── sensor-simulator/     # Motion capture data generator
│   └── main.py
├── backend/             # Central processing hub
│   ├── server.py
│   └── requirements.txt
├── frontend/            # React dashboard
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── App.jsx
│   └── package.json
├── start.bat            # Windows startup
├── start-all.sh         # Linux/Mac startup
└── README.md
```

## Key Components

### Sensor Simulator
- Generates realistic 3D motion data at 30 Hz
- 5 joints: head, shoulders (L/R), hands (L/R)
- Features: smooth movement, sine-wave motion, Gaussian noise
- Streams via WebSocket to backend

### Backend Server
- Pure Python asyncio (no framework dependencies)
- WebSocket handlers for sensors and dashboards
- HTTP REST API for status polling
- In-memory frame buffering
- Multi-connection support

### Frontend Dashboard
- React 18 with Hooks
- TailwindCSS styling
- Recharts visualization
- Real-time WebSocket connection

## Dashboard Features

| Feature | Details |
|---------|---------|
| **Live Metrics** | Frames received, sampling frequency, recording count |
| **Multi-Channel** | Select/deselect joints with toggle buttons |
| **Live Charts** | Real-time X/Y/Z position graphs |
| **Recording** | Start/stop recording, clear data, export CSV |
| **Sampling** | Adjustable frequency input (1-200 Hz) |
| **Status** | Backend connectivity indicator |

## Usage

1. **Select Channels** - Click joint buttons to toggle visualization
2. **View Data** - Charts render in real-time for selected joints
3. **Record** - Click "Start Recording" button
4. **Export** - Click "Download CSV" to save data
5. **Adjust** - Change sampling frequency with numeric input

## API Endpoints

- `GET http://localhost:8000/api/sensors` - Current sensor status
- `GET http://localhost:8000/health` - Backend health check
- `WS ws://localhost:8001` - Sensor connection
- `WS ws://localhost:8002` - Dashboard connection
- `WS ws://localhost:8003` - Health monitoring

## Data Format

Each frame contains:
```json
{
  "timestamp": 1710000000,
  "frame_count": 1234,
  "sensor_id": "mocap_001",
  "joints": {
    "head": [x, y, z],
    "shoulder_left": [x, y, z],
    "shoulder_right": [x, y, z],
    "hand_left": [x, y, z],
    "hand_right": [x, y, z]
  }
}
```

## Technology Stack

| Layer | Technology |
|-------|----------|
| **Backend** | Python 3.11, asyncio, websockets |
| **Frontend** | React 18, Vite, TailwindCSS, Recharts |
| **Protocol** | JSON over WebSocket |
| **Startup** | Batch/Shell scripts |

## Troubleshooting

**"Connection refused" on WebSocket**
- Ensure backend is running
- Check if ports 8000-8003 are available
- Verify firewall settings

**Frontend won't load**
- Run `npm install` in frontend directory
- Check Node version: `node -v` (should be 18+)

**Sensor not streaming**
- Ensure Python 3.11+ installed
- Check backend is running
- Review browser DevTools Network tab

**Permission denied on Windows**
- Run PowerShell as Administrator
- Or use: `powershell -ExecutionPolicy Bypass -File .\start-all.ps1`

## Performance

- **Sensor Rate**: 30 Hz streaming
- **Memory**: ~50MB per 1000 frames
- **Latency**: <50ms (localhost)
- **Browsers**: Chrome, Firefox, Safari, Edge (latest)

## Future Ideas

- 3D skeleton viewer (Three.js)
- Anomaly detection
- Multi-sensor sync
- Database persistence
- Cloud deployment

## License

MIT
