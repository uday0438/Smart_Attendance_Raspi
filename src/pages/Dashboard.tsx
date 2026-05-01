import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Users, CheckCircle, Clock, Trash2, Search, VideoOff, 
  ScanFace, Camera, RefreshCw, Download, AlertTriangle, 
  Activity, Bell, Calendar as CalendarIcon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { getStudents, deleteStudent, getAttendance, deleteAttendanceRecord } from '../utils/storage';

export default function Dashboard({ theme }: { theme: string }) {
  const [students, setStudents] = useState(() => getStudents());
  const [searchQuery, setSearchQuery] = useState('');
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState('N/A');
  const [presentToday, setPresentToday] = useState(0);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [serverTime, setServerTime] = useState<string>('');
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const failCount = React.useRef(0);

  // Request notification permissions
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const lastNotificationRef = React.useRef<string | null>(null);

  const [streamKey, setStreamKey] = useState(0);

  const refreshCamera = async () => {
    setLoading(true);
    try {
      await fetch('/api/camera/refresh', { method: 'POST' });
      setStreamKey(prev => prev + 1);
      setStreamError(false);
    } catch (err) {
      console.error("Camera refresh ignored");
    } finally {
      setLoading(false);
    }
  };

  const refreshStats = useCallback(async () => {
    setLoading(true);
    try {
      const statsRes = await fetch('/api/stats');
      if (statsRes.ok) {
        failCount.current = 0;
        const data = await statsRes.json();
        setBackendOnline(true);
        setCurrentPeriod(data.current_period || 'No Active Period');
        setPresentToday(data.present_today || 0);
        setTotalStudents(data.total_students || 0);
        setServerTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        
        // Fetch Students
        const studentsRes = await fetch('/api/students');
        if (studentsRes.ok) {
           const stuData = await studentsRes.json();
           setStudents(stuData);
        }

        const historyRes = await fetch('/api/attendance');
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          
          // Check for new intruders to notify
          const latest = historyData[0];
          if (latest && latest.intruder_image && latest.timestamp !== lastNotificationRef.current) {
             lastNotificationRef.current = latest.timestamp;
             if (Notification.permission === "granted") {
                new Notification("🚨 INTRUDER ALERT", {
                  body: `Unknown face detected in ${latest.period}`,
                  icon: '/favicon.ico'
                });
             }
          }
          
          setAttendance(historyData);
        }
      } else {
        throw new Error('Stats failed');
      }
    } catch (err) {
      failCount.current += 1;
      if (failCount.current >= 3) {
        setBackendOnline(false);
      }
      const localAttendance = getAttendance();
      setAttendance(localAttendance);
      setTotalStudents(getStudents().length);
      setPresentToday(localAttendance.filter(a => a.date === new Date().toISOString().split('T')[0]).length);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 5000);
    return () => clearInterval(interval);
  }, [refreshStats]);


  const handleDelete = (id: string) => {
    if (confirm(`Remove student ${id} and all their records?`)) {
      fetch(`/api/students/${id}`, { method: 'DELETE' })
        .then(() => {
          deleteStudent(id);
          setStudents(getStudents());
        });
    }
  };

  const handleExportExcel = () => {
    const dataToExport = attendance.map(r => ({
      Student: r.name,
      ID: r.id,
      Date: r.date,
      Time: new Date(r.timestamp).toLocaleTimeString(),
      Period: r.period,
      Session: r.session_type || 'General',
      Method: r.method
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Recognition History");
    XLSX.writeFile(workbook, `Attendance_History_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isLight = theme === 'light';

  return (
    <div className="space-y-8 pb-20">
      {/* ============ HEADER ============ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-6xl font-black tracking-tighter uppercase drop-shadow-sm">Dashboard</h1>
          <p className="font-bold tracking-[0.2em] uppercase text-xs mt-3 flex items-center gap-3">
            <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]"></span>
             AI Neural Engine Operational
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={handleExportExcel}
            className={`flex items-center gap-2 group px-7 py-3.5 rounded-2xl text-sm font-black transition-all active:scale-95 border ${
              isLight ? 'bg-white text-gray-900 border-gray-200 shadow-xl' : 'bg-white/5 text-white border-white/10 backdrop-blur-3xl'
            }`}
          >
            <Download size={18} className="group-hover:translate-y-0.5 transition-transform" />
            Registry Export
          </button>
          <button
            onClick={() => { refreshStats(); refreshCamera(); }}
            className={`p-4 rounded-2xl transition-all active:rotate-180 duration-700 border ${
               isLight ? 'bg-white text-blue-600 border-gray-200' : 'glass-panel text-white active:bg-white/10 shadow-2xl'
            }`}
          >
            <RefreshCw size={20} className={loading ? 'animate-spin outline-none' : ''} />
          </button>
        </div>
      </div>

      {/* ============ TOP GRID ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* STATS */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <Card 
            label="Total Registry" value={totalStudents} 
            icon={<Users className="text-blue-500" size={28}/>}
            theme={theme}
          />
          <Card 
            label="Daily Scans" value={presentToday} 
            icon={<CheckCircle className="text-green-500" size={28}/>}
            theme={theme}
          />
          <Card
            label="Current Session" value={currentPeriod}
            subtext={`Gateway: ${serverTime}`}
            icon={<Clock className="text-purple-500" size={28}/>}
            theme={theme}
          />
        </div>

        {/* AI FEED */}
        <div className="lg:col-span-3 space-y-6">
           <div className="glass-panel rounded-[2.5rem] p-2 shadow-2xl relative overflow-hidden border border-white/5">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600"></div>
              <div className="bg-black rounded-[2rem] overflow-hidden aspect-video relative group shadow-inner border border-white/5">
                   {backendOnline ? (
                     <img
                       key={streamKey}
                       src={`/api/video?k=${streamKey}`}
                       alt="AI Video Stream"
                       className="w-full h-full object-cover"
                       onError={() => setStreamError(true)}
                     />
                   ) : (
                     <div className="flex flex-col items-center justify-center h-full text-center bg-gray-950 italic text-white/20">
                       <Camera size={64} className="mb-6 opacity-10"/>
                       <p className="text-2xl font-black tracking-widest uppercase mb-2">Sensor Link Broken</p>
                       <p className="text-xs not-italic">Reconnect AI Terminal to resume stream</p>
                     </div>
                   )}
                   <div className="absolute top-6 left-6 px-4 py-2 bg-red-600 text-white text-[10px] font-black rounded-full shadow-2xl flex items-center gap-2 ring-4 ring-red-600/20 backdrop-blur-md">
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                      LIVE SENSOR DATA
                   </div>
              </div>
           </div>

           {/* REGISTERED STUDENTS QUICK LIST */}
           <div className="glass-panel p-6 rounded-[2rem] border border-white/5 shadow-2xl">
              <div className="flex items-center justify-between mb-4 px-2">
                 <h3 className="text-xs font-black uppercase tracking-[0.3em] text-gray-500">Authorized Identity Database</h3>
                 <span className="text-[10px] font-black bg-blue-600/10 text-blue-500 px-3 py-1 rounded-full border border-blue-500/20">
                    {students.length} VERIFIED NODES
                 </span>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                 {students.length === 0 ? (
                    <p className="text-xs italic text-gray-500 p-4">No verified identities found in kernel...</p>
                 ) : (
                    students.map((s) => (
                       <div key={s.id} className="flex-shrink-0 w-40 p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center text-center group relative hover:bg-blue-600/10 hover:border-blue-500/30 transition-all cursor-default">
                          <button 
                             onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                             className="absolute top-3 right-3 p-1.5 bg-red-600/10 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-600 hover:text-white transition-all shadow-lg"
                             title="Remove Identity"
                          >
                             <Trash2 size={12}/>
                          </button>
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 transition-transform">
                             <span className="text-white font-black text-sm">{s.name.charAt(0)}</span>
                          </div>
                          <p className="text-sm font-black text-white truncate w-full mb-1">{s.name}</p>
                          <p className="text-[10px] font-bold text-gray-500 tracking-tighter uppercase">ID: {s.id}</p>
                       </div>
                    ))
                 )}
              </div>
           </div>
        </div>
      </div>


      {/* ============ ACTIVITY LOGS ============ */}
      <div className="glass-panel rounded-3xl shadow-2xl overflow-hidden border border-white/5">
        <div className="px-10 py-8 bg-white/5 border-b border-white/10 flex justify-between items-center">
           <div>
             <h3 className="font-black text-3xl tracking-tight uppercase">Registry Records</h3>
             <p className="text-[10px] text-gray-500 font-bold mt-2 tracking-[0.3em] uppercase">Temporal Monitoring Stream</p>
           </div>
           <div className={`flex items-center gap-3 px-6 py-2.5 rounded-full border ${isLight ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-blue-600/10 border-blue-500/20 text-blue-400'}`}>
              <Activity size={16} className="animate-pulse"/>
              <span className="text-xs font-black uppercase">Deep Scan Active</span>
           </div>
        </div>
        <div className="overflow-x-auto px-2">
          <table className="w-full text-left text-sm">
            <thead className="text-gray-500 border-b border-white/5 uppercase text-[10px] font-black tracking-widest">
              <tr>
                <th className="px-10 py-6">Identity</th>
                <th className="px-10 py-6">Location / Period</th>
                <th className="px-10 py-6">Marker Date</th>
                <th className="px-10 py-6">Precision Time</th>
                <th className="px-10 py-6">Method</th>
                <th className="px-10 py-6 text-right">Analysis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {attendance.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-10 py-24 text-center italic text-gray-500 font-bold">Scanning for active signatures...</td>
                </tr>
              ) : (
                attendance.slice(0, 50).map((r, i) => (
                  <tr key={r.timestamp || i} className={`${r.intruder_image ? 'bg-red-500/10 border-l-4 border-red-600' : 'hover:bg-white/5'} transition-all group`}>
                    <td className="px-10 py-6">
                      <div className="flex items-center gap-4">
                         <div className={`w-3 h-3 rounded-full ${r.intruder_image ? 'bg-red-500 shadow-[0_0_10px_rgba(220,38,38,0.5)]' : 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]'}`}></div>
                         <span className={`font-black tracking-tight text-xl ${r.intruder_image ? 'text-red-500' : (isLight ? 'text-gray-900' : 'text-white')}`}>
                           {r.name}
                         </span>
                      </div>
                    </td>
                    <td className="px-10 py-6">
                      <div className="font-black opacity-80 uppercase tracking-tighter text-sm mb-1">{r.period}</div>
                      <div className={`text-[9px] uppercase font-black px-2.5 py-1 rounded-lg w-max border shadow-sm ${
                        r.session_type === 'Check-In' ? 'bg-blue-600 text-white' :
                        r.session_type === 'Check-Out' ? 'bg-orange-500 text-white' :
                        'bg-white/10 text-gray-500'
                      }`}>
                        {r.session_type || 'GENERAL'}
                      </div>
                    </td>
                    <td className="px-10 py-6 text-gray-500 font-black text-xs uppercase tracking-widest">{r.date}</td>
                    <td className="px-10 py-6">
                       <span className={`font-black text-lg tracking-tighter ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                         {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                       </span>
                    </td>
                    <td className="px-10 py-6">
                       <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black tracking-wider shadow-sm border ${r.method === 'SECURITY' ? 'bg-red-900 text-red-100 border-red-700' : 'bg-white/5 border-white/5'}`}>
                         {r.method.toUpperCase()}
                       </span>
                    </td>
                    <td className="px-10 py-6 text-right">
                      <div className="flex justify-end items-center gap-5">
                        {r.intruder_image ? (
                          <button 
                            onClick={() => setZoomedImage(`/api/intruders/${r.intruder_image}`)}
                            className="w-16 h-12 rounded-xl border-2 border-red-600 overflow-hidden ring-4 ring-red-600/10 hover:scale-110 transition-all shadow-2xl relative"
                          >
                            <img src={`/api/intruders/${r.intruder_image}`} alt="intruder" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-red-600/10 group-hover:bg-transparent transition-colors"></div>
                          </button>
                        ) : (
                          <div className="p-3 bg-blue-600/10 text-blue-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                             <CheckCircle size={20}/>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============ IMAGE ZOOM MODAL ============ */}
      {zoomedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in duration-300" onClick={() => setZoomedImage(null)}>
           <div className="max-w-4xl w-full bg-red-600 p-8 rounded-[3rem] shadow-[0_0_150px_rgba(220,38,38,0.4)] relative overflow-hidden group">
              <div className="mb-6 flex justify-between items-center">
                 <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase flex items-center gap-4">
                   <AlertTriangle className="animate-bounce" size={36}/> SECURITY BREACH
                 </h2>
                 <span className="text-xs bg-black/30 border border-white/10 px-6 py-2 rounded-full text-white font-black tracking-widest">RAW SIGNATURE</span>
              </div>
              <div className="relative rounded-[2rem] overflow-hidden border-4 border-white/20 shadow-2xl">
                 <img src={zoomedImage} className="w-full h-full" alt="intruder" />
                 <div className="absolute top-0 left-0 w-full h-[3px] bg-white animate-scan opacity-40"></div>
                 <div className="absolute inset-0 ring-[60px] ring-black/40 pointer-events-none"></div>
              </div>
              <p className="mt-8 text-center text-white/50 text-xs font-black tracking-widest uppercase animate-pulse">Touch screen or click to dismiss intercept</p>
           </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, icon, subtext, theme }: any) {
  const isLight = theme === 'light';
  return (
    <div className={`glass-panel p-8 rounded-[2rem] border-2 flex items-center gap-6 group hover:translate-y-[-4px] transition-all duration-500 ${
      isLight ? 'border-gray-100 hover:border-blue-500 shadow-xl' : 'border-white/5 hover:border-blue-500/30 shadow-2xl'
    }`}>
       <div className={`p-5 rounded-2xl group-hover:scale-110 group-hover:rotate-6 transition-all duration-700 ${isLight ? 'bg-gray-50' : 'bg-white/5 shadow-inner'}`}>{icon}</div>
       <div className="flex-1">
         <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mb-1">{label}</p>
         <p className={`text-4xl font-black tracking-tighter ${isLight ? 'text-gray-900' : 'text-white'}`}>{value}</p>
         {subtext && <p className="text-[9px] text-blue-500 mt-2 font-black tracking-widest uppercase bg-blue-500/10 w-max px-3 py-1 rounded-full">{subtext}</p>}
       </div>
    </div>
  );
}

function ActivityRow({ label, value, color }: any) {
  return (
    <div className="group">
       <div className="flex justify-between items-end mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</span>
          <span className="text-xs font-black">{value}</span>
       </div>
       <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div className={`${color} h-full rounded-full transition-all duration-1000 group-hover:w-full`} style={{width: '70%'}}></div>
       </div>
    </div>
  );
}
