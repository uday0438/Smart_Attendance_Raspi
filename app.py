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

# Configuration
DB_NAME = "attendance.db"
DATASET_DIR = "dataset"
CAMERA_INDEX = 0

# ============================================================================
# MANAGERS (OOP REFACTOR)
# ============================================================================

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
            print("📅 Database Managed & Initialized")

class CameraManager:
    def __init__(self, index=0):
        self.index = index
        self.cam = None
        self.lock = threading.Lock()

    def start(self):
        with self.lock:
            if self.cam is None or not self.cam.isOpened():
                # On Windows, cv2.CAP_DSHOW often prevents blank/failed reads
                self.cam = cv2.VideoCapture(self.index, cv2.CAP_DSHOW)
                if not self.cam.isOpened():
                    self.cam = cv2.VideoCapture(self.index) # fallback

                if self.cam.isOpened():
                    self.cam.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                    self.cam.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                    print(f"📷 Camera {self.index} started")
                else:
                    print(f"❌ Failed to open camera {self.index}")
        return self.cam.isOpened() if self.cam else False

    def get_frame(self):
        with self.lock:
            if self.cam and self.cam.isOpened():
                success, frame = self.cam.read()
                if not success:
                    print("⚠️ get_frame: self.cam.read() returned False")
                return success, frame
        return False, None


    def stop(self):
        with self.lock:
            if self.cam:
                self.cam.release()
                self.cam = None
                print("📷 Camera stopped")

class AttendanceService:
    def __init__(self, db_manager, camera_manager):
        self.db = db_manager
        self.camera = camera_manager
        self.known_encodings = []
        self.known_ids = []
        self.known_names = []
        self.load_known_faces()

    def load_known_faces(self):
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
        print(f"👤 Loaded {count} registered students.")

    def identify_faces(self, frame):
        if frame is None or frame.size == 0:
            return [], []

        try:
            # Resize for performance (0.5 is a good balance between speed and accuracy)
            small_frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
            # face_recognition requires 8-bit gray or RGB image
            rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
            # Force perfectly contiguous exact array for dlib
            rgb_small_frame = np.array(rgb_small_frame[:, :, :3], dtype=np.uint8, copy=True)
            
            face_locations = face_recognition.face_locations(rgb_small_frame, model="hog")
            face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

            face_names = []
            for face_encoding in face_encodings:
                name = "Unknown"
                if len(self.known_encodings) > 0:
                    matches = face_recognition.compare_faces(self.known_encodings, face_encoding, tolerance=0.5)
                    if True in matches:
                        face_distances = face_recognition.face_distance(self.known_encodings, face_encoding)
                        best_match_idx = np.argmin(face_distances)
                        if matches[best_match_idx]:
                            name = self.known_names[best_match_idx]
                face_names.append(name)
            
            return face_locations, face_names
        except Exception as e:
            print(f"⚠️ identify_faces error: {e}")
            return [], []

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
        ret, frame = self.camera.get_frame()
        if not ret or frame is None: return "Camera Error"

        locations, names = self.identify_faces(frame)
        recognized = [name for name in set(names) if name != "Unknown"]
        
        if not recognized: return "No recognized faces"

        date = str(datetime.date.today())
        count = 0
        with self.db.get_connection() as conn:
            cur = conn.cursor()
            for name in recognized:
                # Find ID for this name from known lists
                idx = self.known_names.index(name)
                sid = self.known_ids[idx]
                try:
                    cur.execute(
                        "INSERT OR IGNORE INTO attendance (id, name, date, period, method) VALUES (?, ?, ?, ?, ?)",
                        (sid, name, date, period, method)
                    )
                    if cur.rowcount > 0: count += 1
                except: continue
            conn.commit()
        return f"Marked {count} students present"

# initialize global state
db_mgr = DatabaseManager(DB_NAME)
cam_mgr = CameraManager(CAMERA_INDEX)
attendance_svc = AttendanceService(db_mgr, cam_mgr)

# ============================================================================
# FLASK APP
# ============================================================================

app = Flask(__name__)
CORS(app)

