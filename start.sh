#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "==============================="
echo "  NewsFlash Development Setup"
echo "==============================="
echo ""

# 1. Check if Docker is running
echo "[1/4] Checking Docker..."
if ! docker info > /dev/null 2>&1; then
  echo "ERROR: Docker is not running. Please start Docker Desktop and try again."
  exit 1
fi
echo "  Docker is running."

# 2. Start RSSHub via docker-compose
echo ""
echo "[2/4] Starting RSSHub (docker-compose)..."
docker compose up -d 2>/dev/null || docker-compose up -d
echo "  RSSHub container started."

# 3. Wait for RSSHub to be healthy
echo ""
echo "[3/4] Waiting for RSSHub to be ready..."
MAX_WAIT=30
WAITED=0
until curl -sf http://localhost:1200 > /dev/null 2>&1; do
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "  WARNING: RSSHub did not respond after ${MAX_WAIT}s. Continuing anyway..."
    break
  fi
  sleep 2
  WAITED=$((WAITED + 2))
  echo "  Waiting... (${WAITED}s)"
done
if [ $WAITED -lt $MAX_WAIT ]; then
  echo "  RSSHub is up at http://localhost:1200"
fi

# 4. Install backend deps if needed and start dev server
echo ""
echo "[4/4] Starting backend..."
cd "$SCRIPT_DIR/backend"

if [ ! -d "node_modules" ]; then
  echo "  Installing dependencies (first run)..."
  npm install
fi

echo ""
echo "==============================="
echo "  NewsFlash is starting!"
echo "==============================="
echo ""
echo "  Backend API:   http://localhost:3000"
echo "  RSSHub:        http://localhost:1200"
echo "  Health check:  http://localhost:3000/api/health"
echo ""
echo "  To trigger the pipeline manually:"
echo "    curl -X POST http://localhost:3000/api/pipeline/run -H 'X-NewsFlash-Key: dev-key'"
echo ""
echo "  To seed test stories:"
echo "    npm run seed"
echo ""
echo "  Load the extension in Chrome:"
echo "    1. Go to chrome://extensions"
echo "    2. Enable Developer mode"
echo "    3. Click 'Load unpacked' and select the extension/ folder"
echo ""
echo "Starting backend dev server..."
echo ""

npm run dev
