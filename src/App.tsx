import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Register from './pages/Register';
import Timetable from './pages/Timetable';
import { LayoutDashboard, UserPlus, Calendar, Download } from 'lucide-react';

function Navigation() {
  const location = useLocation();
  
  const navItems = [
    { path: '/', label: 'Attendance Dashboard', icon: LayoutDashboard },
    { path: '/register', label: 'Register Student', icon: UserPlus },
    { path: '/timetable', label: 'Timetable Management', icon: Calendar },
  ];

  return (
    <nav className="bg-black/40 backdrop-blur-md border-b border-white/10 text-white shadow-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <div className="text-xl font-bold flex items-center gap-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
              <span className="text-2xl">⚡</span>
              ClassLens
            </div>
            <div className="flex space-x-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      isActive ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-gray-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div>
            <div className="hidden md:block">
               <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold border border-white/10 px-3 py-1.5 rounded-full">System Active</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <Router>
      <div className="min-height-screen">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/register" element={<Register />} />
            <Route path="/timetable" element={<Timetable />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
