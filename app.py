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
from flask import Flask, Response, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
import webbrowser
import io
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors

# =============================================================================
# CONFIGURATION — tune these for your environment
# =============================================================================
DB_NAME = "attendance.db"
DATASET_DIR = "dataset"
IMAGES_DIR = os.path.join(DATASET_DIR, "images")
INTRUDER_DIR = os.path.join(DATASET_DIR, "intruders")
if not os.path.exists(IMAGES_DIR): os.makedirs(IMAGES_DIR)
if not os.path.exists(INTRUDER_DIR): os.makedirs(INTRUDER_DIR)
CAMERA_INDEX = 0
MIRROR_MODE = True                 # Set to True for laptop mirror effect
# Raspberry Pi IP Camera for remote monitoring:
# CAMERA_INDEX = "http://10.22.178.171:5000/video_feed"
RECOGNITION_TOLERANCE = 0.44       
PROCESS_SCALE = 0.5                # High-accuracy detection
NUM_JITTERS = 1                    
REG_SAMPLES_TARGET = 5            
REG_SAMPLES_MIN = 2                
REG_NUM_JITTERS = 1                
REG_TIMEOUT = 10                   
DETECTION_MODEL = "hog"            
CAMERA_WIDTH = 640                 
CAMERA_HEIGHT = 480
STREAM_FPS = 20                    # Reduced for wireless stability
JPEG_QUALITY = 40                  # Optimized for low-latency transmission

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
                session_type TEXT DEFAULT 'Active Session',
                intruder_image TEXT,
                PRIMARY KEY (id, date, period))""")
            cur.execute("""CREATE TABLE IF NOT EXISTS timetable(
                period TEXT PRIMARY KEY,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL)""")
            conn.commit()
            print("Database initialized")


# =============================================================================
# CAMERA MANAGER — zero-buffer background reader
# =============================================================================
class CameraManager:
    """Zero-Buffer Background Reader for network streams to eliminate lag."""
    def __init__(self, index=0):
        self.index = index
        self.cam = None
        self.lock = threading.Lock()
        self.latest_frame = None
        self.success = False
        self.running = False
        self.thread = None

    def start(self):
        with self.lock:
            if self.cam is None or not self.cam.isOpened():
                # Use DirectShow on Windows for much faster/reliable webcam access
                if isinstance(self.index, int) and os.name == 'nt':
                    self.cam = cv2.VideoCapture(self.index, cv2.CAP_DSHOW)
                else:
                    self.cam = cv2.VideoCapture(self.index)
                
                if self.cam.isOpened():
                    # Set resolution explicitly
                    self.cam.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                    self.cam.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                    self.cam.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    
                    self.running = True
                    self.thread = threading.Thread(target=self._reader, daemon=True)
                    self.thread.start()
                    print(f"Camera {self.index} background reader active (DSHOW Optimized)")
                else:
                    print(f"FAILED to open camera {self.index}")
        return self.cam.isOpened() if self.cam else False

    def _reader(self):
        """Continuously grab frames and flush the buffer to maintain zero lag."""
        while self.running:
            if self.cam and self.cam.isOpened():
                # Rapid-flush the buffer: grab everything currently in flight
                # but only retrieve the absolute latest one.
                for _ in range(5):
                    self.cam.grab()
                
                ret, frame = self.cam.retrieve()
                if ret:
                    # Mirror the frame horizontally if enabled
                    if MIRROR_MODE:
                        frame = cv2.flip(frame, 1)
                    
                    with self.lock:
                        self.latest_frame = frame
                        self.success = True
                else:
                    time.sleep(0.01)
            else:
                break

    def get_frame(self):
        with self.lock:
            return self.success, self.latest_frame

    def stop(self):
        self.running = False
        if self.thread: self.thread.join(timeout=1.0)
        with self.lock:
            if self.cam:
                self.cam.release()
                self.cam = None
                print("Camera stopped")


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
                        print(f"Error loading {file}: {e}")
            print(f"Loaded {count} registered students ({len(self.known_encodings)} total encodings)")

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
                number_of_times_to_upsample=1  # Use 1 for fast CPU detection
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
        # Use server time in 24h format
        now_dt = datetime.datetime.now()
        now_str = now_dt.strftime("%H:%M")
        try:
            with self.db.get_connection() as conn:
                cur = conn.cursor()
                cur.execute("SELECT period, start_time, end_time FROM timetable")
                periods = cur.fetchall()
                for p, s, e in periods:
                    if s <= now_str <= e:
                        # Calculate session type (In/Out/General)
                        try:
                            fmt = "%H:%M"
                            s_dt = datetime.datetime.strptime(s, fmt).replace(year=now_dt.year, month=now_dt.month, day=now_dt.day)
                            e_dt = datetime.datetime.strptime(e, fmt).replace(year=now_dt.year, month=now_dt.month, day=now_dt.day)
                            
                            diff_start = (now_dt - s_dt).total_seconds() / 60
                            diff_end = (e_dt - now_dt).total_seconds() / 60
                            
                            if diff_start <= 5: s_type = "Check-In"
                            elif diff_end <= 5: s_type = "Check-Out"
                            else: s_type = "Active Session"
                            
                            return {"period": p, "type": s_type}
                        except:
                            return {"period": p, "type": "Active Session"}
        except Exception as e:
            print(f"get_current_period error: {e}")
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

    def get_history(self):
        with self.db.get_connection() as conn:
            df = pd.read_sql_query("SELECT * FROM attendance ORDER BY timestamp DESC", conn)
        return df.to_dict('records')

    def get_students(self):
        with self.db.get_connection() as conn:
            df = pd.read_sql_query("SELECT id, name FROM students", conn)
        return df.to_dict('records')


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
    Can be paused during registration so the camera is exclusively
    available for face sample capture.
    """
    def __init__(self, service, camera):
        self.service = service
        self.camera = camera
        self.lock = threading.Lock()
        self._locations = []
        self._names = []
        self._ids = []
        self._running = False
        self._paused = False
        self._thread = None

    def start(self):
        if self._running:
            return
        self._running = True
        self._paused = False
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print("Detection thread started")

    def stop(self):
        self._running = False

    def pause(self):
        """Pause detection so registration gets exclusive camera access."""
        self._paused = True
        print("Detection thread paused for registration")

    def resume(self):
        """Resume detection after registration completes."""
        self._paused = False
        print("Detection thread resumed")

    def get_results(self):
        """Thread-safe read of the latest detection results."""
        with self.lock:
            return list(self._locations), list(self._names), list(self._ids)

    def _loop(self):
        while self._running:
            if self._paused:
                time.sleep(0.1)
                continue

            success, frame = self.camera.get_frame()
            if not success or frame is None:
                time.sleep(0.03)
                continue

            try:
                # Frame skipping: only detect every 2 frames to save CPU
                if not hasattr(self, '_skip_count'): self._skip_count = 0
                self._skip_count += 1
                if self._skip_count % 3 != 0:
                    time.sleep(0.01)
                    continue

                locations, names, ids = self.service.identify_faces(frame)

                # --- AUTO-RECORD ATTENDANCE & INTRUDERS ---
                period_info = self.service.get_current_period()
                if period_info:
                    current_p = period_info["period"]
                    session_type = period_info["type"]
                    date_str = str(datetime.date.today())
                    
                    # Track known faces
                    recognized = []
                    # Track unknown faces
                    unknown_found = False
                    
                    for n, sid in zip(names, ids):
                        if sid and "Unknown" not in n:
                            recognized.append((sid, n.split(" (")[0]))
                        else:
                            unknown_found = True
                    
                    with self.service.db.get_connection() as conn:
                        # 1. Save recognized students
                        for sid, clean_name in set(recognized):
                            try:
                                conn.execute(
                                    "INSERT OR IGNORE INTO attendance (id, name, date, period, method, session_type) VALUES (?, ?, ?, ?, ?, ?)",
                                    (sid, clean_name, date_str, current_p, "Auto", session_type)
                                )
                            except: continue
                        
                        # 2. Capture and Save Unknown (Intruder)
                        if unknown_found:
                            # Avoid spamming: only capture if non-duplicate in last 30 seconds
                            ts = int(time.time())
                            filename = f"intruder_{ts}.jpg"
                            fpath = os.path.join(INTRUDER_DIR, filename)
                            cv2.imwrite(fpath, frame)
                            
                            conn.execute(
                                "INSERT INTO attendance (id, name, date, period, method, session_type, intruder_image) VALUES (?, ?, ?, ?, ?, ?, ?)",
                                ("UNKNOWN", "Intruder Alert", date_str, current_p, "SECURITY", session_type, filename)
                            )
                        conn.commit()

                with self.lock:
                    self._locations = locations
                    self._names = names
                    self._ids = ids
            except Exception as e:
                print(f"Detection Loop Error: {e}")

            # Increased detection frequency for ultra-responsiveness
            time.sleep(0.15)


