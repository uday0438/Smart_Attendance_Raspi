import React, { useState, useEffect, useRef } from 'react';
import { Save, ScanFace, CheckCircle2, AlertCircle, Camera, Loader2, UserPlus, Fingerprint } from 'lucide-react';
import { saveStudent } from '../utils/storage';

export default function Register() {
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [sampleTarget, setSampleTarget] = useState(10);
  const [phase, setPhase] = useState('');
  const [instruction, setInstruction] = useState('');
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then(res => { if (res.ok) setBackendOnline(true); })
      .catch(() => setBackendOnline(false));
  }, []);

  useEffect(() => {
    if (isScanning) {
      pollRef.current = setInterval(() => {
        fetch('/api/register/status')
          .then(res => res.json())
          .then(data => {
            setSampleCount(data.samples || 0);
            setSampleTarget(data.target || 10);
            setPhase(data.phase || '');
            setInstruction(data.instruction || '');
          })
          .catch(() => {});
      }, 300);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isScanning]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !rollNo.trim()) return;

    setResultMsg(null);
    setIsScanning(true);
    setSampleCount(0);

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rollNo, name: name }),
      });
      const data = await res.json();

      if (data.success) {
        saveStudent({ id: rollNo, name: name, registered_date: new Date().toISOString() });
        setResultMsg({ type: 'success', text: 'Onboarding Complete: ' + data.message });
        setName('');
        setRollNo('');
      } else {
        setResultMsg({ type: 'error', text: data.message });
      }
    } catch (err) {
      setResultMsg({ type: 'error', text: 'AI Kernel connection failed. System Offline.' });
    } finally {
      setIsScanning(false);
    }
  };

  const progress = sampleTarget > 0 ? Math.min((sampleCount / sampleTarget) * 100, 100) : 0;

  return (
    <div className="max-w-6xl mx-auto p-4 pb-20">
      <div className="mb-10 text-center animate-in fade-in slide-in-from-top duration-1000">
        <div className="inline-flex p-4 bg-blue-600/10 rounded-full mb-4 border border-blue-500/20 shadow-[0_0_30px_rgba(37,99,235,0.1)]">
           <UserPlus className="text-blue-400" size={32}/>
        </div>
        <h1 className="text-5xl font-black text-white tracking-tighter uppercase">Entity Enrollment</h1>
        <p className="text-gray-500 font-bold uppercase tracking-[0.3em] text-xs mt-3">Biometric Core Initialization</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* ===== FORM PANEL ===== */}
        <div className="lg:col-span-2 glass-panel p-8 rounded-3xl shadow-2xl border border-white/5 animate-in slide-in-from-left duration-700">
          <h2 className="text-xl font-black text-white mb-8 border-b border-white/10 pb-4 flex items-center gap-3">
             <Fingerprint size={24} className="text-blue-400"/>
             Identity Profile
          </h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Full Legal Name</label>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold" 
                placeholder="Enter Full Name..."
                required disabled={isScanning}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Entity Roll ID</label>
              <input
                type="text" value={rollNo} onChange={(e) => setRollNo(e.target.value)}
                className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono font-black" 
                placeholder="REG-000X"
                required disabled={isScanning}
              />
            </div>

            <button
              type="submit"
              disabled={isScanning || !backendOnline || !name.trim() || !rollNo.trim()}
              className="group relative w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:shadow-[0_0_50px_rgba(37,99,235,0.5)] disabled:bg-gray-800 disabled:shadow-none overflow-hidden active:scale-95"
            >
              <div className="absolute inset-0 w-1/4 h-full bg-white/10 -skew-x-12 -translate-x-full group-hover:translate-x-[400%] transition-transform duration-1000"></div>
              {isScanning ? (
                <div className="flex items-center justify-center gap-3">
                  <Loader2 size={18} className="animate-spin text-white"/> 
                  <span>AI Scanning...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <ScanFace size={20}/> 
                  <span>Start Biometric Scan</span>
                </div>
              )}
            </button>

            {!backendOnline && (
              <div className="p-4 bg-orange-600/10 border border-orange-500/20 text-orange-400 text-[10px] font-black uppercase tracking-tighter rounded-xl flex items-center justify-center gap-2 animate-pulse">
                <AlertCircle size={14}/> SYSTEM KERNEL OFFLINE - CHECK BACKEND
              </div>
            )}
          </form>

          {resultMsg && (
            <div className={`mt-8 p-5 rounded-2xl font-bold text-sm text-center border animate-in zoom-in duration-300 ${
              resultMsg.type === 'success' ? 'bg-green-600/10 text-green-400 border-green-500/20' : 'bg-red-600/10 text-red-400 border-red-500/20'
            }`}>
              {resultMsg.text}
            </div>
          )}
        </div>

        {/* ===== CAMERA PANEL ===== */}
        <div className="lg:col-span-3 glass-panel p-2 rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden animate-in slide-in-from-right duration-700">
          <div className="relative h-full min-h-[500px] bg-black rounded-[2rem] overflow-hidden group shadow-inner border border-white/5">
            {backendOnline ? (
              <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                 <img src="/api/video" alt="AI Scan" className="w-full h-full object-cover" />
                 <div className="absolute inset-0 bg-blue-600/5 pointer-events-none mix-blend-overlay"></div>
                 {/* Decorative scanning animation overlay */}
                 {isScanning && (
                   <>
                     <div className="absolute top-0 left-0 w-full h-[2px] bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,1)] animate-scan z-20"></div>
                     <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none z-10 scale-105"></div>
                   </>
                 )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-900/50">
                <div className="p-6 bg-white/5 rounded-full mb-6 border border-white/5"><Camera size={64} className="text-gray-700"/></div>
                <p className="text-gray-500 uppercase font-black tracking-widest text-sm">Vision System Offline</p>
              </div>
            )}

            {isScanning && (
              <div className="absolute bottom-8 left-8 right-8 bg-black/60 backdrop-blur-3xl border border-white/10 px-8 py-6 rounded-3xl z-30 shadow-2xl animate-in slide-in-from-bottom duration-500">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                     <span className="px-3 py-1 bg-blue-600 text-white text-[9px] font-black uppercase rounded-full shadow-lg">{phase || 'DETECTING'}</span>
                     <p className="text-white font-black text-sm uppercase tracking-tight">{instruction || 'Initializing AI...'}</p>
                  </div>
                  <span className="text-blue-400 font-mono text-lg font-black">{sampleCount} <span className="text-[10px] text-gray-500">/ {sampleTarget}</span></span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5 p-[1px]">
                  <div className="bg-gradient-to-r from-blue-600 to-purple-600 h-full rounded-full transition-all duration-500 shadow-[0_0_15px_rgba(37,99,235,0.5)]" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {/* Corner decorations */}
            <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-white/20 rounded-tl-xl transition-all group-hover:border-blue-500 group-hover:w-12 group-hover:h-12"></div>
            <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-white/20 rounded-tr-xl transition-all group-hover:border-blue-500 group-hover:w-12 group-hover:h-12"></div>
            <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-white/20 rounded-bl-xl transition-all group-hover:border-blue-500 group-hover:w-12 group-hover:h-12"></div>
            <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-white/20 rounded-br-xl transition-all group-hover:border-blue-500 group-hover:w-12 group-hover:h-12"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
