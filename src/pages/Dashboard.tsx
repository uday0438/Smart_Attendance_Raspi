import React, { useState, useRef, useEffect } from 'react';
import { Trash2, Users, CheckCircle, Clock, Search, ArrowUpDown, Edit2, X, Globe, History, Camera, Video, VideoOff, ScanFace } from 'lucide-react';
import { getStudents, getAttendance, deleteStudent, updateAttendanceRecord, getPeriods, saveAttendance } from '../utils/storage';

const TIMEZONES = Array.from(new Set([
  Intl.DateTimeFormat().resolvedOptions().timeZone,
  'UTC', 'America/New_York', 'Asia/Kolkata', 'Europe/London'
]));

export default function Dashboard() {
  // Use state with initial load from localStorage
  const [students, setStudents] = useState<any[]>(() => getStudents());
  const [attendance, setAttendance] = useState<any[]>(() => getAttendance());
  const [periods, setPeriods] = useState<any[]>(() => getPeriods());

  const [searchQuery, setSearchQuery] = useState('');
  const [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState<string>('N/A');
  const [detectedFace, setDetectedFace] = useState<{ type: 'known' | 'unknown', name?: string, id?: string } | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);

  // Refresh component every 5 seconds to ensure synchronization
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      // Prioritize backend stats if available
      fetch('/api/stats')
        .then(res => res.json())
        .then(data => {
            setCurrentPeriod(data.current_period || 'N/A');
        })
        .catch(() => {
            // Fallback to simulation
            const now = new Date();
            const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            const activePeriod = getPeriods().find(p => currentTime >= p.start_time && currentTime <= p.end_time);
            setCurrentPeriod(activePeriod ? activePeriod.period : 'No Active Period');
        });

      setStudents(getStudents());
      setAttendance(getAttendance());
      setPeriods(getPeriods());
    }, 5000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Camera Stream Handler (Real or Mock)
  useEffect(() => {
    let stream: MediaStream | null = null;
    setCameraError(null);
    setUsingMock(false);

    if (isCameraActive) {
      // First try to use the Backend stream (if integrated and running)
      // For now, prioritize browser hardware for simulation mode
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true })
          .then(s => {
            stream = s;
            if (videoRef.current) videoRef.current.srcObject = stream;
          })
          .catch(err => {
            console.warn("Real camera access failed:", err);
            if (err.name === 'NotReadableError') {
              setCameraError("Camera is being used by another application (Zoom, Teams, or Python).");
            } else {
              setCameraError("Camera access denied or not found.");
            }
            // Fallback to Mock mode so dashboard isn't useless
            setUsingMock(true);
          });
      } else {
        setCameraError("Browser does not support camera access.");
        setUsingMock(true);
      }
    }

    return () => {
        stream?.getTracks().forEach(t => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [isCameraActive]);

  // Simulated AI Logic: Period Check & Auto-Attendance
  useEffect(() => {
    const updateLoop = setInterval(() => {
      // 1. Determine Current Period
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const activePeriod = getPeriods().find(p => currentTime >= p.start_time && currentTime <= p.end_time);
      const periodName = activePeriod ? activePeriod.period : 'No Active Period';
      setCurrentPeriod(periodName);

      // 2. Simulate Face Detection
      if (!isCameraActive) {
        setDetectedFace(null);
        return;
      }

      const rand = Math.random();
      const currentStudents = getStudents();

      if (rand < 0.2) {
        setDetectedFace(null);
      } else if (rand < 0.8 && currentStudents.length > 0) {
        const randomStudent = currentStudents[Math.floor(Math.random() * currentStudents.length)];
        setDetectedFace({ type: 'known', name: randomStudent.name, id: randomStudent.id });

        // 3. AUTO RECORD ATTENDANCE IF IN PERIOD
        if (periodName !== 'No Active Period') {
           const today = now.toISOString().split('T')[0];
           const currentAttendance = getAttendance();
           const alreadyMarked = currentAttendance.some(a => a.id === randomStudent.id && a.date === today && a.period === periodName);

           if (!alreadyMarked) {
             const newRecord = {
               id: randomStudent.id,
               name: randomStudent.name,
               date: today,
               period: periodName,
               status: 'Present' as any,
               method: 'Auto (Face)',
               timestamp: now.toISOString()
             };
             saveAttendance(newRecord);
             setAttendance(getAttendance()); // Refresh state
             console.log(`Auto-recorded: ${randomStudent.name}`);
           }
        }
      } else {
        setDetectedFace({ type: 'unknown' });
      }
    }, 4000); // Check every 4 seconds

    return () => clearInterval(updateLoop);
  }, [isCameraActive]);

  const handleDelete = (id: string) => {
    if (confirm("Delete student?")) {
      deleteStudent(id);
      setStudents(getStudents());
      setAttendance(getAttendance());
    }
  };

  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-6 relative max-w-7xl mx-auto p-4">
      <div className="flex justify-end">
        <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)} className="bg-white px-2 py-1 border rounded text-xs font-medium">
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Camera size={18} className="text-blue-600"/> Dashboard Scanner</h2>
            <button onClick={() => setIsCameraActive(!isCameraActive)} className={`px-3 py-1 rounded text-sm text-white ${isCameraActive ? 'bg-red-500' : 'bg-green-600'}`}>{isCameraActive ? 'OFF' : 'ON'}</button>
          </div>
          <div className="relative h-[450px] bg-black flex items-center justify-center overflow-hidden">
            {isCameraActive ? (
              <>
                {!usingMock ? (
                  <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-90" />
                ) : (
                  <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center text-center p-8">
                     <div className="animate-pulse mb-4 text-blue-400">
                        <ScanFace size={64}/>
                     </div>
                     <p className="text-white font-medium mb-1">Running in Scanner Mock Mode</p>
                     <p className="text-gray-400 text-xs max-w-xs">{cameraError}</p>
                     <div className="mt-4 border-2 border-blue-500/30 rounded px-3 py-1 text-blue-400 text-[10px] uppercase font-bold tracking-widest">Simulation Active</div>
                  </div>
                )}
                
                {detectedFace && (
                  <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-56 border-4 rounded-lg z-20 ${detectedFace.type === 'known' ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)]' : 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]'}`}>
                    <div className={`absolute -top-10 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white whitespace-nowrap ${detectedFace.type === 'known' ? 'bg-green-500' : 'bg-red-500'}`}>
                        {detectedFace.type === 'known' ? `Hi, ${detectedFace.name}` : 'Unknown Student'}
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

        <div className="lg:col-span-1 flex flex-col gap-4">
           <Card label="Total Students" value={students.length} icon={<Users className="text-blue-600"/>} />
           <Card label="Attendance Today" value={attendance.filter(a => a.date === new Date().toISOString().split('T')[0]).length} icon={<CheckCircle className="text-green-600"/>} />
           <Card label="Current Period" value={currentPeriod} icon={<Clock className="text-purple-600"/>} color="border-purple-200" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 flex justify-between items-center border-b">
          <h2 className="text-lg font-semibold">Registered Students</h2>
          <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 pr-3 py-1 border rounded text-sm"/></div>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b"><tr><th className="px-6 py-3">ID</th><th className="px-6 py-3">Name</th><th className="px-6 py-3 text-right">Action</th></tr></thead>
          <tbody className="divide-y">
            {filteredStudents.map(s => (
              <tr key={s.id} className="hover:bg-gray-50"><td className="px-6 py-4 font-mono">{s.id}</td><td className="px-6 py-4">{s.name}</td><td className="px-6 py-4 text-right"><button onClick={() => handleDelete(s.id)} className="text-red-600 p-1 hover:bg-red-50 rounded"><Trash2 size={16}/></button></td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-teal-600 text-white font-bold">Recent Recognition History</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b"><tr><th className="px-6 py-3">Student</th><th className="px-6 py-3">Period</th><th className="px-6 py-3">Date</th><th className="px-6 py-3">Method</th></tr></thead>
          <tbody className="divide-y">
            {attendance.slice(0, 10).map((r, i) => (
              <tr key={i} className="hover:bg-gray-50"><td className="px-6 py-4 font-medium">{r.name}</td><td className="px-6 py-4">{r.period}</td><td className="px-6 py-4">{r.date}</td><td className="px-6 py-4 text-xs text-gray-500 uppercase">{r.method}</td></tr>
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
