import React, { useState } from 'react';
import { Lock, User, Monitor, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

interface LoginProps {
  onLogin: (user: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      if (username === 'uday' && (password === 'music' || password === 'music ')) {
        onLogin(username);
      } else {
        setError('Invalid credentials. Access Denied.');
        setLoading(false);
      }
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[#020617]">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full animate-pulse" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 glass-panel border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-[0_0_30px_rgba(37,99,235,0.4)] mb-6">
            <Monitor size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter uppercase mb-2">ClassLens</h1>
          <p className="text-gray-400 font-medium tracking-tight">Enterprise Attendance Intelligence</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Identity</label>
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={20} />
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium"
                placeholder="Operator ID"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Access Key</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={20} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium"
                placeholder="Secret Credentials"
                required
              />
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-3"
            >
              <ShieldCheck size={18} />
              {error}
            </motion.div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-600/30 transition-all active:scale-95 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:active:scale-100"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                AUTHENTICATE
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
             <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
             <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase">System Secure</span>
          </div>
          <span className="text-[10px] text-gray-600 font-medium">v4.0.28-Stable</span>
        </div>
      </motion.div>
    </div>
  );
}
