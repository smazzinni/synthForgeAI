#!/bin/bash
cd /home/z/my-project/synthforge
export NODE_OPTIONS='--max-old-space-size=4096'
pkill -f "next dev" 2>/dev/null
sleep 2
rm -rf .next
(nohup node node_modules/.bin/next dev -p 3000 --webpack </dev/null >> /home/z/my-project/synthforge/server.log 2>&1 &)
echo "Server started on port 3000 (webpack mode)"
sleep 5
echo "Checking..."
curl -s --max-time 15 -o /dev/null -w "Status: HTTP %{http_code}\n" http://localhost:3000/