def gen_frames():
    cam_mgr.start()
    while True:
        success, frame = cam_mgr.get_frame()
        if not success:
            time.sleep(0.1)
            continue
        
        # Advanced Feature: Bounding Box Overlay
        locations, names = attendance_svc.identify_faces(frame)
        for (top, right, bottom, left), name in zip(locations, names):
            # Scale back up (since we resized to 0.5, multiply by 2)
            top, right, bottom, left = top*2, right*2, bottom*2, left*2
            color = (0, 255, 0) if name != "Unknown" else (0, 0, 255) # Green: Known, Red: Unknown
            
            # Box
            cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
            # Label background
            cv2.rectangle(frame, (left, bottom - 30), (right, bottom), color, cv2.FILLED)
            # Name tag
            cv2.putText(frame, name, (left + 6, bottom - 6), cv2.FONT_HERSHEY_DUPLEX, 0.7, (255, 255, 255), 1)

        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

# API ENDPOINTS
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
        "gpio_enabled": False
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
    # Cleanup file
    fpath = os.path.join(DATASET_DIR, f"{student_id}.pkl")
    if os.path.exists(fpath): os.remove(fpath)
    attendance_svc.load_known_faces()
    return jsonify({"status": "success"}), 204

@app.route('/api/timetable', methods=['GET', 'POST'])
def timetable():
    if request.method == 'POST':
        data = request.json
        with db_mgr.get_connection() as conn:
            conn.execute("INSERT OR REPLACE INTO timetable (period, start_time, end_time) VALUES (?, ?, ?)",
                         (data['period'], data['start_time'], data['end_time']))
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
    data = request.json
    sid, name = data.get('id'), data.get('name')
    if not sid or not name: return jsonify({"success": False, "message": "Missing ID/Name"}), 400
    
    # Capture loop
    encodings = []
    print(f"📸 Starting capture for {name} (ID: {sid})")
    
    # Flush stale frames
    for _ in range(5): cam_mgr.get_frame()
    
    for i in range(15): # Increased to 15 attempts
        time.sleep(0.1)
        success, frame = cam_mgr.get_frame()
        if success and frame is not None:
            # Scale down slightly for performance and noise reduction
            small_frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
            rgb = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
            rgb = np.array(rgb[:, :, :3], dtype=np.uint8, copy=True)
            try:
                # Use faster 'hog' model
                locs = face_recognition.face_locations(rgb, model="hog")
                if locs:
                    encs = face_recognition.face_encodings(rgb, locs)
                    if encs: 
                        encodings.append(encs[0])
                        print(f"✅ Sample {len(encodings)}/15 captured")
                else:
                    print(f"◽ Loop {i+1}: No face seen")
            except Exception as e:
                print(f"⚠️ capture error at loop {i+1}: {e}")
        
        if len(encodings) >= 5: break # Finish early if we have enough
    
    print(f"📊 Capture finished. Total faces found: {len(encodings)}")
    
    if len(encodings) < 3:
        return jsonify({"success": False, "message": f"Could only find {len(encodings)} samples. Look directly at camera."}), 400
        
    # Save dataset
    dataset_file = os.path.join(DATASET_DIR, f"{sid}.pkl")
    try:
        with open(dataset_file, 'wb') as f:
            pickle.dump({"id": sid, "name": name, "encoding": encodings}, f)
            print(f"💾 Saved face data to {dataset_file}")
    except Exception as e:
        print(f"❌ Failed to save pkl: {e}")
        return jsonify({"success": False, "message": "Failed to save registration file"}), 500
        
    # Use the global db_mgr
    with db_mgr.get_connection() as conn:
        conn.execute("INSERT OR REPLACE INTO students (id, name) VALUES (?, ?)", (sid, name))
        conn.commit()
        print(f"🗄️ Database entry created for {name}")
        
    attendance_svc.load_known_faces()
    return jsonify({"success": True, "message": f"Successfully Registered {name}"}), 201

if __name__ == "__main__":
    if cam_mgr.start():
        print("🚀 Professional Attendance Backend Running on http://localhost:5000")
        app.run(host="0.0.0.0", port=5000, threaded=True, debug=False)
    else:
        print("❌ Startup failed: Camera could not be initialized")
