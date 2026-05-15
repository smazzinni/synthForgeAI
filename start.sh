#!/bin/bash
# SynthForge AI - Auto-restart server wrapper
# Uses the efficient Rust-based Next.js server with automatic restart on crash

PORT=${PORT:-3000}
MAX_RESTARTS=20
RESTART_DELAY=2
restart_count=0

echo "[start.sh] Starting SynthForge AI server on port $PORT"

while [ $restart_count -lt $MAX_RESTARTS ]; do
    echo "[start.sh] Attempt $((restart_count + 1))/$MAX_RESTARTS"
    
    NODE_OPTIONS="--max-old-space-size=4096" \
    npx next start -p $PORT
    
    EXIT_CODE=$?
    echo "[start.sh] Server exited with code $EXIT_CODE"
    
    # If server exited cleanly (code 0), don't restart
    if [ $EXIT_CODE -eq 0 ]; then
        echo "[start.sh] Clean exit, not restarting"
        break
    fi
    
    restart_count=$((restart_count + 1))
    
    # Wait before restarting
    echo "[start.sh] Restarting in ${RESTART_DELAY}s..."
    sleep $RESTART_DELAY
done

echo "[start.sh] Max restarts reached or clean exit. Done."
