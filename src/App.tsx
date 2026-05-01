import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Register from './pages/Register';
import Timetable from './pages/Timetable';
import Login from './pages/Login';
import { LayoutDashboard, UserPlus, Calendar, Moon, Sun, Monitor } from 'lucide-react';

function Navigation() {
  const location = useLocation();
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  
  const navItems = [
    { path: '/', label: 'Command Center', icon: LayoutDashboard },
    { path: '/register', label: 'Enrollment', icon: UserPlus },
    { path: '/timetable', label: 'Sessions', icon: Calendar },
  ];

  return (
    <nav className="glass-panel border-b border-white/10 text-white shadow-2xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center space-x-12">
            <Link to="/" className="text-2xl font-black flex items-center gap-2 group transition-all">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)] group-hover:scale-110 transition-transform">
                <Monitor size={22} className="text-white"/>
              </div>
              <span className={`tracking-tighter uppercase ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>ClassLens</span>
            </Link>
            <div className="hidden md:flex space-x-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black tracking-tight transition-all active:scale-95 ${
                      isActive 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' 
                        : (theme === 'light' ? 'text-gray-500 hover:text-gray-900 hover:bg-gray-100' : 'text-gray-400 hover:text-white hover:bg-white/5')
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-4">
             <button 
                onClick={toggleTheme}
                className={`p-3 rounded-2xl transition-all active:scale-90 border ${
                   theme === 'light' 
                    ? 'bg-gray-100 text-gray-900 border-gray-200' 
                    : 'bg-white/5 text-blue-400 border-white/5 shadow-inner'
                }`}
             >
                {theme === 'dark' ? <Sun size={20}/> : <Moon size={20}/>}
             </button>
             <div className="hidden md:block">
                <span className={`text-[10px] uppercase font-black tracking-[0.2em] border px-4 py-2 rounded-full ${
                  theme === 'light' ? 'border-gray-200 text-gray-500' : 'border-white/5 text-gray-500'
                }`}>AI KERNEL ACTIVE</span>
             </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('isAuth') === 'true');

  const handleLogin = (user: string) => {
    setIsAuthenticated(true);
    localStorage.setItem('isAuth', 'true');
    localStorage.setItem('operator', user);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <div className="min-h-screen">
        <Navigation />
        <main className="max-w-7xl mx-auto px-6 py-10">
          <Routes>
            <Route path="/" element={<Dashboard theme={localStorage.getItem('theme') || 'dark'} />} />
            <Route path="/register" element={<Register />} />
            <Route path="/timetable" element={<Timetable />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
