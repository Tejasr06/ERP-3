import base64
import json
import os
import sys
from pathlib import Path

try:
    import cv2
    import numpy as np
    import face_recognition
except Exception as exc:  # pragma: no cover
    print(json.dumps({"ok": False, "error": f"Missing Python dependency: {exc}"}))
    sys.exit(1)


def _image_from_file(path):
    image = cv2.imread(path)
    if image is None:
        raise ValueError(f"Unable to read image: {path}")
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    return rgb


def _load_known_students(data_dir):
    data_path = Path(data_dir)
    if not data_path.exists():
        return []

    students = []
    for student_dir in sorted(data_path.iterdir()):
        if not student_dir.is_dir():
            continue
        encodings = []
        for sample_file in sorted(student_dir.iterdir()):
            if not sample_file.is_file() or sample_file.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}:
                continue
            try:
                rgb = _image_from_file(str(sample_file))
                locations = face_recognition.face_locations(rgb, model='hog')
                if not locations:
                    continue
                enc = face_recognition.face_encodings(rgb, known_face_locations=locations)
                for item in enc:
                    encodings.append(item)
            except Exception:
                continue
        if encodings:
            students.append({"studentId": student_dir.name, "encodings": encodings})
    return students


def validate_samples(student_dir):
    student_path = Path(student_dir)
    if not student_path.exists():
        return {"ok": False, "valid": False, "message": "Student folder not found."}

    sample_files = [p for p in sorted(student_path.iterdir()) if p.is_file() and p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}]
    if len(sample_files) < 3:
        return {"ok": False, "valid": False, "message": "At least 3 face samples are required for registration."}

    valid = 0
    for sample_file in sample_files:
        try:
            rgb = _image_from_file(str(sample_file))
            locations = face_recognition.face_locations(rgb, model='hog')
            if not locations:
                continue
            enc = face_recognition.face_encodings(rgb, known_face_locations=locations)
            if enc:
                valid += 1
        except Exception:
            continue

    if valid < 3:
        return {"ok": False, "valid": False, "message": "At least 3 clear face samples with visible faces are required."}

    return {"ok": True, "valid": True, "sampleCount": valid, "message": "Face samples valid."}


def recognize_face(image_path, data_dir):
    if not os.path.exists(image_path):
        return {"ok": True, "recognized": False, "message": "Image not found."}

    rgb = _image_from_file(image_path)
    face_locations = face_recognition.face_locations(rgb, model='hog')
    if not face_locations:
        return {"ok": True, "recognized": False, "message": "No face detected."}

    face_encodings = face_recognition.face_encodings(rgb, known_face_locations=face_locations)
    if not face_encodings:
        return {"ok": True, "recognized": False, "message": "No face encoding available."}

    known_students = _load_known_students(data_dir)
    if not known_students:
        return {"ok": True, "recognized": False, "message": "No registered faces found."}

    best_match = {"studentId": None, "distance": 1.0, "confidence": 0}
    for candidate in known_students:
        for encoding in candidate['encodings']:
            distances = face_recognition.face_distance([encoding], face_encodings[0])
            if not distances.size:
                continue
            dist = float(distances[0])
            if dist < best_match['distance']:
                best_match = {"studentId": candidate['studentId'], "distance": dist, "confidence": round((1 - dist) * 100, 2)}

    if best_match['studentId'] and best_match['distance'] <= 0.45:
        return {"ok": True, "recognized": True, "studentId": best_match['studentId'], "confidence": best_match['confidence'], "distance": best_match['distance']}

    return {"ok": True, "recognized": False, "message": "Unknown face."}


def main():
    args = sys.argv[1:]
    if '--validate-samples' in args:
        student_dir_index = args.index('--student-dir') + 1 if '--student-dir' in args else -1
        if student_dir_index <= 0:
            print(json.dumps({"ok": False, "valid": False, "message": "Missing student directory."}))
            return
        print(json.dumps(validate_samples(args[student_dir_index])))
        return

    if '--recognize' in args:
        image_index = args.index('--image') + 1 if '--image' in args else -1
        data_dir_index = args.index('--data-dir') + 1 if '--data-dir' in args else -1
        if image_index <= 0 or data_dir_index <= 0:
            print(json.dumps({"ok": False, "recognized": False, "message": "Missing input image or data directory."}))
            return
        print(json.dumps(recognize_face(args[image_index], args[data_dir_index])))
        return

    print(json.dumps({"ok": False, "message": "No valid operation provided."}))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "message": str(exc)}))
        sys.exit(1)
