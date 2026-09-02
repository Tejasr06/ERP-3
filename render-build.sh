#!/usr/bin/env bash
# Render Build Script for EduConnect ERP (Node.js + Python Face Recognition)
set -o errexit

# Limit compiler parallelism to 1 core to prevent Render out-of-memory (>8GB) errors
export CMAKE_BUILD_PARALLEL_LEVEL=1
export MAKEFLAGS="-j1"

echo "========================================="
echo "📦 1/3 Installing Node.js dependencies..."
echo "========================================="
if [ -d "backend" ]; then
  cd backend
  npm install
  cd ..
else
  npm install
fi

echo "========================================="
echo "🐍 2/3 Installing Python & OpenCV (Headless)..."
echo "========================================="
# Upgrade pip and install build tools
python3 -m pip install --upgrade pip setuptools wheel cmake

# Try installing pre-built binary wheels first to avoid compiling dlib
python3 -m pip install --prefer-binary --no-cache-dir dlib-bin || true

# Explicitly install face-recognition-models directly from PyPI (with git fallback)
python3 -m pip install --prefer-binary --no-cache-dir face-recognition-models || python3 -m pip install --no-cache-dir git+https://github.com/ageitgey/face_recognition_models || true

# Install requirements with binary preference and no cache
if [ -f "requirements.txt" ]; then
  python3 -m pip install --prefer-binary --no-cache-dir -r requirements.txt
elif [ -f "backend/requirements.txt" ]; then
  python3 -m pip install --prefer-binary --no-cache-dir -r backend/requirements.txt
fi

echo "========================================="
echo "✅ 3/3 Testing Python OpenCV & Face Recognition..."
echo "========================================="
python3 -c "import cv2, numpy, face_recognition, face_recognition_models; print('🎉 Python Dependencies Verified OK: OpenCV', cv2.__version__)"

echo "========================================="
echo "🚀 Build completed successfully!"
echo "========================================="

