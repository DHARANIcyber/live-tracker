import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useNavigate } from 'react-router-dom';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const BusSearchPage = lazy(() => import('./pages/BusSearchPage'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const DriverDashboard = lazy(() => import('./pages/DriverDashboard'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));

const readAuthUser = () => {
  try {
    return JSON.parse(localStorage.getItem('auth_user') || 'null');
  } catch (error) {
    return null;
  }
};

function App() {
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState(readAuthUser);
  const homePath = authUser?.role ? `/${authUser.role}` : '/login';

  useEffect(() => {
    const syncAuthUser = () => setAuthUser(readAuthUser());
    window.addEventListener('auth-session-changed', syncAuthUser);
    window.addEventListener('storage', syncAuthUser);
    return () => {
      window.removeEventListener('auth-session-changed', syncAuthUser);
      window.removeEventListener('storage', syncAuthUser);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('auth_user');
    window.dispatchEvent(new Event('auth-session-changed'));
    setAuthUser(null);
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-800">
      <nav className="border-b border-amber-200/70 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950 px-6 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.25)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <Link to="/" className="text-xl font-semibold tracking-wide text-amber-100">College Bus Live Tracker</Link>
          <div className="flex flex-wrap items-center gap-3 text-sm text-amber-50/90">
            <NavLink to="/" className="rounded-full px-3 py-1 transition hover:bg-amber-500/20 hover:text-amber-200">Home</NavLink>
            {authUser ? (
              <>
                <NavLink to="/search" className="rounded-full px-3 py-1 transition hover:bg-amber-500/20 hover:text-amber-200">Search Bus</NavLink>
                <NavLink to={homePath} className="rounded-full px-3 py-1 capitalize transition hover:bg-amber-500/20 hover:text-amber-200">{authUser.role} Dashboard</NavLink>
                <span className="text-amber-100/70">{authUser.email}</span>
                <button type="button" onClick={handleLogout} className="rounded-full px-3 py-1 transition hover:bg-amber-500/20 hover:text-amber-200">Sign out</button>
              </>
            ) : (
              <NavLink to="/login" className="rounded-full px-3 py-1 transition hover:bg-amber-500/20 hover:text-amber-200">Login</NavLink>
            )}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="rounded-3xl border border-amber-200 bg-white/80 p-8 text-center text-slate-600 shadow-sm">Loading page...</div>}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={authUser ? <Navigate to={homePath} replace /> : <LoginPage />} />
            <Route path="/search" element={<BusSearchPage />} />
            <Route path="/tracking" element={<Navigate to="/" replace />} />
            <Route path="/admin" element={authUser?.role === 'admin' ? <AdminDashboard /> : <Navigate to={homePath} replace />} />
            <Route path="/driver" element={authUser?.role === 'driver' ? <DriverDashboard /> : <Navigate to={homePath} replace />} />
            <Route path="/student" element={authUser?.role === 'student' ? <StudentDashboard /> : <Navigate to={homePath} replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default App;
