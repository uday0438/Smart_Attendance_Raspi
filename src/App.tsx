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
    <nav className="bg-blue-600 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <div className="text-xl font-bold flex items-center gap-2">
              <span className="text-2xl">🎓</span>
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
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive ? 'bg-blue-700 text-white' : 'text-blue-100 hover:bg-blue-500'
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
            <button className="flex items-center gap-2 bg-green-500 hover:bg-green-600 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm">
              <Download size={18} />
              Export Excel
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
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
