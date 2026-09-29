import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import BusLiveMap from '../components/BusLiveMap';
import { API_BASE_URL } from '../apiConfig';

const normalizeBusNumber = (value) => String(value || '').trim().toUpperCase();

const TrackingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const busQueryParam = normalizeBusNumber(searchParams.get('bus') || 'SVG-001');

  const [buses, setBuses] = useState([]);
  const [selectedBusNumber, setSelectedBusNumber] = useState(busQueryParam);
  const [bus, setBus] = useState(null);
  const [location, setLocation] = useState(null);
  const [online, setOnline] = useState(false);
  const [status, setStatus] = useState('Checking bus location...');
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    if (busQueryParam && busQueryParam !== selectedBusNumber) {
      setSelectedBusNumber(busQueryParam);
    }
  }, [busQueryParam, selectedBusNumber]);

  // Load all buses list for quick selection
  useEffect(() => {
    const fetchBuses = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/buses`);
        const list = Array.isArray(res.data) ? res.data : [];
        setBuses(list);
      } catch (err) {
        console.warn('Could not fetch buses list:', err.message);
      }
    };
    fetchBuses();
  }, []);

  // Fetch selected bus, status, and realtime updates.
  useEffect(() => {
    let isMounted = true;
    const socket = io(API_BASE_URL, { transports: ['websocket', 'polling'] });
    socket.emit('joinBus', selectedBusNumber);

    const refreshBusState = async () => {
      try {
        const [busResponse, statusResponse] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/bus/${encodeURIComponent(selectedBusNumber)}`),
          axios.get(`${API_BASE_URL}/api/gps/status/${encodeURIComponent(selectedBusNumber)}`)
        ]);
        if (!isMounted) return;

        const busData = busResponse.data;
        const busOnline = Boolean(statusResponse.data?.online);
        setBus(busData);
        setOnline(busOnline);
        setLocation(busOnline ? statusResponse.data.location : null);
        setStatus(busOnline ? 'ONLINE' : 'OFFLINE');
        setError('');
        setLastUpdate(busOnline && statusResponse.data.lastUpdated
          ? new Date(statusResponse.data.lastUpdated).toLocaleTimeString()
          : null);
      } catch (error) {
        if (!isMounted) return;
        setBus(null);
        setOnline(false);
        setLocation(null);
        setStatus('OFFLINE');
        if (error.response?.status === 404) {
          setError(`Bus ${selectedBusNumber} was not found.`);
        } else {
          setError('Unable to check this bus right now. Please check your connection.');
        }
      }
    };

    const onGpsUpdate = (payload) => {
      if (!isMounted || normalizeBusNumber(payload.busNumber) !== selectedBusNumber) return;
      const nextLocation = { latitude: payload.latitude, longitude: payload.longitude };
      setLocation(nextLocation);
      setOnline(true);
      setStatus('ONLINE');
      setLastUpdate(new Date(payload.timestamp).toLocaleTimeString());
      setBus((currentBus) => currentBus ? {
        ...currentBus,
        currentLocation: nextLocation,
        online: true,
        status: 'ONLINE'
      } : currentBus);
    };

    const onGpsStatus = (payload) => {
      if (!isMounted || normalizeBusNumber(payload.busNumber) !== selectedBusNumber) return;
      const busOnline = payload.status === 'ONLINE';
      setOnline(busOnline);
      setStatus(busOnline ? 'ONLINE' : 'OFFLINE');
      if (!busOnline) {
        setLocation(null);
        setLastUpdate(null);
        setBus((currentBus) => currentBus ? { ...currentBus, currentLocation: null, online: false, status: 'OFFLINE' } : currentBus);
      }
    };

    socket.on('gpsUpdate', onGpsUpdate);
    socket.on('gpsStatus', onGpsStatus);
    refreshBusState();
    const statusInterval = setInterval(refreshBusState, 5000);

    return () => {
      isMounted = false;
      clearInterval(statusInterval);
      socket.disconnect();
    };
  }, [selectedBusNumber]);

  const handleBusChange = (newBusNumber) => {
    setSelectedBusNumber(newBusNumber);
    setSearchParams({ bus: normalizeBusNumber(newBusNumber) });
    setBus(null);
    setOnline(false);
    setLocation(null);
    setStatus('Checking bus location...');
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                {online ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                )}
              </span>
              <h2 className="text-2xl font-bold text-slate-800">Live Campus Bus Tracking</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {error || (online ? 'Live location from the assigned driver.' : `${selectedBusNumber} is currently offline. Live location is unavailable.`)}
            </p>
          </div>

          {/* Bus Selector */}
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 pl-2">Track Bus:</label>
            <select
              value={selectedBusNumber}
              onChange={(e) => handleBusChange(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-cyan-600 focus:outline-none"
            >
              {buses.length > 0 ? (
                buses.map((b) => (
                  <option key={b._id || b.busNumber} value={b.busNumber}>
                    {b.busNumber} ({b.route || 'Route'})
                  </option>
                ))
              ) : (
                <option value="SVG-001">SVG-001</option>
              )}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Map View */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {status}
              </span>
              {online && (
                <span className="text-xs font-semibold text-emerald-600 animate-pulse">
                  ● Live Streaming
                </span>
              )}
            </div>
            {lastUpdate && (
              <span className="text-xs text-slate-400">
                Updated: {lastUpdate}
              </span>
            )}
          </div>

          <div className="h-[440px] overflow-hidden rounded-2xl border border-slate-200 shadow-inner">
            <BusLiveMap busNumber={bus?.busNumber || selectedBusNumber} online={online} location={location} />
          </div>

            <p className="mt-3 text-center text-xs text-slate-400">Map updates automatically when the driver sends a new GPS position.</p>
        </div>

        {/* Telemetry and Bus Details */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">{bus?.busNumber || selectedBusNumber}</h3>
              <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-800">
                {bus?.route || 'Route unavailable'}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoCard label="Status" value={status} highlight />
              <InfoCard label="Driver" value={bus?.driverName || 'Unavailable'} />
              <InfoCard label="Driver Phone" value={bus?.driverPhone || 'Unavailable'} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800">Route Details</h3>
            <p className="mt-2 text-sm text-slate-600">
              Origin: <strong>{bus?.startingPoint || 'Unavailable'}</strong> → Destination: <strong>{bus?.destination || 'Unavailable'}</strong>
            </p>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 border border-slate-100">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Scheduled Departure:</span>
                <span className="font-bold text-slate-700">{bus?.timing || 'Unavailable'}</span>
              </div>
            </div>

            {/* Quick Link to Driver Console */}
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">Are you driving this bus?</span>
              <Link
                to="/driver"
                className="text-xs font-bold text-cyan-700 hover:text-cyan-800 underline decoration-cyan-300 underline-offset-2"
              >
                Go to Driver Console →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const InfoCard = ({ label, value, highlight = false }) => (
  <div className={`rounded-2xl p-3.5 border ${highlight ? 'bg-cyan-50/60 border-cyan-100' : 'bg-slate-50 border-slate-100'}`}>
    <p className="text-xs font-semibold text-slate-400">{label}</p>
    <p className={`mt-1 font-bold ${highlight ? 'text-cyan-800' : 'text-slate-700'}`}>{value}</p>
  </div>
);

export default TrackingPage;
