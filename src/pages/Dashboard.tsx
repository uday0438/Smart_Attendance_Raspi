import React, { useState, useEffect } from 'react';
import { Trash2, Users, CheckCircle, Clock, Search, Camera, VideoOff, ScanFace, Wifi, WifiOff } from 'lucide-react';
import { getStudents, getAttendance, deleteStudent, getPeriods, saveAttendance } from '../utils/storage';

const TIMEZONES = Array.from(new Set([
  Intl.DateTimeFormat().resolvedOptions().timeZone,
  'UTC', 'America/New_York', 'Asia/Kolkata', 'Europe/London'
]));

export default function Dashboard() {
  const [students, setStudents] = useState<any[]>(() => getStudents());
  const [attendance, setAttendance] = useState<any[]>(() => getAttendance());
  const [periods, setPeriods] = useState<any[]>(() => getPeriods());

  const [searchQuery, setSearchQuery] = useState('');
  const [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [currentPeriod, setCurrentPeriod] = useState<string>('N/A');
  const [backendOnline, setBackendOnline] = useState(false);
  const [presentToday, setPresentToday] = useState(0);
  const [streamError, setStreamError] = useState(false);

  // Refresh stats every 5 seconds from backend (or fallback to local)
  useEffect(() => {
    const refresh = () => {
      fetch('/api/stats')
        .then(res => {
          if (!res.ok) throw new Error('Backend offline');
          return res.json();
        })
        .then(data => {
          setBackendOnline(true);
          setCurrentPeriod(data.current_period || 'N/A');
          setPresentToday(data.present_today || 0);
        })
        .catch(() => {
          setBackendOnline(false);
          // Fallback: compute period from local timetable
          const now = new Date();
          const t = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
          const p = getPeriods().find(p => t >= p.start_time && t <= p.end_time);
          setCurrentPeriod(p ? p.period : 'No Active Period');
        });

      // Always sync local storage
      setStudents(getStudents());
      setAttendance(getAttendance());
      setPeriods(getPeriods());
    };

    refresh(); // run immediately
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  // Reset stream error when camera is toggled back on
  useEffect(() => {
    if (isCameraActive) setStreamError(false);
  }, [isCameraActive]);

  const handleDelete = (id: string) => {
    if (confirm("Delete student?")) {
      deleteStudent(id);
      setStudents(getStudents());
      setAttendance(getAttendance());
    }
  };

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const todayAttendance = attendance.filter(
    a => a.date === new Date().toISOString().split('T')[0]
  );

  return (
    <div className="space-y-6 relative max-w-7xl mx-auto p-4">
      {/* Top bar */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {backendOnline ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
              <Wifi size={12}/> AI Backend Online
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-medium text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full">
              <WifiOff size={12}/> Backend Offline — Local Mode
            </span>
          )}
        </div>
        <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)} className="bg-white px-2 py-1 border rounded text-xs font-medium">
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ============ SCANNER PANEL ============ */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Camera size={18} className="text-blue-600"/> Dashboard Scanner
            </h2>
            <button
              onClick={() => setIsCameraActive(!isCameraActive)}
              className={`px-3 py-1 rounded text-sm text-white ${isCameraActive ? 'bg-red-500' : 'bg-green-600'}`}
            >
              {isCameraActive ? 'OFF' : 'ON'}
            </button>
          </div>

          <div className="relative h-[450px] bg-black flex items-center justify-center overflow-hidden">
            {isCameraActive ? (
              <>
                {backendOnline && !streamError ? (
                  /* 
                   * BACKEND AI STREAM — the Python backend draws bounding boxes
                   * directly on each video frame at the actual face positions.
                   * No frontend overlay needed; boxes follow faces in real-time.
                   */
                  <img
                    src="/api/video"
                    alt="AI Camera Feed"
                    className="absolute inset-0 w-full h-full object-contain bg-black"
                    onError={() => {
                      console.warn("Backend video stream failed");
                      setStreamError(true);
                    }}
                  />
                ) : (
                  /* FALLBACK: Backend not running */
                  <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center text-center p-8">
                    <div className="animate-pulse mb-4 text-blue-400">
                      <ScanFace size={64}/>
                    </div>
                    <p className="text-white font-medium mb-1">
                      {streamError ? 'AI Stream Disconnected' : 'AI Backend Not Running'}
                    </p>
                    <p className="text-gray-400 text-xs max-w-xs mb-4">
                      {streamError
                        ? 'The backend video stream was interrupted. Start the Python backend and click retry.'
                        : 'Start the Python backend (app.py) to enable real-time AI face detection with bounding boxes.'}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setStreamError(false); setBackendOnline(true); }}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded font-medium hover:bg-blue-700"
                      >
                        Retry Connection
                      </button>
                    </div>
                    <div className="mt-4 border border-gray-700 rounded px-3 py-1 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                      Waiting for Backend
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center">
                <VideoOff size={48} className="text-gray-700 mx-auto mb-2"/>
                <p className="text-gray-500 text-sm">Scanner Disabled</p>
              </div>
            )}
          </div>
        </div>

        {/* ============ STAT CARDS ============ */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <Card label="Total Students" value={students.length} icon={<Users className="text-blue-600"/>} />
          <Card
            label="Present Today"
            value={backendOnline ? presentToday : todayAttendance.length}
            icon={<CheckCircle className="text-green-600"/>}
          />
          <Card label="Current Period" value={currentPeriod} icon={<Clock className="text-purple-600"/>} color="border-purple-200" />
        </div>
      </div>

      {/* ============ STUDENTS TABLE ============ */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 flex justify-between items-center border-b">
          <h2 className="text-lg font-semibold">Registered Students</h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 pr-3 py-1 border rounded text-sm"/>
          </div>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr><th className="px-6 py-3">ID</th><th className="px-6 py-3">Name</th><th className="px-6 py-3 text-right">Action</th></tr>
          </thead>
          <tbody className="divide-y">
            {filteredStudents.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-mono">{s.id}</td>
                <td className="px-6 py-4">{s.name}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => handleDelete(s.id)} className="text-red-600 p-1 hover:bg-red-50 rounded">
                    <Trash2 size={16}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ============ ATTENDANCE HISTORY ============ */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-teal-600 text-white font-bold">Recent Recognition History</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr><th className="px-6 py-3">Student</th><th className="px-6 py-3">Period</th><th className="px-6 py-3">Date</th><th className="px-6 py-3">Method</th></tr>
          </thead>
          <tbody className="divide-y">
            {attendance.slice(0, 10).map((r, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium">{r.name}</td>
                <td className="px-6 py-4">{r.period}</td>
                <td className="px-6 py-4">{r.date}</td>
                <td className="px-6 py-4 text-xs text-gray-500 uppercase">{r.method}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, icon, color = "border-gray-200" }: any) {
  return (
    <div className={`bg-white p-4 rounded-lg shadow-sm border-2 ${color} flex items-center gap-4`}>
       <div className="p-2 bg-gray-50 rounded-full">{icon}</div>
       <div><p className="text-xs text-gray-500 font-bold uppercase">{label}</p><p className="text-xl font-extrabold text-gray-900">{value}</p></div>
    </div>
  );
}
