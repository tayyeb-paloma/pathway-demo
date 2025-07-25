#!/bin/bash

echo "🛑 Stopping Autism Assessment Pathway Task Management System"

# Function to kill processes by port
kill_process_on_port() {
    local port=$1
    local service_name=$2
    
    PID=$(lsof -ti:$port)
    if [ ! -z "$PID" ]; then
        echo "🔴 Stopping $service_name (PID: $PID) on port $port"
        kill -TERM $PID 2>/dev/null
        sleep 2
        
        # Force kill if still running
        if kill -0 $PID 2>/dev/null; then
            echo "🔨 Force killing $service_name"
            kill -KILL $PID 2>/dev/null
        fi
        echo "✅ $service_name stopped"
    else
        echo "ℹ️  No $service_name process found on port $port"
    fi
}

# Kill FastAPI backend (port 8000)
kill_process_on_port 8000 "FastAPI backend"

# Kill Vite dev server (port 5173)
kill_process_on_port 5173 "Vite frontend"

# Kill any remaining Python processes that might be our backend
echo "🔍 Checking for any remaining backend processes..."
PYTHON_PIDS=$(ps aux | grep "[p]ython.*main.py" | awk '{print $2}')
if [ ! -z "$PYTHON_PIDS" ]; then
    echo "🔴 Found additional Python backend processes: $PYTHON_PIDS"
    echo $PYTHON_PIDS | xargs kill -TERM 2>/dev/null
    sleep 1
    echo $PYTHON_PIDS | xargs kill -KILL 2>/dev/null
    echo "✅ Additional Python processes stopped"
fi

# Kill any remaining npm/node processes for our frontend
echo "🔍 Checking for any remaining frontend processes..."
NODE_PIDS=$(ps aux | grep "[n]ode.*vite" | awk '{print $2}')
if [ ! -z "$NODE_PIDS" ]; then
    echo "🔴 Found additional Node frontend processes: $NODE_PIDS"
    echo $NODE_PIDS | xargs kill -TERM 2>/dev/null
    sleep 1
    echo $NODE_PIDS | xargs kill -KILL 2>/dev/null
    echo "✅ Additional Node processes stopped"
fi

echo ""
echo "✅ All services have been stopped!"
echo "📊 Backend (port 8000): stopped"
echo "🌐 Frontend (port 5173): stopped"