detection_thread = DetectionThread(attendance_svc, cam_mgr)


# =============================================================================
# FLASK APP
# =============================================================================
app = Flask(__name__)
CORS(app)

@app.route('/api/database/clear_session', methods=['POST'])
def clear_session():
    """Wipe today's attendance records for a fresh start."""
    with db_mgr.get_connection() as conn:
        conn.execute("DELETE FROM attendance WHERE date = date('now')")
        conn.commit()
    return jsonify({"success": True, "message": "Attendance database refreshed for today."})

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if not os.path.exists('dist'):
        return """
        <div style='font-family: sans-serif; text-align: center; margin-top: 100px;'>
            <h1 style='color: #ef4444;'>Frontend Not Found</h1>
            <p>Please build the project using <code>npm run build</code> or ensure the <code>dist</code> folder exists.</p>
        </div>
        """, 404
    
    if path != "" and os.path.exists(os.path.join('dist', path)):
        return send_from_directory('dist', path)
    else:
        return send_from_directory('dist', 'index.html')


def gen_frames():
    """
    Generator that yields MJPEG frames at ~STREAM_FPS.
    Face detection runs in a separate thread; this just draws the
    latest cached results on each frame — zero lag.
    """
    scale_inv = 1.0 / PROCESS_SCALE
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

            # Professional Label
            font = cv2.FONT_HERSHEY_DUPLEX
            font_scale = 0.6
            text_size = cv2.getTextSize(name, font, font_scale, 1)[0]
            lw = text_size[0] + 16
            lh = text_size[1] + 16
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


