import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../apiConfig';
import BusLiveMap from '../components/BusLiveMap';

const readStoredDriver = () => {
  try {
    return JSON.parse(localStorage.getItem('auth_user') || 'null');
  } catch (error) {
    return null;
  }
};

const DriverDashboard = ({ active = true }) => {
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState(readStoredDriver);
  const [selectedBusId, setSelectedBusId] = useState(() => readStoredDriver()?.assignedBus?.busNumber || '');
  const [currentBus, setCurrentBus] = useState(null);

  const [tripStarted, setTripStarted] = useState(false);
  const [tracking, setTracking] = useState(false);

  const [status, setStatus] = useState('Ready to start');
  const [statusType, setStatusType] = useState('idle');
  const [location, setLocation] = useState(null);
  const [liveMessage, setLiveMessage] = useState('Click "Start Trip" to begin tracking your live location.');
  const [pingsSent, setPingsSent] = useState(0);
  const [lastPingTime, setLastPingTime] = useState(null);
  const [permissionError, setPermissionError] = useState(null);

  const watchIdRef = useRef(null);
  const gpsPollRef = useRef(null);
  const tripActiveRef = useRef(false);

  // Load the bus assigned to the authenticated driver.
  useEffect(() => {
    if (!active) return undefined;

    const storedAuthUser = readStoredDriver();
    setAuthUser(storedAuthUser);
    if (storedAuthUser?.role !== 'driver' || !storedAuthUser.token) {
      navigate('/login', { replace: true });
      return undefined;
    }

    const busNumber = storedAuthUser.assignedBus?.busNumber;
    if (!busNumber) {
      setStatus('No bus assigned');
      setStatusType('error');
      setLiveMessage('Contact the transport administrator to assign a bus to your account.');
      return;
    }

    setSelectedBusId(busNumber);
    const fetchAssignedBus = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/bus/${encodeURIComponent(busNumber)}`);
        setCurrentBus(res.data);
      } catch (err) {
        setStatus('Bus unavailable');
        setStatusType('error');
        setLiveMessage(err.response?.data?.message || 'Could not load your assigned bus.');
      }
    };
    fetchAssignedBus();
  }, [active, navigate]);

  const reportOffline = useCallback(async () => {
    if (!authUser?.token) return;
    try {
      await axios.post(`${API_BASE_URL}/api/gps/offline`, {}, {
        headers: { Authorization: `Bearer ${authUser.token}` }
      });
    } catch (error) {
      console.warn('Could not mark the bus offline; it will expire after the GPS timeout.', error.message);
    }
  }, [authUser]);

  const sendGpsUpdate = useCallback(async ({ latitude, longitude, accuracy }) => {
    if (!authUser?.token) throw new Error('Please log in again to send GPS updates.');
    const res = await axios.post(`${API_BASE_URL}/api/gps/update`, { latitude, longitude, accuracy }, {
      headers: { Authorization: `Bearer ${authUser.token}` }
    });
    if (res.data?.data?.status !== 'ONLINE') throw new Error('The server did not accept this location update.');
      setPingsSent((prev) => prev + 1);
      setLastPingTime(new Date().toLocaleTimeString());
      setLiveMessage('Live location sent successfully.');
  }, [authUser]);

  const handleGeoError = useCallback((error) => {
    if (!tripActiveRef.current) return;

    const messages = {
      1: 'Unable to access GPS. Please enable location permission.',
      2: 'GPS location is unavailable. Check your device location services.',
      3: 'GPS request timed out. Check your signal and try again.'
    };
    const message = messages[error.code] || 'Unable to access GPS on this device.';
    setPermissionError(message);

    if (error.code === 2 || error.code === 3) {
      setStatus(error.code === 3 ? 'Waiting for GPS signal' : 'GPS temporarily unavailable');
      setStatusType('tracking');
      setLiveMessage(`${message} Trip remains active; retrying automatically.`);
      return;
    }

    setStatus('GPS unavailable');
    setStatusType('error');
    setLiveMessage(message);
    tripActiveRef.current = false;
    setTracking(false);
    setTripStarted(false);
    reportOffline();
  }, [reportOffline]);

  const processPosition = useCallback(async (position) => {
    if (!tripActiveRef.current) return;
    const nextLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp
    };
    setLocation(nextLocation);
    setPermissionError(null);
    setStatus('GPS online');
    setStatusType('tracking');
    try {
      await sendGpsUpdate(nextLocation);
    } catch (error) {
      if (!tripActiveRef.current) return;
      setStatus('GPS update failed');
      setStatusType('error');
      setLiveMessage('Network or server error. GPS will show offline until an update is received.');
      reportOffline();
    }
  }, [sendGpsUpdate, reportOffline]);

  const requestQuickPosition = useCallback(() => {
    if (!navigator.geolocation) {
      handleGeoError({ code: 0 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (tripActiveRef.current) processPosition(position);
      },
      handleGeoError,
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 10000 }
    );
  }, [handleGeoError, processPosition]);

  useEffect(() => {
    if (!tripStarted || !tracking) return undefined;
    if (!navigator.geolocation) {
      handleGeoError({ code: 0 });
      return undefined;
    }

    setLiveMessage('Waiting for an actual GPS position from this device...');
    let isMounted = true;
    let positionRequestPending = false;
    const locationOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 };
    const onPosition = (position) => {
      if (!isMounted) return;
      processPosition(position);
    };
    const requestFreshPosition = (options = locationOptions) => {
      if (positionRequestPending || !isMounted) return;
      positionRequestPending = true;
      navigator.geolocation.getCurrentPosition((position) => {
        positionRequestPending = false;
        onPosition(position);
      }, (error) => {
        positionRequestPending = false;
        handleGeoError(error);
      }, options);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(onPosition, handleGeoError, locationOptions);
    gpsPollRef.current = setInterval(requestFreshPosition, 3000);

    return () => {
      isMounted = false;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (gpsPollRef.current !== null) {
        clearInterval(gpsPollRef.current);
        gpsPollRef.current = null;
      }
    };
  }, [tripStarted, tracking, handleGeoError, processPosition]);

  // Trip Start/Stop handler
  const handleToggleTrip = async () => {
    if (!tripStarted) {
      if (!currentBus || !authUser?.token) {
        setStatus('Bus assignment unavailable');
        setStatusType('error');
        return;
      }
      tripActiveRef.current = true;
      setTripStarted(true);
      setTracking(true);
      setPermissionError(null);
      setStatus('Requesting location permission');
      setStatusType('tracking');
      setLiveMessage('Allow location access if your browser asks. GPS tracking is starting.');
      requestQuickPosition();
    } else {
      tripActiveRef.current = false;
      setTripStarted(false);
      setTracking(false);
      setStatus('OFFLINE');
      setStatusType('idle');
      setLiveMessage('Trip ended. Live location is no longer being shared.');
      await reportOffline();
    }
  };

  const handleToggleGps = async () => {
    if (!tracking) {
      tripActiveRef.current = true;
      setTripStarted(true);
      setTracking(true);
      setPermissionError(null);
      setStatus('Requesting GPS permission');
      setStatusType('tracking');
      setLiveMessage('Allow location access when your browser asks.');
      requestQuickPosition();
    } else {
      tripActiveRef.current = false;
      setTracking(false);
      setTripStarted(false);
      setStatus('OFFLINE');
      setStatusType('idle');
      setLiveMessage('GPS is off. Live location is no longer being shared.');
      await reportOffline();
    }
  };

  const handleLogout = async () => {
    tripActiveRef.current = false;
    setTracking(false);
    setTripStarted(false);
    await reportOffline();
    localStorage.removeItem('auth_user');
    window.dispatchEvent(new Event('auth-session-changed'));
    setAuthUser(null);
    navigate('/login', { replace: true });
  };

  const retryGps = () => {
    tripActiveRef.current = true;
    setPermissionError(null);
    setTripStarted(true);
    setTracking(true);
    setStatus('Requesting GPS permission');
    setStatusType('tracking');
    requestQuickPosition();
  };

  return (
    <div className={active ? 'space-y-6' : 'hidden'}>
      {/* Top Banner / Header */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                {tripStarted ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-400"></span>
                )}
              </span>
              <h2 className="text-2xl font-bold text-slate-800">Driver Console & Live GPS</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Transmit your real-time bus location to students, parents, and campus transport managers.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900 shadow-sm">
              Assigned bus: <span className="font-bold">{selectedBusId || 'Not assigned'}</span>
            </div>
            <button onClick={handleLogout} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Log out
            </button>
          </div>
        </div>

        {/* Permission warning banner if geolocation is blocked */}
        {permissionError && (
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">📍 Location Notice:</p>
                <p className="mt-1 text-sm text-amber-800">{permissionError}</p>
                <p className="mt-2 text-xs text-amber-700">
                  {statusType === 'tracking'
                    ? 'Trip stays active. GPS will retry automatically and resume sharing when a fix returns.'
                    : 'Enable location permission, then retry GPS tracking.'}
                </p>
              </div>
              {statusType === 'error' && (
                <button
                  onClick={retryGps}
                  className="whitespace-nowrap rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700"
                >
                  Retry GPS
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left Column: Trip Controls and Live Telemetry */}
        <div className="space-y-6">
          {/* Main Action Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800">Trip Operations</h3>
            <p className="mt-1 text-sm text-slate-500">
              {tripStarted
                ? location ? 'Your current GPS position is being shared.' : 'Waiting for a valid GPS position from your device.'
                : 'Click Start Trip when departing from the terminal.'}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                onClick={handleToggleTrip}
                className={`flex items-center justify-center gap-2 rounded-2xl px-5 py-4 font-bold text-white shadow-md transition-all active:scale-[0.98] ${
                  tripStarted
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  {tripStarted ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  )}
                </svg>
                {tripStarted ? 'End Trip' : 'Start Trip & GPS'}
              </button>

              <button
                onClick={handleToggleGps}
                className={`flex items-center justify-center gap-2 rounded-2xl border px-5 py-4 font-semibold transition active:scale-[0.98] ${
                  tracking
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${tracking ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                {tracking ? 'GPS Broadcast: ON' : 'GPS Broadcast: OFF'}
              </button>
            </div>

            {/* Live Telemetry Card */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-cyan-50/40 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Live Status</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    statusType === 'tracking'
                      ? 'bg-emerald-100 text-emerald-800'
                      : statusType === 'error'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {status}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-3 shadow-sm border border-slate-100">
                  <p className="text-xs text-slate-400">Updates Sent</p>
                  <p className="mt-1 text-sm font-bold text-cyan-700">{pingsSent} pings</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <p className="truncate font-medium text-cyan-800">{liveMessage}</p>
                {lastPingTime && <span className="whitespace-nowrap text-slate-400">Last: {lastPingTime}</span>}
              </div>
            </div>
          </div>

          {/* Assigned Bus Details */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Assigned Bus Details</h3>
              <span className="rounded-full bg-cyan-100 px-3 py-0.5 text-xs font-bold text-cyan-800">
                {currentBus?.busNumber || selectedBusId}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-slate-600">
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="text-xs text-slate-400">Route:</span>
                <p className="font-semibold text-slate-800">{currentBus?.route || 'Route 1'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="text-xs text-slate-400">Driver Phone:</span>
                <p className="font-semibold text-slate-800">{currentBus?.driverPhone || '+91 96593 96462'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="text-xs text-slate-400">Origin → Destination:</span>
                <p className="font-semibold text-slate-800">
                  {currentBus?.startingPoint || 'Main Gate'} → {currentBus?.destination || 'Hostel Block'}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="text-xs text-slate-400">Scheduled Departure:</span>
                <p className="font-semibold text-slate-800">{currentBus?.timing || '07:30 AM'}</p>
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: Live Map */}
        <div className="space-y-6">
          {/* Live Map Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-800">Live Driver Map</h3>
            </div>

            <div className="h-80 overflow-hidden rounded-2xl border border-slate-200 shadow-inner">
              <BusLiveMap
                busNumber={selectedBusId}
                online={Boolean(location && tracking)}
                location={location}
              />
            </div>

            <p className="mt-3 text-center text-xs text-slate-400">
              Map updates automatically as the bus moves.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverDashboard;
