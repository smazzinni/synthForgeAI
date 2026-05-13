#!/bin/bash
# Supervisor for Next.js server
cd /home/z/my-project
export NODE_OPTIONS='--max-old-space-size=4096'

LOG=/home/z/my-project/server.log
ERR=/home/z/my-project/server-error.log

while true; do
  echo "[$(date)] Starting Next.js..." >> $LOG
  node node_modules/.bin/next start -p 3000 >> $LOG 2>> $ERR
  EXIT=$?
  echo "[$(date)] Server exited with code $EXIT, restarting in 3s..." >> $LOG
  sleep 3
done