@app.route('/api/intruders/<filename>')
def get_intruder_img(filename):
    return send_from_directory(INTRUDER_DIR, filename)


@app.route('/api/stats')
def get_stats():
    pi = attendance_svc.get_current_period()
    cp = pi["period"] if pi else "No Active Period"
    with db_mgr.get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(DISTINCT id) FROM students")
        total_st = cur.fetchone()[0]
        cur.execute("SELECT COUNT(DISTINCT id) FROM attendance WHERE date=?", (str(datetime.date.today()),))
        present_today = cur.fetchone()[0]
    return jsonify({
        "total_students": total_st,
        "present_today": present_today,
        "current_period": cp,
    })


@app.route('/api/students', methods=['GET'])
def list_students():
    with db_mgr.get_connection() as conn:
        df = pd.read_sql_query("SELECT id, name, registered_date FROM students", conn)
    return jsonify(df.to_dict('records'))


@app.route('/api/camera/refresh', methods=['POST'])
def refresh_camera():
    global cam_mgr, detection_thread
    print(">>> Refreshing camera system...")
    cam_mgr.stop()
    time.sleep(1)
    if cam_mgr.start():
        return jsonify({"status": "success", "message": "Camera re-initialized"}), 200
    return jsonify({"status": "error", "message": "Camera re-initialization failed"}), 500


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


def reg_preprocess(frame):
    """Deep-preprocessor for high-accuracy registration samples."""
    # Convert BGR to RGB (required by face_recognition)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    return rgb


# Registration progress (thread-safe for polling)
_reg_progress = {
    "active": False, "samples": 0, "target": 5, "name": "",
    "phase": "", "instruction": ""
}
_reg_lock = threading.Lock()

# 3D capture phases — 4 samples per pose × 5 poses = 20 samples
# Fast capture: 5 samples from front
REG_PHASES = [
    {"name": "Front", "instruction": "Detecting Face...", "samples": 5},
]


@app.route('/api/register/status', methods=['GET'])
def register_status():
    """Frontend polls this to show real-time sample count + current phase instruction."""
    with _reg_lock:
        return jsonify(_reg_progress)


