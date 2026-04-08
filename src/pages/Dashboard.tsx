import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, CheckCircle, Clock, Trash2, Search, VideoOff, 
  ScanFace, Camera, RefreshCw, CheckSquare, Download, AlertTriangle 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { getStudents, deleteStudent, getAttendance, deleteAttendanceRecord } from '../utils/storage';

export default function Dashboard() {
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
        
        const historyRes = await fetch('/api/attendance');
        if (historyRes.ok) {
          const historyData = await historyRes.json();
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

  const handleDeleteAttendance = (timestamp: string) => {
    if (confirm("Remove this recognition record?")) {
      deleteAttendanceRecord(timestamp);
      refreshStats();
    }
  };

  const handleManualAttendance = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trigger', { method: 'POST' });
      const data = await res.json();
      alert(data.message);
      refreshStats();
    } catch {
      alert("Trigger failed. Is backend running?");
    } finally {
      setLoading(false);
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

  return (
    <div className="space-y-8 pb-20">
      {/* ============ HEADER ============ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 animate-in fade-in slide-in-from-top duration-700">
        <div>
          <h1 className="text-5xl font-black text-white tracking-tighter uppercase drop-shadow-2xl">Dashboard</h1>
          <p className="text-blue-400 font-bold tracking-widest uppercase text-xs mt-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></span>
            Advanced AI Recognition System Active
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-xl text-white px-6 py-3 rounded-xl text-sm font-bold shadow-2xl transition-all active:scale-95 group"
          >
            <Download size={18} className="group-hover:translate-y-0.5 transition-transform" />
            Export History
          </button>
          <button
            onClick={refreshStats}
            className="p-3.5 glass-panel rounded-xl text-white hover:bg-white/10 transition-all shadow-xl active:rotate-180 duration-500"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-blue-400' : ''} />
          </button>
        </div>
      </div>

      {/* ============ TOP GRID ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in zoom-in duration-700 delay-100">
        <div className="lg:col-span-2 glass-panel rounded-3xl p-1 shadow-2xl relative group overflow-hidden border border-white/5">
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-600"></div>
           <div className="p-6">
              <h2 className="text-xl font-black text-white mb-6 flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg"><ScanFace className="text-blue-400" size={24}/></div>
                System Eye <span className="text-xs font-normal text-gray-500 tracking-normal ml-auto">640x480 HOG ENGINE</span>
              </h2>
              
              <div className="bg-black/40 rounded-2xl overflow-hidden aspect-video relative border border-white/10 shadow-2xl group">
                {backendOnline ? (
                  <img
                    src="/api/video"
                    alt="AI Video Stream"
                    className="w-full h-full object-cover"
                    onError={() => setStreamError(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-950/80 italic text-white/30">
                    <Camera size={64} className="mb-4 opacity-20"/>
                    <p className="text-lg font-bold tracking-widest uppercase">Scanner Offline</p>
                    <p className="text-xs mt-2 not-italic">Start app.py to initialize AI Vision</p>
                  </div>
                )}
                <div className="absolute top-4 left-4 px-3 py-1 bg-red-600 text-white text-[10px] font-black rounded-full shadow-lg flex items-center gap-1.5 ring-4 ring-red-600/20">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                  LIVE FEED
                </div>
                <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button onClick={handleManualAttendance} className="bg-orange-600 text-white px-4 py-2 rounded-lg font-black text-xs shadow-2xl hover:bg-orange-500 active:scale-95 transition-all">FORCE SCAN</button>
                </div>
              </div>
           </div>
        </div>

        <div className="flex flex-col gap-4">
          <Card 
            label="Enrolled Base" 
            value={backendOnline ? totalStudents : students.length} 
            icon={<Users className="text-blue-400" size={28}/>}
            subtext="Validated Entities"
          />
          <Card 
            label="Verified Today" 
            value={presentToday} 
            icon={<CheckCircle className="text-green-400" size={28}/>}
            subtext="Confirmed Entry"
          />
          <Card
            label="Current Session"
            value={backendOnline ? currentPeriod : 'OFFLINE'}
            subtext={backendOnline ? `Gateway active until ${serverTime}` : 'Check backend status'}
            icon={<Clock className="text-purple-400" size={28}/>}
            color="border-purple-500/30"
          />
        </div>
      </div>

      {/* ============ HISTORY TABLE ============ */}
      <div className="glass-panel rounded-3xl shadow-2xl overflow-hidden border border-white/5 animate-in slide-in-from-bottom duration-1000 delay-200">
        <div className="px-8 py-6 bg-white/5 border-b border-white/10 flex justify-between items-center">
           <div>
             <h3 className="font-black text-2xl text-white tracking-tight uppercase">Activity Logs</h3>
             <p className="text-xs text-gray-500 font-bold mt-1 tracking-widest">Real-time Recognition Stream</p>
           </div>
           <div className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 rounded-full border border-blue-500/20">
              <RefreshCw size={12} className="text-blue-400 animate-spin"/>
              <span className="text-[10px] text-blue-400 font-black uppercase">Auto-Syncing</span>
           </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-white/5 text-gray-500 border-b border-white/5 uppercase text-[10px] font-black tracking-widest">
              <tr>
                <th className="px-8 py-5">Entity Name</th>
                <th className="px-8 py-5">Slot / Status</th>
                <th className="px-8 py-5">Registry Date</th>
                <th className="px-8 py-5">Time Marker</th>
                <th className="px-8 py-5">Entry Mode</th>
                <th className="px-8 py-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {attendance.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center italic text-gray-600">No recent activity detected. Waiting for recognition event...</td>
                </tr>
              ) : (
                attendance.slice(0, 50).map((r, i) => (
                  <tr key={r.timestamp || i} className={`${r.intruder_image ? 'bg-red-500/10 border-l-4 border-red-600' : 'hover:bg-white/5'} transition-all group`}>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                         <div className={`w-2 h-2 rounded-full ${r.intruder_image ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`}></div>
                         <span className={`font-black tracking-tight text-lg ${r.intruder_image ? 'text-red-400' : 'text-white'}`}>
                           {r.name}
                         </span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-gray-300">
                      <div className="font-bold">{r.period}</div>
                      <div className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-md w-max mt-1 border shadow-sm ${
                        r.session_type === 'Check-In' ? 'bg-blue-600/20 text-blue-400 border-blue-500/20' :
                        r.session_type === 'Check-Out' ? 'bg-orange-600/20 text-orange-400 border-orange-500/20' :
                        'bg-white/5 text-gray-500 border-white/5'
                      }`}>
                        {r.session_type || 'GENERAL'}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-gray-500 font-medium">{r.date}</td>
                    <td className="px-8 py-5">
                       <span className="text-gray-300 font-black">{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="px-8 py-5">
                       <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black tracking-wider shadow-sm ${r.method === 'SECURITY' ? 'bg-red-900/60 text-red-200 border border-red-500/30' : 'bg-white/5 text-gray-400 border border-white/5'}`}>
                         {r.method.toUpperCase()}
                       </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end items-center gap-4">
                        {r.intruder_image ? (
                          <div className="relative group">
                            <button 
                              onClick={() => setZoomedImage(`/api/intruders/${r.intruder_image}`)}
                              className="w-14 h-12 rounded-xl border-2 border-red-600/50 overflow-hidden ring-4 ring-red-600/20 hover:scale-110 transition-all shadow-2xl relative"
                            >
                              <img src={`/api/intruders/${r.intruder_image}`} alt="intruder" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-red-600/20 group-hover:bg-transparent transition-colors"></div>
                            </button>
                            <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[8px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-black">VIEW ALERT</span>
                          </div>
                        ) : (
                          <button onClick={() => handleDeleteAttendance(r.timestamp)} className="text-gray-700 p-2.5 hover:bg-red-600/20 hover:text-red-500 rounded-xl transition-all opacity-0 group-hover:opacity-100">
                            <Trash2 size={18}/>
                          </button>
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

      {/* ============ STUDENTS DIRECTORY ============ */}
      <div className="glass-panel rounded-3xl shadow-2xl border border-white/5 animate-in slide-in-from-bottom duration-1000 delay-300">
         <div className="px-8 py-6 border-b border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Student Directory</h2>
            <div className="relative w-full md:w-80">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"/>
              <input 
                type="text" 
                placeholder="Search Identity Database..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
            </div>
         </div>
         <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStudents.length === 0 ? (
               <div className="col-span-full py-10 text-center text-gray-600 font-bold italic">No students found matching your search.</div>
            ) : (
              filteredStudents.map(s => (
                <div key={s.id} className="bg-white/5 rounded-2xl p-4 border border-white/10 hover:border-blue-500/50 transition-all group relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleDelete(s.id)} className="p-2 bg-red-600/20 text-red-500 rounded-lg hover:bg-red-600 hover:text-white transition-all">
                        <Trash2 size={14}/>
                      </button>
                   </div>
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center text-blue-400 font-black text-xs ring-4 ring-blue-500/5 group-hover:scale-110 transition-transform uppercase">
                         {s.id.slice(0, 2)}
                      </div>
                      <div>
                         <p className="text-white font-black leading-tight text-lg tracking-tight uppercase">{s.name}</p>
                         <p className="text-xs text-gray-500 font-mono tracking-widest uppercase mt-1">ID: {s.id}</p>
                      </div>
                   </div>
                </div>
              ))
            )}
         </div>
      </div>

      {/* ============ IMAGE ZOOM MODAL ============ */}
      {zoomedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setZoomedImage(null)}>
           <div className="max-w-4xl w-full bg-red-600 text-white font-black text-sm px-6 py-3 rounded-t-3xl flex justify-between items-center shadow-2xl">
              <span className="flex items-center gap-2 tracking-widest uppercase">
                 <AlertTriangle size={18} className="animate-bounce"/> 
                 Security Breach - Intruder Identified
              </span>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">RAW CAPTURE</span>
           </div>
           <div className="relative group">
              <img 
                src={zoomedImage} 
                className="max-w-full max-h-[75vh] border-x-4 border-b-4 border-red-600 shadow-[0_0_100px_rgba(220,38,38,0.3)] rounded-b-3xl" 
                alt="zoomed intruder" 
              />
              <div className="absolute top-1/2 left-0 w-full h-[2px] bg-red-600/50 animate-scan pointer-events-none shadow-[0_0_20px_rgba(220,38,38,1)]"></div>
           </div>
           <p className="text-gray-500 text-[10px] mt-8 uppercase font-black tracking-widest animate-pulse">Click anywhere to return to command center</p>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, icon, subtext, color = "border-white/10" }: any) {
  return (
    <div className={`glass-panel p-6 rounded-3xl border-2 ${color} flex items-center gap-5 group hover:border-blue-500/50 transition-all hover:translate-x-2`}>
       <div className="p-4 bg-white/5 rounded-2xl group-hover:scale-110 transition-transform group-hover:bg-blue-600/10 active:scale-95 duration-500">{icon}</div>
       <div className="flex-1">
         <p className="text-[11px] text-gray-500 font-black uppercase tracking-[0.2em]">{label}</p>
         <p className="text-3xl font-black text-white tracking-tighter mt-1">{value}</p>
         {subtext && <p className="text-[10px] text-blue-400 mt-2 font-bold tracking-tight bg-blue-500/10 w-max px-2 py-0.5 rounded-full">{subtext}</p>}
       </div>
    </div>
  );
}
