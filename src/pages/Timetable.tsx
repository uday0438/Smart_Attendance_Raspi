import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Clock, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { getPeriods, savePeriod, deletePeriod, Period } from '../utils/storage';

export default function Timetable() {
  const [periods, setPeriods] = useState<Period[]>(() => getPeriods());
  const [periodName, setPeriodName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Sync state with localStorage every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPeriods(getPeriods());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAddPeriod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodName || !startTime || !endTime) {
      setError("Please fill in all fields.");
      return;
    }

    if (startTime >= endTime) {
      setError("Start time must be before end time.");
      return;
    }

    const newPeriod: Period = {
      period: periodName,
      start_time: startTime,
      end_time: endTime
    };

    savePeriod(newPeriod);
    setPeriods(getPeriods()); // Refresh UI
    
    // Reset form
    setPeriodName('');
    setStartTime('');
    setEndTime('');
    setError(null);
  };

  const handleDelete = (name: string) => {
    if (confirm(`Delete ${name}?`)) {
      deletePeriod(name);
      setPeriods(getPeriods());
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Timetable Management</h1>
        <p className="text-gray-600 italic">Configure class sessions to enable automatic attendance recording.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Form Column */}
        <div className="md:col-span-1 border p-6 bg-white rounded-lg shadow-sm">
          <h2 className="text-lg font-semibold mb-4 border-b flex items-center gap-2"><Plus size={18}/> New Period</h2>
          <form onSubmit={handleAddPeriod} className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Period Name</label>
              <input type="text" value={periodName} onChange={e => setPeriodName(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="e.g. Physics 101" />
            </div>
            <div>
              <label className="block text-sm font-medium">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full px-3 py-2 border rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium">End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full px-3 py-2 border rounded" />
            </div>

            {error && (
              <div className="p-2 bg-red-50 text-red-600 text-xs flex items-center gap-1 rounded"><AlertCircle size={14}/> {error}</div>
            )}

            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700 transition">Add to Timetable</button>
          </form>
        </div>

        {/* List Column */}
        <div className="md:col-span-2">
           <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
             <div className="px-6 py-4 bg-gray-50 font-bold border-b text-gray-800 italic">Active Timetable</div>
             <div className="overflow-x-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-gray-100 border-b">
                   <tr><th className="px-6 py-3 font-medium">Period</th><th className="px-6 py-3 font-medium">Time Slot</th><th className="px-6 py-3 text-right">Delete</th></tr>
                 </thead>
                 <tbody className="divide-y">
                   {periods.map((p, i) => (
                     <tr key={i} className="hover:bg-gray-50">
                       <td className="px-6 py-4 font-extrabold text-blue-900 uppercase tracking-tight">{p.period}</td>
                       <td className="px-6 py-4 text-gray-500 font-mono tracking-widest">{p.start_time} - {p.end_time}</td>
                       <td className="px-6 py-4 text-right">
                         <button onClick={() => handleDelete(p.period)} className="p-1 hover:bg-red-50 text-red-600 rounded"><Trash2 size={16}/></button>
                       </td>
                     </tr>
                   ))}
                   {periods.length === 0 && (
                     <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-500">No periods defined. Add one to enable automatic attendance.</td></tr>
                   )}
                 </tbody>
               </table>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