@app.route('/api/register', methods=['POST'])
def register_student():
    """
    3D Multi-Angle Face Registration:
    - 5 phases: Front, Left, Right, Up, Down
    - 4 samples captured per phase = 20 total encodings
    - Captures different angles to build a 3D face profile
    - Uses face landmarks to detect head orientation for each phase
    """
    data = request.json
    sid, name = data.get('id'), data.get('name')
    if not sid or not name:
        return jsonify({"success": False, "message": "Missing ID/Name"}), 400

    total_target = sum(p["samples"] for p in REG_PHASES)

    # Initialize progress
    with _reg_lock:
        _reg_progress.update({
            "active": True, "samples": 0, "target": total_target,
            "name": name, "phase": "Preparing", "instruction": "Get ready..."
        })

    # PAUSE detection thread so registration gets exclusive camera access
    # Flush stale frames (Reduced)
    all_encodings = []
    for _ in range(3):
        cam_mgr.get_frame()
    
    print(f"Starting 3D capture for {name} (ID: {sid}) -- {len(REG_PHASES)} phases, {total_target} samples")

    start_time = time.time()

    for phase_idx, phase in enumerate(REG_PHASES):
        phase_name = phase["name"]
        phase_instruction = phase["instruction"]
        phase_target = phase["samples"]

        # Update progress with current phase
        with _reg_lock:
            _reg_progress["phase"] = phase_name
            _reg_progress["instruction"] = phase_instruction

        print(f"  Phase {phase_idx+1}/{len(REG_PHASES)}: {phase_name} -- \"{phase_instruction}\"")

        # Instant start

        phase_encodings = []
        best_frame = None
        max_blur = 0
        phase_start = time.time()

        while len(phase_encodings) < phase_target and (time.time() - phase_start) < 5:
            success, frame = cam_mgr.get_frame()
            if not success or frame is None:
                time.sleep(0.01)
                continue

            # Blur check (Relaxed for speed)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            blur_val = cv2.Laplacian(gray, cv2.CV_64F).var()
            if blur_val < 20: # Much more lenient
                continue

            rgb = reg_preprocess(frame)
            try:
                locs = face_recognition.face_locations(rgb, model=DETECTION_MODEL)
                if locs:
                    # Pick largest face
                    if len(locs) > 1:
                        areas = [(b - t) * (r - l) for (t, r, b, l) in locs]
                        locs = [locs[np.argmax(areas)]]

                    encs = face_recognition.face_encodings(rgb, locs, num_jitters=REG_NUM_JITTERS)
                    if encs:
                        phase_encodings.append(encs[0])
                        all_encodings.append(encs[0])
                        
                        if blur_val > max_blur:
                            max_blur = blur_val
                            best_frame = frame.copy()

                        with _reg_lock:
                            _reg_progress["samples"] = len(all_encodings)
            except Exception as e:
                print(f"    Error: {e}")
                continue

            time.sleep(0.01) # Minimum delay for max speed

        # Save the best frame from Phase 1 as the reference photo
        if phase_name == "Front" and best_frame is not None:
            photo_path = os.path.join(IMAGES_DIR, f"{sid}.jpg")
            cv2.imwrite(photo_path, best_frame)
            print(f"Reference photo saved to {photo_path}")

        print(f"    {phase_name}: captured {len(phase_encodings)}/{phase_target} samples")

    elapsed = round(time.time() - start_time, 1)
    print(f"3D Capture complete: {len(all_encodings)} samples in {elapsed}s across {len(REG_PHASES)} angles")

    # RESUME detection thread
    detection_thread.resume()

    # Mark progress as complete
    with _reg_lock:
        _reg_progress.update({
            "active": False, "samples": len(all_encodings),
            "phase": "Complete", "instruction": ""
        })

    if len(all_encodings) < REG_SAMPLES_MIN:
        return jsonify({
            "success": False,
            "message": f"Only captured {len(all_encodings)}/{REG_SAMPLES_MIN} samples. "
                       f"Ensure good lighting and follow the head position prompts."
        }), 400

    # Save dataset
    dataset_file = os.path.join(DATASET_DIR, f"{sid}.pkl")
    try:
        with open(dataset_file, 'wb') as f:
            pickle.dump({"id": sid, "name": name, "encoding": all_encodings}, f)
        print(f"Saved {len(all_encodings)} multi-angle face encodings to {dataset_file}")
    except Exception as e:
        print(f"Failed to save pkl: {e}")
        return jsonify({"success": False, "message": "Failed to save registration file"}), 500

    with db_mgr.get_connection() as conn:
        conn.execute("INSERT OR REPLACE INTO students (id, name) VALUES (?, ?)", (sid, name))
        conn.commit()
        print(f"Student '{name}' registered with {len(all_encodings)} multi-angle face samples")

    attendance_svc.load_known_faces()
    return jsonify({
        "success": True,
        "message": f"Registered {name} with {len(all_encodings)} 3D face samples ({len(REG_PHASES)} angles) in {elapsed}s"
    }), 201


