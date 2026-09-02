#!/usr/bin/env bash
# Render Build Script for EduConnect ERP (Node.js + Python Face Recognition)
set -o errexit

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
python3 -m pip install --upgrade pip setuptools wheel cmake || true

# Install requirements
if [ -f "requirements.txt" ]; then
  python3 -m pip install -r requirements.txt
elif [ -f "backend/requirements.txt" ]; then
  python3 -m pip install -r backend/requirements.txt
fi

echo "========================================="
echo "✅ 3/3 Testing Python OpenCV & Face Recognition..."
echo "========================================="
python3 -c "import cv2, numpy, face_recognition; print('🎉 Python Dependencies Verified OK: OpenCV', cv2.__version__)"

echo "========================================="
echo "🚀 Build completed successfully!"
echo "========================================="
