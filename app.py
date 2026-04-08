import cv2
import face_recognition
import pickle
import os
import sqlite3
import datetime
import threading
import time
import pandas as pd
import numpy as np
from contextlib import contextmanager
from flask import Flask, Response, request, jsonify
from flask_cors import CORS

# =============================================================================
# CONFIGURATION — tune these for your environment
# =============================================================================
DB_NAME = "attendance.db"
DATASET_DIR = "dataset"
CAMERA_INDEX = 0

# --- Accuracy knobs ---
RECOGNITION_TOLERANCE = 0.45       # Lower = stricter matching (default lib is 0.6)
PROCESS_SCALE = 0.35               # Scale factor for detection (smaller = faster)
NUM_JITTERS = 1                    # Jitters for LIVE detection (1 = fast, accurate enough)
REG_NUM_JITTERS = 10               # High jitters during registration for rich encodings
REG_SAMPLES_TARGET = 10            # How many face samples to capture during registration
REG_SAMPLES_MIN = 5                # Minimum required or registration fails
DETECTION_MODEL = "hog"            # "hog" (fast, CPU) or "cnn" (slow, GPU/accurate)
CAMERA_WIDTH = 640                 # 640x480 is fastest for streaming; AI still works well
CAMERA_HEIGHT = 480
STREAM_FPS = 24                    # Target FPS for the MJPEG stream
JPEG_QUALITY = 75                  # Lower = smaller frames = less lag over HTTP

# =============================================================================
# DATABASE MANAGER
# =============================================================================
class DatabaseManager:
    def __init__(self, db_path):
        self.db_path = db_path
        self._init_db()

    @contextmanager
    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        try:
            yield conn
        finally:
            conn.close()

    def _init_db(self):
        with self.get_connection() as conn:
            cur = conn.cursor()
            cur.execute("""CREATE TABLE IF NOT EXISTS students(
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                registered_date TEXT DEFAULT CURRENT_TIMESTAMP)""")
            cur.execute("""CREATE TABLE IF NOT EXISTS attendance(
                id TEXT NOT NULL,
                name TEXT NOT NULL,
                date TEXT NOT NULL,
                period TEXT NOT NULL,
                status TEXT DEFAULT 'Present',
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                method TEXT DEFAULT 'Auto',
                PRIMARY KEY (id, date, period))""")
            cur.execute("""CREATE TABLE IF NOT EXISTS timetable(
                period TEXT PRIMARY KEY,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL)""")
            conn.commit()
            print("📅 Database initialized")


