#!/bin/bash
# SynthForge AI - Production Server Manager
# Usage: ./run.sh [start|stop|restart|status|build]

cd /home/z/my-project

PORT=3000
PID_FILE="/home/z/my-project/server.pid"
LOG_FILE="/home/z/my-project/server.log"

start() {
  if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
    echo "Server already running (PID: $(cat $PID_FILE))"
    return 0
  fi

  echo "Starting SynthForge AI on port $PORT..."
  
  # Build if needed
  if [ ! -d ".next" ]; then
    echo "No build found. Building..."
    NODE_OPTIONS='--max-old-space-size=8192' npx next build
  fi

  # Start server with process supervisor
  nohup node --max-old-space-size=4096 /home/z/my-project/node_modules/.bin/next start -p $PORT >> "$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  echo $SERVER_PID > "$PID_FILE"
  
  # Wait for server to start
  for i in $(seq 1 30); do
    if curl -s --max-time 2 "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1; then
      echo "Server started successfully (PID: $SERVER_PID)"
      return 0
    fi
    sleep 1
  done
  
  echo "Warning: Server may not have started properly"
  return 1
}

stop() {
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "Stopping server (PID: $PID)..."
      kill "$PID"
      rm -f "$PID_FILE"
      return 0
    fi
    rm -f "$PID_FILE"
  fi
  echo "Server not running"
}

status() {
  if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
    PID=$(cat "$PID_FILE")
    echo "Server running (PID: $PID)"
    HEALTH=$(curl -s --max-time 5 "http://127.0.0.1:$PORT/api/health" 2>/dev/null || echo "unreachable")
    echo "Health: $HEALTH"
    return 0
  fi
  echo "Server not running"
  return 1
}

build() {
  echo "Building SynthForge AI..."
  stop
  rm -rf .next
  NODE_OPTIONS='--max-old-space-size=8192' npx next build
  echo "Build complete!"
}

case "${1:-start}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; sleep 2; start ;;
  status)  status ;;
  build)   build ;;
  *)       echo "Usage: $0 [start|stop|restart|status|build]"; exit 1 ;;
esac