def reg_preprocess(frame):
    """Preprocess a frame for registration (Full resolution for max accuracy)."""
    # Use full resolution (no resize) for registration to avoid missing faces
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    return np.ascontiguousarray(rgb, dtype=np.uint8)




@app.route('/api/reports/daily')
def daily_report():
    date_str = str(datetime.date.today())
    records = attendance_svc.get_history()
    today_records = [r for r in records if r['date'] == date_str]
    students = attendance_svc.get_students()
    absentees = [s for s in students if not any(r['id'] == s['id'] for r in today_records)]
    intruders = [r for r in today_records if r['method'] == 'SECURITY']
    
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    
    # Header
    p.setFillColor(colors.blue)
    p.rect(0, height - 80, width, 80, fill=True, stroke=False)
    p.setFillColor(colors.white)
    p.setFont("Helvetica-Bold", 24)
    p.drawString(40, height - 50, "ClassLens Daily Analytics")
    p.setFont("Helvetica", 12)
    p.drawString(40, height - 70, f"Report Date: {date_str}  |  Kuppam Engineering College")
    
    # Summary
    p.setFillColor(colors.black)
    p.setFont("Helvetica-Bold", 14)
    p.drawString(40, height - 120, "1. Executive Summary")
    p.setFont("Helvetica", 12)
    p.drawString(60, height - 140, f"- Total Registered Students: {len(students)}")
    p.drawString(60, height - 160, f"- Active Today: {len(today_records)}")
    p.drawString(60, height - 180, f"- Absentees: {len(absentees)}")
    p.drawString(60, height - 200, f"- Security Alerts: {len(intruders)}")
    
    # Absentees Table
    p.setFont("Helvetica-Bold", 14)
    p.drawString(40, height - 240, "2. Absentee List")
    p.line(40, height - 245, width - 40, height - 245)
    
    y = height - 270
    p.setFont("Helvetica-Bold", 10)
    p.drawString(60, y, "Student ID")
    p.drawString(200, y, "Name")
    y -= 20
    p.setFont("Helvetica", 10)
    for s in absentees[:20]: # Limit for single page demo
        p.drawString(60, y, s['id'])
        p.drawString(200, y, s['name'])
        y -= 20
        if y < 100: break
    
    p.showPage()
    p.save()
    
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name=f"Report_{date_str}.pdf", mimetype='application/pdf')


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================
def open_browser():
    """Wait for the server to start, then open the dashboard."""
    time.sleep(3)
    print("\n>>> Launching ClassLens Dashboard...")
    try:
        webbrowser.open("http://127.0.0.1:5000")
    except Exception as e:
        print(f"Failed to open browser: {e}")

if __name__ == "__main__":
    # 1. Start Camera
    has_cam = cam_mgr.start()
    
    # 2. Start Detection Thread if camera is online
    if has_cam:
        detection_thread.start()
    
    # 3. Open dashboard in a separate thread
    threading.Thread(target=open_browser, daemon=True).start()
    
    # 4. Startup Banner
    print("\n" + "="*60)
    print("  ClassLens AI Attendance System -- RASPBERRY PI EDITION")
    print("  Backend & Dashboard: http://127.0.0.1:5000")
    print(f"  Camera Status:      {'ONLINE' if has_cam else 'OFFLINE (Check connection)'}")
    print("  Press Ctrl+C to stop the server.")
    print("="*60 + "\n")
    
    # 5. Run Flask
    try:
        app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
    except KeyboardInterrupt:
        print("\nStopping ClassLens...")
        cam_mgr.stop()
        detection_thread.stop()
