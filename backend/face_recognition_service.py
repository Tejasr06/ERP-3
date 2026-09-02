import base64
import json
import os
import sys
import warnings
from pathlib import Path

warnings.filterwarnings('ignore')

try:
    import cv2
    import numpy as np
    import face_recognition
except Exception as exc:  # pragma: no cover
    print(json.dumps({"ok": False, "error": f"Missing Python dependency: {exc}"}))
    sys.exit(1)


def _load_image(path):
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
                rgb = _load_image(str(sample_file))
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
            rgb = _load_image(str(sample_file))
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


def encode_samples(dir_path):
    student_path = Path(dir_path)
    if not student_path.exists():
        return {"ok": False, "message": "Student image folder not found."}

    encodings = []
    for sample_file in sorted(student_path.iterdir()):
        if not sample_file.is_file() or sample_file.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}:
            continue
        try:
            rgb = _load_image(str(sample_file))
            locations = face_recognition.face_locations(rgb, model='hog')
            if not locations:
                continue
            items = face_recognition.face_encodings(rgb, known_face_locations=locations)
            for item in items:
                encodings.append(item.tolist())
        except Exception:
            continue

    if not encodings:
        return {"ok": False, "message": "No valid face encodings generated from provided samples."}

    return {"ok": True, "sampleCount": len(encodings), "encodings": encodings}


def recognize_face(image_path, known_students_source):
    if not os.path.exists(image_path):
        return {"ok": True, "recognized": False, "faces": [], "faceCount": 0, "message": "Image not found."}

    rgb = _load_image(image_path)
    img_height, img_width = int(rgb.shape[0]), int(rgb.shape[1])
    face_locations = face_recognition.face_locations(rgb, model='hog')
    if not face_locations:
        return {
            "ok": True,
            "imageWidth": img_width,
            "imageHeight": img_height,
            "faceCount": 0,
            "faces": [],
            "recognized": False,
            "studentId": None,
            "confidence": 0,
            "distance": 1.0,
            "message": "No face detected."
        }

    face_encodings = face_recognition.face_encodings(rgb, known_face_locations=face_locations)
    if not face_encodings:
        return {
            "ok": True,
            "imageWidth": img_width,
            "imageHeight": img_height,
            "faceCount": len(face_locations),
            "faces": [],
            "recognized": False,
            "studentId": None,
            "confidence": 0,
            "distance": 1.0,
            "message": "No face encoding available."
        }

    candidates = []
    try:
        if isinstance(known_students_source, str) and os.path.isfile(known_students_source):
            with open(known_students_source, 'r', encoding='utf-8') as f:
                candidates = json.load(f)
        elif isinstance(known_students_source, str):
            candidates = json.loads(known_students_source)
        elif isinstance(known_students_source, list):
            candidates = known_students_source
    except Exception:
        candidates = []

    parsed_candidates = []
    for candidate in candidates:
        student_id = candidate.get('studentId')
        enc_list = candidate.get('encodings', [])
        if not student_id or not enc_list:
            continue
        np_encs = [np.array(e, dtype=np.float64) for e in enc_list if len(e) == 128]
        if np_encs:
            parsed_candidates.append({"studentId": student_id, "encodings": np_encs})

    detected_faces = []
    for loc, face_enc in zip(face_locations, face_encodings):
        best_match = {"studentId": None, "distance": 1.0, "confidence": 0.0}
        for candidate in parsed_candidates:
            student_id = candidate["studentId"]
            for encoding in candidate["encodings"]:
                try:
                    dist_arr = face_recognition.face_distance([encoding], face_enc)
                except Exception:
                    continue
                if not dist_arr.size:
                    continue
                dist = float(dist_arr[0])
                if dist < best_match["distance"]:
                    best_match = {
                        "studentId": student_id,
                        "distance": round(dist, 4),
                        "confidence": round(max(0.0, (1.0 - dist) * 100), 1)
                    }

        is_recognized = bool(best_match["studentId"] and best_match["distance"] <= 0.48)
        detected_faces.append({
            "box": {
                "top": int(loc[0]),
                "right": int(loc[1]),
                "bottom": int(loc[2]),
                "left": int(loc[3])
            },
            "recognized": is_recognized,
            "studentId": best_match["studentId"] if is_recognized else None,
            "confidence": best_match["confidence"] if is_recognized else 0.0,
            "distance": best_match["distance"]
        })

    first_rec = next((f for f in detected_faces if f["recognized"]), None)
    return {
        "ok": True,
        "imageWidth": img_width,
        "imageHeight": img_height,
        "faceCount": len(detected_faces),
        "faces": detected_faces,
        "recognized": bool(first_rec),
        "studentId": first_rec["studentId"] if first_rec else None,
        "confidence": first_rec["confidence"] if first_rec else 0.0,
        "distance": first_rec["distance"] if first_rec else 1.0,
        "message": (
            f"{len([f for f in detected_faces if f['recognized']])} face(s) recognized."
            if first_rec
            else ("Unknown face(s) detected." if detected_faces else "No face detected.")
        )
    }


def main():
    args = sys.argv[1:]
    if '--validate-samples' in args:
        student_dir_index = args.index('--student-dir') + 1 if '--student-dir' in args else -1
        if student_dir_index <= 0 or student_dir_index >= len(args):
            print(json.dumps({"ok": False, "valid": False, "message": "Missing student directory."}))
            return
        print(json.dumps(validate_samples(args[student_dir_index])))
        return

    if '--encode-samples' in args:
        student_dir_index = args.index('--student-dir') + 1 if '--student-dir' in args else -1
        if student_dir_index <= 0 or student_dir_index >= len(args):
            print(json.dumps({"ok": False, "message": "Missing student directory."}))
            return
        print(json.dumps(encode_samples(args[student_dir_index])))
        return

    if '--recognize' in args:
        image_index = args.index('--image') + 1 if '--image' in args else -1
        known_file_index = args.index('--known-encodings-file') + 1 if '--known-encodings-file' in args else -1
        known_index = args.index('--known-encodings') + 1 if '--known-encodings' in args else -1

        known_source = None
        if known_file_index > 0 and known_file_index < len(args):
            known_source = args[known_file_index]
        elif known_index > 0 and known_index < len(args):
            known_source = args[known_index]

        if image_index <= 0 or image_index >= len(args) or not known_source:
            print(json.dumps({"ok": False, "recognized": False, "message": "Missing input image or known encodings."}))
            return
        print(json.dumps(recognize_face(args[image_index], known_source)))
        return

    print(json.dumps({"ok": False, "message": "No valid operation provided."}))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "message": str(exc)}))
        sys.exit(1)
