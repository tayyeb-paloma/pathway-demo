# Multi-stage build for React frontend and FastAPI backend
FROM node:18-alpine AS frontend-build

# Build frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Production stage with Python
FROM python:3.11-slim AS production

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./

# Copy built frontend from the frontend-build stage
COPY --from=frontend-build /app/frontend/dist ./static

# Install and configure nginx to serve static files
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

# Create nginx configuration
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    \
    # Serve static files \
    location / { \
        root /app/static; \
        try_files $uri $uri/ /index.html; \
    } \
    \
    # Proxy API requests to FastAPI \
    location /api/ { \
        proxy_pass http://127.0.0.1:8000/; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
    } \
}' > /etc/nginx/sites-available/default

# Create startup script
RUN echo '#!/bin/bash \
set -e \
\
# Start nginx in background \
nginx & \
\
# Start FastAPI application \
exec python main.py' > /app/start.sh && chmod +x /app/start.sh

# Expose port
EXPOSE 80

# Start the application
CMD ["/app/start.sh"]