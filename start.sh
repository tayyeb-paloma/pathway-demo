#!/bin/bash

echo "🚀 Starting Autism Assessment Pathway Task Management System"

# Check if python3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 is required but not installed. Please install Python3 first."
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm is required but not installed. Please install Node.js and npm first."
    exit 1
fi

echo "📦 Setting up backend virtual environment..."

# Create virtual environment if it doesn't exist
if [ ! -d "backend/venv" ]; then
    echo "Creating virtual environment..."
    cd backend
    python3 -m venv venv
    cd ..
else
    echo "Virtual environment already exists."
fi

# Activate virtual environment and install dependencies
echo "Installing backend dependencies..."
cd backend
source venv/bin/activate
pip install -r requirements.txt
cd ..

echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo "🔧 Starting services..."

# Function to handle cleanup on script exit
cleanup() {
    echo "🛑 Shutting down services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Start backend in background
echo "🐍 Starting FastAPI backend on http://localhost:8000"
cd backend
source venv/bin/activate
python main.py &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

# Start frontend in background
echo "⚛️  Starting React frontend on http://localhost:5173"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Both services are starting up!"
echo "📊 Backend API: http://localhost:8000"
echo "🌐 Frontend App: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both services"

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID