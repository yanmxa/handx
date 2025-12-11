#!/bin/bash

# HandX - Start both backend and frontend services

cd "$(dirname "$0")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting HandX services...${NC}"

# Kill any existing HandX processes
echo -e "${YELLOW}Cleaning up existing processes...${NC}"
pkill -f "handx.*server" 2>/dev/null
pkill -f "bin/server" 2>/dev/null
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti:8080 2>/dev/null | xargs kill -9 2>/dev/null
sleep 1

# Build and start backend
echo -e "${YELLOW}Building backend...${NC}"
cd server
go build -o bin/server ./cmd/server
if [ $? -ne 0 ]; then
    echo -e "${RED}Backend build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Starting backend on :8080...${NC}"
./bin/server &
BACKEND_PID=$!

# Start frontend
cd ../web
echo -e "${GREEN}Starting frontend on :3000...${NC}"
npm run dev &
FRONTEND_PID=$!

cd ..

# Handle shutdown
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${GREEN}HandX is running!${NC}"
echo -e "  Backend:  http://localhost:8080"
echo -e "  Frontend: http://localhost:3000"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"

# Wait for both processes
wait
