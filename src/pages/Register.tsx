import React, { useState, useRef, useEffect } from 'react';
import { Camera, Save, ScanFace, Upload, Image as ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { saveStudent, getStudents } from '../utils/storage';

export default function Register() {
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let detectionTimeout: NodeJS.Timeout;
    
    // Pure browser camera feed
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            
            // Simulation: face detection taking a moment
            detectionTimeout = setTimeout(() => {
              setFaceDetected(true);
            }, 2000);
          }
        })
        .catch(err => {
          console.error("Error accessing camera:", err);
          setFaceDetected(false);
        });
    }
    
    return () => {
      clearTimeout(detectionTimeout);
      if (videoRef.current && videoRef.current.srcObject) {
         (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const imageUrl = URL.createObjectURL(e.target.files[0]);
      setPhotoPreview(imageUrl);
      setFaceDetected(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!faceDetected) {
      alert("Wait for face detection...");
      return;
    }
    
    setIsScanning(true);
    setScanProgress(0);

    // Simulation of AI processing
    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            const newStudent = {
              id: rollNo,
              name: name,
              registered_date: new Date().toISOString()
            };
            
            // SAVE TO LOCALSTORAGE
            saveStudent(newStudent);
            
            setIsScanning(false);
            alert(`🎉 ${name} successfully registered!`);
            setName('');
            setRollNo('');
            setPhotoPreview(null);
            setFaceDetected(false);
            setTimeout(() => setFaceDetected(true), 2000);
          }, 500);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  return (
    <div className="max-w-5xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Register New Student</h1>
        <p className="text-gray-600">Pure Local Storage Mode - No Server Required.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 border p-6 bg-white rounded-lg shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Details</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Student Photo</label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden border">
                  {photoPreview ? <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" /> : <ImageIcon className="text-gray-400" size={24} />}
                </div>
                <label className="cursor-pointer px-3 py-1 bg-white border rounded text-xs font-medium hover:bg-gray-50">
                  <Upload size={14} className="inline mr-1"/> Upload
                  <input type="file" className="hidden" onChange={handlePhotoChange} disabled={isScanning} />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="John Doe" required disabled={isScanning} />
            </div>
            <div>
              <label className="block text-sm font-medium">Roll No / ID</label>
              <input type="text" value={rollNo} onChange={(e) => setRollNo(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="CS001" required disabled={isScanning} />
            </div>

            <button type="submit" disabled={isScanning || !faceDetected} className="w-full bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400">
               <Save size={18} className="inline mr-2"/> {isScanning ? `Processing ${scanProgress}%` : 'Register Student'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 bg-gray-900 rounded-lg overflow-hidden relative min-h-[400px] flex items-center justify-center">
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-80" />
            
            <div className={`absolute border-4 rounded-lg pointer-events-none transition-all ${isScanning ? 'border-green-500 w-52 h-64' : (faceDetected ? 'border-blue-400 w-48 h-56' : 'border-dashed border-gray-600 w-40 h-48')}`}>
               {isScanning && <div className="absolute top-0 left-0 right-0 h-1 bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.8)] animate-scan"></div>}
            </div>

            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-sm font-bold bg-black/60 text-white flex items-center gap-2">
              {faceDetected ? <><CheckCircle2 size={16} className="text-blue-400"/> Ready to scan</> : <><ScanFace size={16} className="animate-pulse"/> Detecting face...</>}
            </div>
        </div>
      </div>
    </div>
  );
}
