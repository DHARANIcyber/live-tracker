import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../apiConfig';

const LoginPage = () => {
  const [role, setRole] = useState('driver');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    setIdentifier('');
    setPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const credentials = role === 'driver'
        ? { role, phoneNumber: identifier, password }
        : { role, email: identifier, password };
      const res = await axios.post(`${API_BASE_URL}/login`, credentials);
      localStorage.setItem('auth_user', JSON.stringify(res.data));
      window.dispatchEvent(new Event('auth-session-changed'));
      if (res.data.role === 'admin') navigate('/admin');
      if (res.data.role === 'driver') navigate('/driver');
      if (res.data.role === 'student') navigate('/student');
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Login failed');
    }
  };

  return (
    <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
      <h2 className="text-3xl font-semibold">Login Portal</h2>
      <p className="mt-2 text-slate-600">Choose your role to access the relevant dashboard.</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Select Role</label>
          <select
            value={role}
            onChange={(e) => handleRoleChange(e.target.value)}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-100"
          >
            <option value="driver">Driver</option>
            <option value="admin">Admin</option>
            <option value="student">Student</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{role === 'driver' ? 'Phone Number' : 'Email Address'}</label>
          <input
            type={role === 'driver' ? 'tel' : 'email'}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-100"
            placeholder={role === 'driver' ? 'Phone number (country code optional)' : 'Enter your email address'}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 pr-12 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-100"
              placeholder="Password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none"
              title={showPassword ? 'Hide password' : 'Show password'}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <button className="w-full rounded-2xl bg-cyan-700 px-4 py-3 font-semibold text-white shadow-md transition hover:bg-cyan-800">
          Sign In
        </button>
      </form>
    </div>
  );
};

export default LoginPage;
