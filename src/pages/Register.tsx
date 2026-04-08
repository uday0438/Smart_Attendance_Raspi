import React, { useState, useEffect, useRef } from 'react';
import { Save, ScanFace, CheckCircle2, AlertCircle, Camera, Loader2 } from 'lucide-react';
import { saveStudent } from '../utils/storage';

export default function Register() {
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [sampleTarget, setSampleTarget] = useState(50);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check backend availability on mount
  useEffect(() => {
    fetch('/api/stats')
      .then(res => { if (res.ok) setBackendOnline(true); })
      .catch(() => setBackendOnline(false));
  }, []);

  // Poll registration progress while scanning
  useEffect(() => {
    if (isScanning) {
      pollRef.current = setInterval(() => {
        fetch('/api/register/status')
          .then(res => res.json())
          .then(data => {
            setSampleCount(data.samples || 0);
            setSampleTarget(data.target || 50);
          })
          .catch(() => {});
      }, 300); // poll every 300ms
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
        // Also save to localStorage for local dashboard sync
        saveStudent({ id: rollNo, name: name, registered_date: new Date().toISOString() });
        setResultMsg({ type: 'success', text: data.message });
        setName('');
        setRollNo('');
      } else {
        setResultMsg({ type: 'error', text: data.message });
      }
    } catch (err) {
      setResultMsg({ type: 'error', text: 'Backend connection failed. Is app.py running?' });
    } finally {
      setIsScanning(false);
    }
  };

  const progress = sampleTarget > 0 ? Math.min((sampleCount / sampleTarget) * 100, 100) : 0;

  return (
    <div className="max-w-5xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Register New Student</h1>
        <p className="text-gray-600">
          AI captures <strong>50 face samples</strong> in 10 seconds for maximum recognition accuracy.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ===== FORM PANEL ===== */}
        <div className="lg:col-span-1 border p-6 bg-white rounded-lg shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Student Details</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Full Name</label>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border rounded" placeholder="John Doe"
                required disabled={isScanning}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Roll No / ID</label>
              <input
                type="text" value={rollNo} onChange={(e) => setRollNo(e.target.value)}
                className="w-full px-3 py-2 border rounded" placeholder="CS001"
                required disabled={isScanning}
              />
            </div>

            <button
              type="submit"
              disabled={isScanning || !backendOnline || !name.trim() || !rollNo.trim()}
              className="w-full bg-blue-600 text-white py-2.5 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
            >
              {isScanning ? (
                <><Loader2 size={18} className="animate-spin"/> Capturing Samples...</>
              ) : (
                <><Save size={18}/> Register Student</>
              )}
            </button>

            {!backendOnline && (
              <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded flex items-center gap-1.5">
                <AlertCircle size={14}/> Backend offline. Start app.py first.
              </p>
            )}
          </form>

          {/* Result message */}
          {resultMsg && (
            <div className={`mt-4 p-3 rounded text-sm font-medium flex items-start gap-2 ${
              resultMsg.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {resultMsg.type === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> : <AlertCircle size={16} className="mt-0.5 shrink-0"/>}
              {resultMsg.text}
            </div>
          )}
        </div>

        {/* ===== CAMERA PANEL ===== */}
        <div className="lg:col-span-2 bg-gray-900 rounded-lg overflow-hidden relative min-h-[450px] flex flex-col">
          {/* Camera feed from backend */}
          <div className="flex-1 relative flex items-center justify-center">
            {backendOnline ? (
              <img
                src="/api/video"
                alt="AI Camera Feed"
                className="absolute inset-0 w-full h-full object-contain bg-black"
              />
            ) : (
              <div className="text-center p-8">
                <Camera size={48} className="text-gray-600 mx-auto mb-3"/>
                <p className="text-gray-400 text-sm">Start the Python backend to enable the camera</p>
              </div>
            )}

            {/* Scanning overlay */}
            {isScanning && (
              <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center z-10">
                <div className="bg-black/70 backdrop-blur-sm rounded-xl px-8 py-6 text-center max-w-xs">
                  <div className="mb-3">
                    <ScanFace size={48} className="text-green-400 mx-auto animate-pulse"/>
                  </div>
                  <p className="text-white font-bold text-lg mb-1">Scanning Face</p>
                  <p className="text-gray-300 text-sm mb-4">
                    Hold still and look at the camera
                  </p>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-700 rounded-full h-3 mb-2 overflow-hidden">
                    <div
                      className="bg-green-500 h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-green-400 font-mono text-sm font-bold">
                    {sampleCount} / {sampleTarget} samples
                  </p>
                </div>
              </div>
            )}

            {/* Status badge */}
            {!isScanning && backendOnline && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-sm font-bold bg-black/60 text-white flex items-center gap-2 z-10">
                <CheckCircle2 size={16} className="text-green-400"/>
                Ready — Enter details and click Register
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
