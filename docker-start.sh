#!/bin/bash
set -e

# Start nginx in background
nginx &

# Start FastAPI application
exec python main.py