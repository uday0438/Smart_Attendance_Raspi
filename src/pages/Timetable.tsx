import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, Trash2, Save, CalendarRange, MapPin, BookOpen } from 'lucide-react';

interface Period {
  period: string;
  start_time: string;
  end_time: string;
}

export default function Timetable() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [newPeriod, setNewPeriod] = useState({ period: '', start_time: '', end_time: '' });

  const fetchTimetable = async () => {
    try {
      const res = await fetch('/api/timetable');
      if (res.ok) {
        const data = await res.json();
        setPeriods(data);
      }
    } catch (err) {
      console.error("Failed to fetch timetable", err);
    }
  };

  useEffect(() => {
    fetchTimetable();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPeriod.period || !newPeriod.start_time || !newPeriod.end_time) return;

    try {
      const res = await fetch('/api/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPeriod),
      });
      if (res.ok) {
        fetchTimetable();
        setNewPeriod({ period: '', start_time: '', end_time: '' });
      }
    } catch (err) {
      alert("Failed to save period");
    }
  };

  const handleDelete = async (periodName: string) => {
    try {
      const res = await fetch(`/api/timetable/${periodName}`, { method: 'DELETE' });
      if (res.ok) fetchTimetable();
    } catch (err) {
      alert("Failed to delete");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 pb-20">
      <div className="mb-10 text-center animate-in fade-in slide-in-from-top duration-1000">
        <div className="inline-flex p-4 bg-purple-600/10 rounded-full mb-4 border border-purple-500/20 shadow-[0_0_30px_rgba(147,51,234,0.1)]">
           <Calendar className="text-purple-400" size={32}/>
        </div>
        <h1 className="text-5xl font-black text-white tracking-tighter uppercase">Session Control</h1>
        <p className="text-gray-500 font-bold uppercase tracking-[0.3em] text-xs mt-3">Temporal Access Management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* ===== ADD PERIOD ===== */}
        <div className="md:col-span-1 glass-panel p-8 rounded-3xl shadow-2xl border border-white/5 animate-in slide-in-from-left duration-700">
          <h2 className="text-xl font-black text-white mb-8 border-b border-white/10 pb-4 flex items-center gap-3">
             <Plus size={24} className="text-purple-400"/>
             New Slot
          </h2>
          <form onSubmit={handleAdd} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Period ID / Name</label>
              <input
                type="text"
                placeholder="Chemistry"
                value={newPeriod.period}
                onChange={(e) => setNewPeriod({ ...newPeriod, period: e.target.value })}
                className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-bold"
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Start Time</label>
                <div className="relative">
                  <Clock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
                  <input
                    type="time"
                    value={newPeriod.start_time}
                    onChange={(e) => setNewPeriod({ ...newPeriod, start_time: e.target.value })}
                    className="w-full pl-10 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-bold"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">End Time</label>
                <div className="relative">
                  <Clock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
                  <input
                    type="time"
                    value={newPeriod.end_time}
                    onChange={(e) => setNewPeriod({ ...newPeriod, end_time: e.target.value })}
                    className="w-full pl-10 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-bold"
                    required
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="group relative w-full bg-purple-600 hover:bg-purple-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(147,51,234,0.3)] hover:shadow-[0_0_50px_rgba(147,51,234,0.5)] active:scale-95 overflow-hidden"
            >
              <div className="absolute inset-0 w-1/4 h-full bg-white/10 -skew-x-12 -translate-x-full group-hover:translate-x-[400%] transition-transform duration-1000"></div>
              <div className="flex items-center justify-center gap-3">
                <Save size={20}/> 
                <span>Save Registry</span>
              </div>
            </button>
          </form>
        </div>

        {/* ===== TIMETABLE LIST ===== */}
        <div className="md:col-span-2 glass-panel p-8 rounded-3xl shadow-2xl border border-white/5 animate-in slide-in-from-right duration-700">
          <h2 className="text-xl font-black text-white mb-8 border-b border-white/10 pb-4 flex items-center justify-between">
             <div className="flex items-center gap-3">
               <CalendarRange size={24} className="text-purple-400"/>
               Active Registry
             </div>
             <span className="text-[10px] bg-white/5 px-3 py-1 rounded-full text-gray-500 font-bold uppercase tracking-widest italic">{periods.length} SLOTS</span>
          </h2>
          
          <div className="space-y-4">
            {periods.length === 0 ? (
              <div className="py-20 text-center flex flex-col items-center">
                 <div className="p-4 bg-white/5 rounded-full mb-4"><CalendarRange size={48} className="text-gray-800"/></div>
                 <p className="text-gray-600 font-bold italic">No sessions registered. Use the panel to the left.</p>
              </div>
            ) : (
              periods.map((p) => (
                <div key={p.period} className="group bg-white/5 hover:bg-white/10 border border-white/5 p-5 rounded-2xl transition-all flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-purple-600/10 rounded-2xl flex items-center justify-center text-purple-400 font-black group-hover:scale-110 transition-transform shadow-inner">
                       <BookOpen size={24}/>
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white uppercase tracking-tight">{p.period}</h3>
                      <div className="flex items-center gap-3 mt-1 underline decoration-purple-500/30 underline-offset-4">
                         <div className="flex items-center gap-1 text-gray-400 text-xs font-bold">
                            <Clock size={12}/> {p.start_time} - {p.end_time}
                         </div>
                         <div className="flex items-center gap-1 text-purple-400 text-[10px] font-black uppercase tracking-widest">
                            <MapPin size={10}/> Gateway-01
                         </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(p.period)}
                    className="p-3 bg-red-600/10 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-xl opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
