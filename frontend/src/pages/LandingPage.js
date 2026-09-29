import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  const [summary] = useState({ totalBuses: 12, totalStudents: 320, activeBuses: 6, completedTrips: 84 });
  const [college] = useState({
    collegeName: 'Shree Venkateshwara Group of Institutions',
    phone: '+91 98651 47777',
    email: 'svhecgobi@gmail.com',
    address: 'Otthakkuthirai, Gobichettipalayam, Erode District, Tamil Nadu',
    website: 'https://www.svhec.com/'
  });

  const statCards = useMemo(() => [
    { label: 'Total Buses', value: summary.totalBuses, color: 'from-cyan-500 to-blue-500' },
    { label: 'Total Students', value: summary.totalStudents, color: 'from-violet-500 to-purple-600' },
    { label: 'Active Buses', value: summary.activeBuses, color: 'from-emerald-500 to-green-600' },
    { label: 'Completed Trips', value: summary.completedTrips, color: 'from-amber-500 to-orange-500' }
  ], [summary]);

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-amber-200/70 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-900 p-8 text-white shadow-[0_20px_60px_rgba(15,23,42,0.30)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-100">College Bus Live Tracker</p>
            <h1 className="mt-3 text-4xl font-extrabold">{college.collegeName || 'Shree Venkateshwara Group of Institutions'}</h1>
            <p className="mt-4 max-w-2xl text-sm text-cyan-50">
              Explore campus bus services, route details, and transport updates in one place.
            </p>
            <Link to="/login" className="mt-6 inline-flex rounded-xl bg-cyan-600 px-5 py-3 font-semibold text-white transition hover:bg-cyan-500">
              Login to continue
            </Link>
          </div>
          <div className="rounded-2xl bg-white/15 p-6 backdrop-blur">
            <p className="text-sm">College Contact</p>
            <p className="mt-2 font-semibold">{college.phone || '+91 98651 47777'}</p>
            <p className="text-sm text-cyan-100">{college.email || 'svhecgobi@gmail.com'}</p>
          </div>
        </div>
      </section>

      

      <section className="grid gap-6">
        <div className="rounded-[1.75rem] border border-amber-200/70 bg-white/90 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
          <h2 className="text-2xl font-semibold">About the College</h2>
          <p className="mt-3 text-slate-600">
            {college.collegeName || 'Shree Venkateshwara Group of Institutions'} offers transport services across campus with stop updates and route management for students and parents.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">Address</p>
              <p className="mt-2 text-slate-700">{college.address || 'Otthakkuthirai, Gobichettipalayam, Erode District, Tamil Nadu'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">Website</p>
              <a
                href={college.website || 'https://www.svhec.com/'}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-cyan-700 underline decoration-cyan-300 underline-offset-4 transition hover:text-cyan-900"
              >
                {college.website || 'https://www.svhec.com/'}
              </a>
            </div>
          </div>
        </div>

        
      </section>
    </div>
  );
};

export default LandingPage;