# =============================================================================
# CAMERA MANAGER — higher resolution for better face detail
# =============================================================================
class CameraManager:
    def __init__(self, index=0):
        self.index = index
        self.cam = None
        self.lock = threading.Lock()

    def start(self):
        with self.lock:
            if self.cam is None or not self.cam.isOpened():
                self.cam = cv2.VideoCapture(self.index, cv2.CAP_DSHOW)
                if not self.cam.isOpened():
                    self.cam = cv2.VideoCapture(self.index)

                if self.cam.isOpened():
                    self.cam.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
                    self.cam.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
                    self.cam.set(cv2.CAP_PROP_FPS, 30)
                    actual_w = int(self.cam.get(cv2.CAP_PROP_FRAME_WIDTH))
                    actual_h = int(self.cam.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    print(f"📷 Camera {self.index} started at {actual_w}x{actual_h}")
                else:
                    print(f"❌ Failed to open camera {self.index}")
        return self.cam.isOpened() if self.cam else False

    def get_frame(self):
        with self.lock:
            if self.cam and self.cam.isOpened():
                success, frame = self.cam.read()
                return success, frame
        return False, None

    def stop(self):
        with self.lock:
            if self.cam:
                self.cam.release()
                self.cam = None
                print("📷 Camera stopped")


# =============================================================================
# ATTENDANCE SERVICE — high-accuracy multi-face engine
# =============================================================================
class AttendanceService:
    def __init__(self, db_manager, camera_manager):
        self.db = db_manager
        self.camera = camera_manager
        self.known_encodings = []
        self.known_ids = []
        self.known_names = []
        self._lock = threading.Lock()
        # Cached results for the video overlay (avoid re-computing every frame)
        self._cached_locations = []
        self._cached_names = []
        self._cached_ids = []
        self._frame_count = 0
        self.load_known_faces()

    def load_known_faces(self):
        """Load all registered face encodings from disk."""
        with self._lock:
            self.known_encodings, self.known_ids, self.known_names = [], [], []
            if not os.path.exists(DATASET_DIR):
                os.makedirs(DATASET_DIR)

            count = 0
            for file in os.listdir(DATASET_DIR):
                if file.endswith('.pkl'):
                    try:
                        with open(os.path.join(DATASET_DIR, file), 'rb') as f:
                            data = pickle.load(f)
                            for enc in data["encoding"]:
                                self.known_encodings.append(enc)
                                self.known_ids.append(data["id"])
                                self.known_names.append(data["name"])
                            count += 1
                    except Exception as e:
                        print(f"⚠️ Error loading {file}: {e}")
            print(f"👤 Loaded {count} registered students ({len(self.known_encodings)} total encodings)")

    def _preprocess_frame(self, frame):
        """Resize and convert a BGR frame to an RGB numpy array suitable for dlib."""
        small = cv2.resize(frame, (0, 0), fx=PROCESS_SCALE, fy=PROCESS_SCALE)
        rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
        # Ensure contiguous uint8 array (dlib requirement)
        return np.ascontiguousarray(rgb, dtype=np.uint8)

    def identify_faces(self, frame):
        """
        Detect ALL faces in the frame and return their locations + names.
        Uses a voting/distance strategy for better accuracy with multiple encodings.
        """
        if frame is None or frame.size == 0:
            return [], [], []

        try:
            rgb_small = self._preprocess_frame(frame)

            # Detect every face in the frame
            face_locations = face_recognition.face_locations(
                rgb_small,
                model=DETECTION_MODEL,
                number_of_times_to_upsample=1  # 1 is default; increase to find smaller faces
            )

            if not face_locations:
                return [], [], []

            # Generate 128-d encodings with extra jitters for accuracy
            face_encodings = face_recognition.face_encodings(
                rgb_small,
                face_locations,
                num_jitters=NUM_JITTERS
            )

            face_names = []
            face_ids = []

            with self._lock:
                for face_encoding in face_encodings:
                    name = "Unknown"
                    sid = None

                    if len(self.known_encodings) > 0:
                        # Compute distances to every known encoding
                        distances = face_recognition.face_distance(self.known_encodings, face_encoding)

                        # --- Voting strategy for multi-sample accuracy ---
                        # Group distances by student ID to find the best overall match
                        id_scores = {}  # id -> list of distances that are under tolerance
                        for idx, dist in enumerate(distances):
                            if dist <= RECOGNITION_TOLERANCE:
                                kid = self.known_ids[idx]
                                if kid not in id_scores:
                                    id_scores[kid] = []
                                id_scores[kid].append(dist)

                        if id_scores:
                            # Pick the student with the most under-tolerance matches,
                            # breaking ties by lowest average distance
                            best_id = max(
                                id_scores.keys(),
                                key=lambda k: (len(id_scores[k]), -np.mean(id_scores[k]))
                            )
                            sid = best_id
                            # Find the name from known lists
                            name_idx = self.known_ids.index(best_id)
                            name = self.known_names[name_idx]
                            avg_dist = np.mean(id_scores[best_id])
                            confidence = round((1 - avg_dist) * 100)
                            name = f"{name} ({confidence}%)"

                    face_names.append(name)
                    face_ids.append(sid)

            return face_locations, face_names, face_ids

        except Exception as e:
            print(f"⚠️ identify_faces error: {e}")
            import traceback; traceback.print_exc()
            return [], [], []

    def get_current_period(self):
        now = datetime.datetime.now().strftime("%H:%M")
        with self.db.get_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT period, start_time, end_time FROM timetable ORDER BY start_time")
            for p, s, e in cur.fetchall():
                if s <= now <= e:
                    return p
        return None

    def record_attendance(self, period, method="Auto"):
        """Capture one frame, detect all faces, mark them present."""
        ret, frame = self.camera.get_frame()
        if not ret or frame is None:
            return "Camera Error"

        locations, names, ids = self.identify_faces(frame)
        recognized_pairs = []
        for name, sid in zip(names, ids):
            if sid is not None and "Unknown" not in name:
                # Strip confidence suffix for DB storage
                clean_name = name.split(" (")[0]
                recognized_pairs.append((sid, clean_name))

        if not recognized_pairs:
            return "No recognized faces"

        date = str(datetime.date.today())
        count = 0
        with self.db.get_connection() as conn:
            cur = conn.cursor()
            for sid, clean_name in set(recognized_pairs):
                try:
                    cur.execute(
                        "INSERT OR IGNORE INTO attendance (id, name, date, period, method) VALUES (?, ?, ?, ?, ?)",
                        (sid, clean_name, date, period, method)
                    )
                    if cur.rowcount > 0:
                        count += 1
                except:
                    continue
            conn.commit()
        return f"Marked {count} students present"


# =============================================================================
# INITIALIZE
# =============================================================================
db_mgr = DatabaseManager(DB_NAME)
cam_mgr = CameraManager(CAMERA_INDEX)
attendance_svc = AttendanceService(db_mgr, cam_mgr)


# =============================================================================
# BACKGROUND DETECTION THREAD — keeps video smooth
# =============================================================================
class DetectionThread:
    """
    Runs face detection in a separate thread so the video stream
    is never blocked by slow AI processing. The stream just reads
    the latest cached results.
    """
    def __init__(self, service, camera):
        self.service = service
        self.camera = camera
        self.lock = threading.Lock()
        self._locations = []
        self._names = []
        self._ids = []
        self._running = False
        self._thread = None

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print("🧠 Detection thread started")

    def stop(self):
        self._running = False

    def get_results(self):
        """Thread-safe read of the latest detection results."""
        with self.lock:
            return list(self._locations), list(self._names), list(self._ids)

    def _loop(self):
        while self._running:
            success, frame = self.camera.get_frame()
            if not success or frame is None:
                time.sleep(0.03)
                continue

            # Run the AI (this is the slow part — runs in THIS thread, not the stream thread)
            locations, names, ids = self.service.identify_faces(frame)

            # Cache results thread-safely
            with self.lock:
                self._locations = locations
                self._names = names
                self._ids = ids

            # Small sleep to avoid pegging 100% CPU
            time.sleep(0.02)


detection_thread = DetectionThread(attendance_svc, cam_mgr)


# =============================================================================
# FLASK APP
# =============================================================================
app = Flask(__name__)
CORS(app)


def gen_frames():
    """
    Generator that yields MJPEG frames at ~STREAM_FPS.
    Face detection runs in a separate thread; this just draws the
    latest cached results on each frame — zero lag.
    """
    cam_mgr.start()
    detection_thread.start()

    scale_inv = 1.0 / PROCESS_SCALE  # e.g. ~2.86 when PROCESS_SCALE=0.35
    frame_interval = 1.0 / STREAM_FPS

    while True:
        t_start = time.time()

        success, frame = cam_mgr.get_frame()
        if not success:
            time.sleep(0.02)
            continue

        # Read latest detection results (non-blocking)
        locations, names, _ = detection_thread.get_results()

        # Draw overlays
        for (top, right, bottom, left), name in zip(locations, names):
            # Scale back to original camera resolution
            t = int(top * scale_inv)
            r = int(right * scale_inv)
            b = int(bottom * scale_inv)
            l = int(left * scale_inv)

            is_known = "Unknown" not in name
            color = (0, 200, 0) if is_known else (0, 0, 220)

            # Face rectangle
            cv2.rectangle(frame, (l, t), (r, b), color, 2)

            # Label
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.55
            text_size = cv2.getTextSize(name, font, font_scale, 1)[0]
            lw = text_size[0] + 12
            lh = text_size[1] + 12
            ly = t - lh if t - lh > 0 else b

            cv2.rectangle(frame, (l, ly), (l + lw, ly + lh), color, cv2.FILLED)
            cv2.putText(frame, name, (l + 6, ly + lh - 6), font, font_scale, (255, 255, 255), 1, cv2.LINE_AA)

        # Encode and yield
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        if ret:
            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

        # Frame rate limiter
        elapsed = time.time() - t_start
        wait = frame_interval - elapsed
        if wait > 0:
            time.sleep(wait)


# =============================================================================
# API ENDPOINTS
# =============================================================================

@app.route('/api/video')
def video_stream():
    return Response(gen_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/api/stats')
def get_stats():
    with db_mgr.get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(DISTINCT id) FROM students")
        total_st = cur.fetchone()[0]
        cur.execute("SELECT COUNT(DISTINCT id) FROM attendance WHERE date=?", (str(datetime.date.today()),))
        present_today = cur.fetchone()[0]
    return jsonify({
        "total_students": total_st,
        "present_today": present_today,
        "current_period": attendance_svc.get_current_period() or "No Period",
    })


@app.route('/api/students', methods=['GET'])
def list_students():
    with db_mgr.get_connection() as conn:
        df = pd.read_sql_query("SELECT id, name, registered_date FROM students", conn)
    return jsonify(df.to_dict('records'))


@app.route('/api/students/<student_id>', methods=['DELETE'])
def delete_student(student_id):
    with db_mgr.get_connection() as conn:
        conn.execute("DELETE FROM students WHERE id=?", (student_id,))
        conn.execute("DELETE FROM attendance WHERE id=?", (student_id,))
        conn.commit()
    fpath = os.path.join(DATASET_DIR, f"{student_id}.pkl")
    if os.path.exists(fpath):
        os.remove(fpath)
    attendance_svc.load_known_faces()
    return jsonify({"status": "success"}), 204


@app.route('/api/timetable', methods=['GET', 'POST'])
def timetable():
    if request.method == 'POST':
        data = request.json
        with db_mgr.get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO timetable (period, start_time, end_time) VALUES (?, ?, ?)",
                (data['period'], data['start_time'], data['end_time'])
            )
            conn.commit()
        return jsonify({"status": "success"}), 201
    with db_mgr.get_connection() as conn:
        df = pd.read_sql_query("SELECT * FROM timetable", conn)
    return jsonify(df.to_dict('records'))


@app.route('/api/timetable/<period>', methods=['DELETE'])
def delete_period(period):
    with db_mgr.get_connection() as conn:
        conn.execute("DELETE FROM timetable WHERE period=?", (period,))
        conn.commit()
    return jsonify({"status": "success"}), 204


@app.route('/api/trigger', methods=['POST'])
def trigger():
    period = attendance_svc.get_current_period()
    if not period:
        return jsonify({"status": "error", "message": "No active period"}), 400
    msg = attendance_svc.record_attendance(period, method="Manual")
    return jsonify({"status": "success", "message": msg})


@app.route('/api/attendance', methods=['GET'])
def get_attendance():
    with db_mgr.get_connection() as conn:
        df = pd.read_sql_query("SELECT * FROM attendance ORDER BY timestamp DESC LIMIT 100", conn)
    return jsonify(df.to_dict('records'))


@app.route('/api/register', methods=['POST'])
def register_student():
    """
    High-accuracy registration:
    - Captures multiple face samples from the camera
    - Uses high num_jitters for rich 128-d encodings
    - Stores all samples in a .pkl file for voting-based matching
    """
    data = request.json
    sid, name = data.get('id'), data.get('name')
    if not sid or not name:
        return jsonify({"success": False, "message": "Missing ID/Name"}), 400

    encodings = []
    print(f"📸 Starting high-accuracy capture for {name} (ID: {sid})")

    # Flush stale buffered frames
    for _ in range(8):
        cam_mgr.get_frame()

    for i in range(25):  # More attempts to ensure enough samples
        time.sleep(0.15)
        success, frame = cam_mgr.get_frame()
        if not success or frame is None:
            continue

        rgb = self_preprocess(frame)
        try:
            locs = face_recognition.face_locations(rgb, model=DETECTION_MODEL)
            if locs:
                # Use only the largest face (closest to camera) for registration
                if len(locs) > 1:
                    areas = [(b - t) * (r - l) for (t, r, b, l) in locs]
                    largest_idx = np.argmax(areas)
                    locs = [locs[largest_idx]]

                encs = face_recognition.face_encodings(rgb, locs, num_jitters=REG_NUM_JITTERS)
                if encs:
                    encodings.append(encs[0])
                    print(f"  ✅ Sample {len(encodings)}/{REG_SAMPLES_TARGET} captured")
            else:
                print(f"  ◽ Attempt {i+1}: No face visible")
        except Exception as e:
            print(f"  ⚠️ Capture error at attempt {i+1}: {e}")

        if len(encodings) >= REG_SAMPLES_TARGET:
            break

    print(f"📊 Capture finished. Total samples: {len(encodings)}")

    if len(encodings) < REG_SAMPLES_MIN:
        return jsonify({
            "success": False,
            "message": f"Only captured {len(encodings)}/{REG_SAMPLES_MIN} face samples. "
                       f"Please look directly at the camera and ensure good lighting."
        }), 400

    # Save dataset
    dataset_file = os.path.join(DATASET_DIR, f"{sid}.pkl")
    try:
        with open(dataset_file, 'wb') as f:
            pickle.dump({"id": sid, "name": name, "encoding": encodings}, f)
        print(f"💾 Saved {len(encodings)} face encodings to {dataset_file}")
    except Exception as e:
        print(f"❌ Failed to save pkl: {e}")
        return jsonify({"success": False, "message": "Failed to save registration file"}), 500

    with db_mgr.get_connection() as conn:
        conn.execute("INSERT OR REPLACE INTO students (id, name) VALUES (?, ?)", (sid, name))
        conn.commit()
        print(f"🗄️ Database entry created for {name}")

    attendance_svc.load_known_faces()
    return jsonify({"success": True, "message": f"Successfully registered {name} with {len(encodings)} face samples"}), 201


def self_preprocess(frame):
    """Preprocess a frame for face_recognition (used during registration)."""
    small = cv2.resize(frame, (0, 0), fx=PROCESS_SCALE, fy=PROCESS_SCALE)
    rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
    return np.ascontiguousarray(rgb, dtype=np.uint8)


# =============================================================================
# MAIN
# =============================================================================
if __name__ == "__main__":
    if cam_mgr.start():
        print("=" * 60)
        print("🚀 ClassLens AI Backend — Threaded Detection")
        print(f"   Camera:      {CAMERA_WIDTH}x{CAMERA_HEIGHT}")
        print(f"   Model:       {DETECTION_MODEL}")
        print(f"   Tolerance:   {RECOGNITION_TOLERANCE}")
        print(f"   Scale:       {PROCESS_SCALE} ({int(CAMERA_WIDTH*PROCESS_SCALE)}x{int(CAMERA_HEIGHT*PROCESS_SCALE)} detection)")
        print(f"   Stream FPS:  {STREAM_FPS}")
        print(f"   Architecture: Background thread (zero-lag overlay)")
        print(f"   Server:      http://localhost:5000")
        print("=" * 60)
        app.run(host="0.0.0.0", port=5000, threaded=True, debug=False)
    else:
        print("❌ Startup failed: Camera could not be initialized")

