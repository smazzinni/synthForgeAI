#!/bin/bash
cd /home/z/my-project
export NODE_OPTIONS='--max-old-space-size=4096'
while true; do
  echo "[$(date)] Starting Next.js server..."
  node node_modules/.bin/next start -p 3000
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 3s..."
  sleep 3
done
