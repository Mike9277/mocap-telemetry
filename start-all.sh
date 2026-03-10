#!/bin/bash

################################################################################
# Mocap Telemetry Platform - Universal Startup Script
# Avvia Backend, Frontend e Sensore Simulator in parallelo
################################################################################

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
SENSOR_DIR="$PROJECT_ROOT/sensor-simulator"

echo -e "\n${CYAN}$(printf '=%.0s' {1..70})${NC}"
echo -e "${CYAN}🚀 Mocap Telemetry Platform - Startup${NC}"
echo -e "${CYAN}$(printf '=%.0s' {1..70})${NC}\n"

# Verifica directory
for dir in "$BACKEND_DIR" "$FRONTEND_DIR" "$SENSOR_DIR"; do
    if [ ! -d "$dir" ]; then
        echo -e "${RED}✗ Directory non trovata: $dir${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✓ Tutte le directory trovate\n${NC}"

# Funzione per catturare i PID dei processi figli
declare -a PIDS

# 1. Backend
echo -e "${YELLOW}1️⃣  Avvio Backend...${NC}"
(
    cd "$BACKEND_DIR"
    echo -e "\n${CYAN}⚙️  BACKEND - WebSocket Server${NC}"
    echo -e "${CYAN}$(printf '=%.0s' {1..50})${NC}"
    echo -e "${GREEN}In ascolto su:${NC}"
    echo -e "${GREEN}  - Sensori:   ws://localhost:8001${NC}"
    echo -e "${GREEN}  - Dashboard: ws://localhost:8002${NC}"
    echo -e "${GREEN}  - Health:    ws://localhost:8003\n${NC}"
    python server.py
) &
PIDS+=($!)
echo -e "${GREEN}   ✓ Backend avviato (PID: $!)\n${NC}"

# Attendi che il backend si accenda
sleep 2

# 2. Frontend
echo -e "${YELLOW}2️⃣  Avvio Frontend...${NC}"
(
    cd "$FRONTEND_DIR"
    echo -e "\n${CYAN}📱 FRONTEND - React Dashboard${NC}"
    echo -e "${CYAN}$(printf '=%.0s' {1..50})${NC}"
    echo -e "${GREEN}🌐 Apri il browser su: http://localhost:5173\n${NC}"
    npm run dev
) &
PIDS+=($!)
echo -e "${GREEN}   ✓ Frontend avviato (PID: $!)\n${NC}"

# Attendi un po'
sleep 2

# 3. Sensore
echo -e "${YELLOW}3️⃣  Avvio Sensore Simulator...${NC}"
(
    cd "$SENSOR_DIR"
    echo -e "\n${CYAN}🎯 SENSORE SIMULATOR - Motion Capture (30 Hz)${NC}"
    echo -e "${CYAN}$(printf '=%.0s' {1..50})${NC}"
    echo -e "${GREEN}Generando dati realistici 3D...\n${NC}"
    python main.py
) &
PIDS+=($!)
echo -e "${GREEN}   ✓ Sensore avviato (PID: $!)\n${NC}"

# Messaggio finale
echo -e "\n${CYAN}$(printf '=%.0s' {1..70})${NC}"
echo -e "${GREEN}✅ TUTTI I SERVIZI AVVIATI!${NC}"
echo -e "${CYAN}$(printf '=%.0s' {1..70})${NC}\n"

echo -e "${CYAN}📊 Status:${NC}"
echo -e "${GREEN}  ✓ Backend:  ws://localhost:8001-8003${NC}"
echo -e "${GREEN}  ✓ Frontend: http://localhost:5173${NC}"
echo -e "${GREEN}  ✓ Sensore:  Streaming...${NC}"

echo -e "\n${CYAN}🌐 Apri il browser: ${GREEN}http://localhost:5173${NC}"
echo -e "${YELLOW}💡 Per fermare tutto: Ctrl+C oppure kill ${PIDS[@]}\n${NC}"

# Wait per tutti i processi
wait

