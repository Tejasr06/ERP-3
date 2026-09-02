# Multi-runtime Dockerfile for Node.js + Python Face Recognition (OpenCV Headless)
FROM node:20-bookworm-slim

# Install system build tools and python3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    cmake \
    libopenblas-dev \
    liblapack-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY requirements.txt ./
RUN python3 -m pip install --no-cache-dir --upgrade pip setuptools wheel && \
    python3 -m pip install --no-cache-dir -r requirements.txt

# Install Node dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copy application files
COPY . .

# Test python face recognition imports
RUN python3 -c "import cv2, numpy, face_recognition, face_recognition_models; print('Docker Python Verified: OpenCV', cv2.__version__)"

EXPOSE 3000

WORKDIR /app/backend
CMD ["npm", "start"]
