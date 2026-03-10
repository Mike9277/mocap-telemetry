@echo off
REM Mocap Telemetry Platform - One-Click Startup
REM Avvia Backend, Frontend e Sensore Simulator

cd /d "%~dp0"

echo.
echo ======================================================================
echo.  Mocap Telemetry Platform - Starting All Services
echo.
echo ======================================================================
echo.

REM 1. Backend
echo 1. Avvio Backend...
start "Backend - WebSocket Server" cmd /k "cd backend && python server.py"
timeout /t 2 /nobreak

REM 2. Frontend
echo 2. Avvio Frontend...
start "Frontend - React Dashboard" cmd /k "cd frontend && npm run dev"
timeout /t 2 /nobreak

REM 3. Sensore Simulator
echo 3. Avvio Sensore Simulator...
start "Sensore Simulator - 30 Hz" cmd /k "cd sensor-simulator && python main.py"
timeout /t 2 /nobreak

echo.
echo ======================================================================
echo  TUTTI I SERVIZI AVVIATI!
echo ======================================================================
echo.
echo Backend:  ws://localhost:8001-8003
echo Frontend: http://localhost:5173
echo Sensore:  Streaming...
echo.
echo Apri il browser: http://localhost:5173
echo.
pause
