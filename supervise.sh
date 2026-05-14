#!/bin/bash
# Supervisor script for SynthForge AI production server
# Automatically restarts the server if it crashes

cd /home/z/my-project

MAX_RETRIES=10
RETRY_COUNT=0
RETRY_DELAY=5

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  echo "[$(date)] Starting SynthForge AI server (attempt $((RETRY_COUNT+1))/$MAX_RETRIES)..."
  
  node --max-old-space-size=4096 /home/z/my-project/node_modules/.bin/next start -p 3000
  
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE"
  
  if [ $EXIT_CODE -eq 0 ]; then
    # Clean exit - don't restart
    echo "[$(date)] Clean exit, not restarting"
    break
  fi
  
  RETRY_COUNT=$((RETRY_COUNT+1))
  echo "[$(date)] Restarting in ${RETRY_DELAY}s..."
  sleep $RETRY_DELAY
done
