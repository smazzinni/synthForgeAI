#!/bin/bash
cd /home/z/my-project

# Build if .next/standalone doesn't exist
if [ ! -d ".next/standalone" ]; then
  echo "Building production bundle..."
  NODE_OPTIONS='--max-old-space-size=8192' npx next build
fi

echo "Starting SynthForge AI production server..."
exec NODE_OPTIONS='--max-old-space-size=4096' npx next start -p 3000
