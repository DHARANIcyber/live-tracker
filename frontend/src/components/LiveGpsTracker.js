import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';

// Custom pulsating radar GPS marker for Leaflet
const createGpsMarkerIcon = () => {
  return L.divIcon({
    className: 'custom-gps-marker',
    html: `
      <div class="relative flex items-center justify-center w-8 h-8 pointer-events-none">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-4 w-4 bg-blue-600 border-2 border-white shadow-md"></span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const LiveGpsTracker = () => {
  // Coordinates and Telemetry State
  const [coords, setCoords] = useState({ latitude: null, longitude: null, accuracy: null });
  const [gpsStatus, setGpsStatus] = useState('Not Active');
  const [statusColor, setStatusColor] = useState('gray'); // 'gray' | 'yellow' | 'green' | 'red'
  const [errorMessage, setErrorMessage] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [followUser, setFollowUser] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);

  // References
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const watchIdRef = useRef(null);
  const simulationIntervalRef = useRef(null);
  const simStepRef = useRef(0);
  const followUserRef = useRef(followUser);

  // Keep followUserRef in sync
  useEffect(() => {
    followUserRef.current = followUser;
  }, [followUser]);

  // Initialize Leaflet Map once on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center (College campus coordinates or India center fallback)
    const initialCenter = [11.3400, 77.7200];
    const initialZoom = 14;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: true
    });

    // Add OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
    }).addTo(map);

    mapInstanceRef.current = map;

    // Invalidate size to guarantee correct rendering within flex/grid layouts
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update or create map marker and accuracy circle
  const updateMapMarker = useCallback((lat, lng, accuracy) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const latLng = [lat, lng];

    // 1. Update or create current-location marker (avoiding duplicates)
    if (!markerRef.current) {
      markerRef.current = L.marker(latLng, {
        icon: createGpsMarkerIcon(),
        title: 'Your Current Location'
      }).addTo(map);

      markerRef.current.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4;">
          <strong style="color: #1e40af;">📍 Your Current Location</strong><br/>
          <strong>Lat:</strong> ${lat.toFixed(5)}<br/>
          <strong>Lng:</strong> ${lng.toFixed(5)}<br/>
          <strong>Accuracy:</strong> ±${Math.round(accuracy)} meters
        </div>
      `);
    } else {
      markerRef.current.setLatLng(latLng);
      markerRef.current.setPopupContent(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4;">
          <strong style="color: #1e40af;">📍 Your Current Location</strong><br/>
          <strong>Lat:</strong> ${lat.toFixed(5)}<br/>
          <strong>Lng:</strong> ${lng.toFixed(5)}<br/>
          <strong>Accuracy:</strong> ±${Math.round(accuracy)} meters
        </div>
      `);
    }

    // 2. Update or create accuracy circle
    if (accuracy && accuracy > 0) {
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = L.circle(latLng, {
          radius: accuracy,
          color: '#2563eb',
          weight: 1.5,
          fillColor: '#60a5fa',
          fillOpacity: 0.15
        }).addTo(map);
      } else {
        accuracyCircleRef.current.setLatLng(latLng);
        accuracyCircleRef.current.setRadius(accuracy);
      }
    }

    // 3. Keep map centered/follow user if followUser is enabled
    if (followUserRef.current) {
      map.panTo(latLng, { animate: true, duration: 0.6 });
    }
  }, []);

  // Geolocation Success Callback
  const handleLocationSuccess = useCallback((position) => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const acc = position.coords.accuracy || 0;

    setCoords({ latitude: lat, longitude: lng, accuracy: acc });
    setGpsStatus('GPS Active / Tracking');
    setStatusColor('green');
    setErrorMessage(null);
    setIsTracking(true);

    updateMapMarker(lat, lng, acc);
  }, [updateMapMarker]);

  // Geolocation Error Callback (Comprehensive case handling)
  const handleLocationError = useCallback((error) => {
    let message = 'An unexpected location error occurred.';

    switch (error.code) {
      case error.PERMISSION_DENIED:
        // Case 1: Permission denied
        message = 'Location permission was denied. Please allow location access in your browser settings (click the tune/lock icon in your address bar).';
        setGpsStatus('Permission Denied');
        setStatusColor('red');
        break;

      case error.POSITION_UNAVAILABLE:
        // Case 2: Location unavailable / Location services turned off
        message = 'Location information is unavailable. Ensure your device\'s Location Services/GPS are enabled and you have network connectivity.';
        setGpsStatus('Location Unavailable');
        setStatusColor('red');
        break;

      case error.TIMEOUT:
        // Case 3: GPS timeout
        message = 'GPS location request timed out while waiting for satellite/network fix. Retrying...';
        setGpsStatus('Request Timed Out');
        setStatusColor('yellow');
        break;

      default:
        message = error.message || 'Unable to retrieve location.';
        setGpsStatus('Error');
        setStatusColor('red');
        break;
    }

    setErrorMessage(message);
  }, []);

  // Start Live Tracking
  const startTracking = () => {
    // Stop any existing simulation
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
      setIsSimulating(false);
    }

    // Check browser support
    if (!navigator.geolocation) {
      const msg = 'Geolocation is not supported by your current browser.';
      setErrorMessage(msg);
      setGpsStatus('GPS Not Supported');
      setStatusColor('red');
      return;
    }

    // Prevent multiple concurrent watchers
    if (watchIdRef.current !== null) {
      return;
    }

    setErrorMessage(null);
    setGpsStatus('Waiting for GPS permission...');
    setStatusColor('yellow');
    setIsTracking(true);

    // Request initial position first for snappy user feedback
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleLocationSuccess(pos);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { animate: true });
        }
      },
      (err) => {
        // High accuracy might time out on desktop; fallback to standard accuracy
        if (err.code === 3 || err.code === 2) {
          navigator.geolocation.getCurrentPosition(
            handleLocationSuccess,
            handleLocationError,
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
          );
        } else {
          handleLocationError(err);
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );

    // Continuous Live Tracking via watchPosition
    const watchId = navigator.geolocation.watchPosition(
      handleLocationSuccess,
      handleLocationError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 3000
      }
    );

    watchIdRef.current = watchId;
  };

  // Stop Live Tracking
  const stopTracking = () => {
    // 1. Clear geolocation watcher
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // 2. Clear simulation if active
    if (simulationIntervalRef.current !== null) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
      setIsSimulating(false);
    }

    // 3. Update state
    setIsTracking(false);
    setGpsStatus('GPS Off');
    setStatusColor('red');
  };

  // Center Map on User Position ("My Location" button)
  const handleMyLocation = () => {
    if (coords.latitude !== null && coords.longitude !== null && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([coords.latitude, coords.longitude], 16, { animate: true });
      if (markerRef.current) {
        markerRef.current.openPopup();
      }
    } else {
      // If tracking is off, prompt to start tracking
      if (!isTracking) {
        startTracking();
      }
    }
  };

  // Simulation mode for desktop testing without physical GPS movement
  const toggleSimulation = () => {
    if (isSimulating) {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      setIsSimulating(false);
      stopTracking();
      return;
    }

    // Stop real GPS watch if active
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setIsSimulating(true);
    setIsTracking(true);
    setGpsStatus('GPS Active / Tracking (Demo Mode)');
    setStatusColor('green');
    setErrorMessage(null);

    const baseLat = 11.3400;
    const baseLng = 77.7200;
    const waypoints = [
      { lat: baseLat, lng: baseLng, acc: 6 },
      { lat: baseLat + 0.0018, lng: baseLng + 0.0012, acc: 8 },
      { lat: baseLat + 0.0035, lng: baseLng + 0.0028, acc: 10 },
      { lat: baseLat + 0.0052, lng: baseLng + 0.0049, acc: 7 },
      { lat: baseLat + 0.0030, lng: baseLng + 0.0065, acc: 9 },
      { lat: baseLat + 0.0010, lng: baseLng + 0.0040, acc: 6 }
    ];

    const currentWp = waypoints[0];
    setCoords({ latitude: currentWp.lat, longitude: currentWp.lng, accuracy: currentWp.acc });
    updateMapMarker(currentWp.lat, currentWp.lng, currentWp.acc);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([currentWp.lat, currentWp.lng], 16, { animate: true });
    }

    simulationIntervalRef.current = setInterval(() => {
      simStepRef.current = (simStepRef.current + 1) % waypoints.length;
      const wp = waypoints[simStepRef.current];
      const jitterLat = Number((wp.lat + (Math.random() - 0.5) * 0.0002).toFixed(6));
      const jitterLng = Number((wp.lng + (Math.random() - 0.5) * 0.0002).toFixed(6));

      setCoords({ latitude: jitterLat, longitude: jitterLng, accuracy: wp.acc });
      updateMapMarker(jitterLat, jitterLng, wp.acc);
    }, 2500);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (simulationIntervalRef.current !== null) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
    };
  }, []);

  // Status Badge UI helper
  const renderStatusBadge = () => {
    let dotColor = 'bg-slate-400';
    let badgeBg = 'bg-slate-100 text-slate-700 border-slate-200';

    if (statusColor === 'green') {
      dotColor = 'bg-emerald-500 animate-pulse';
      badgeBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    } else if (statusColor === 'yellow') {
      dotColor = 'bg-amber-500 animate-ping';
      badgeBg = 'bg-amber-50 text-amber-800 border-amber-200';
    } else if (statusColor === 'red') {
      dotColor = 'bg-rose-500';
      badgeBg = 'bg-rose-50 text-rose-800 border-rose-200';
    }

    return (
      <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${badgeBg}`}>
        <span className={`h-2 w-2 rounded-full ${dotColor}`}></span>
        {gpsStatus}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Control Card */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Live GPS Location Tracker</h2>
            <p className="mt-1 text-sm text-slate-500">
              Interactive client-side continuous GPS tracking using the standard Geolocation API.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Status:</span>
            {renderStatusBadge()}
          </div>
        </div>

        {/* Primary Controls Row */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {/* [ Enable GPS / Start Tracking ] Button */}
          <button
            id="start-tracking-btn"
            onClick={startTracking}
            disabled={isTracking && !isSimulating}
            className={`flex items-center gap-2 rounded-2xl px-5 py-3 font-semibold text-white shadow-md transition active:scale-[0.98] ${
              isTracking && !isSimulating
                ? 'bg-slate-300 cursor-not-allowed text-slate-500 shadow-none'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Enable GPS / Start Tracking
          </button>

          {/* [ My Location ] Button */}
          <button
            id="my-location-btn"
            onClick={handleMyLocation}
            className="flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.98]"
            title="Recenter map to your current location"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3M2 12h3m14 0h3" />
            </svg>
            My Location
          </button>

          {/* [ Stop Tracking ] Button */}
          <button
            id="stop-tracking-btn"
            onClick={stopTracking}
            disabled={!isTracking}
            className={`flex items-center gap-2 rounded-2xl px-4 py-3 font-semibold transition active:scale-[0.98] ${
              !isTracking
                ? 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 shadow-sm'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            Stop Tracking
          </button>

          {/* Follow Mode Checkbox */}
          <label className="ml-auto flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 select-none">
            <input
              type="checkbox"
              checked={followUser}
              onChange={(e) => setFollowUser(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Auto-follow Location
          </label>
        </div>

        {/* Telemetry Display Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          {/* Accuracy */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Accuracy</span>
            <p className="mt-1 text-lg font-bold text-slate-800">
              {coords.accuracy !== null ? `±${Math.round(coords.accuracy)} meters` : '--'}
            </p>
          </div>

          {/* Status */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">GPS Status</span>
            <p className="mt-1 text-sm font-bold text-slate-800 truncate">
              {gpsStatus}
            </p>
          </div>
        </div>

        {/* Error / Warning Notice */}
        {errorMessage && (
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-800">⚠️ Location Notice</p>
                <p className="mt-1 text-sm text-amber-900">{errorMessage}</p>
                <p className="mt-2 text-xs text-amber-700">
                  Testing on a desktop/laptop without hardware GPS? You can click the <strong>&quot;Demo Simulation Mode&quot;</strong> button below to test live location tracking and map movement instantly!
                </p>
              </div>
              <button
                onClick={startTracking}
                className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-amber-700 whitespace-nowrap"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Desktop Demo Mode Banner */}
        <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-slate-500">
            <strong>Desktop Testing:</strong> No physical GPS receiver on your computer? Use demo simulation to test marker updates.
          </span>
          <button
            onClick={toggleSimulation}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
              isSimulating
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {isSimulating ? 'Stop Simulation' : '🧪 Test Demo Simulation'}
          </button>
        </div>
      </div>

      {/* Interactive Map Card */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-800">Interactive Location Map</h3>
            <span className="text-xs text-slate-400">• OpenStreetMap Tiles</span>
          </div>
          {isTracking && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
              Live Feed Connected
            </span>
          )}
        </div>

        {/* Leaflet Map DOM Node */}
        <div
          ref={mapContainerRef}
          id="leaflet-gps-map"
          className="h-[480px] w-full rounded-2xl border border-slate-200 shadow-inner z-0"
          style={{ minHeight: '420px' }}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <p>
            The blue pulsing marker indicates your exact live location. The light blue circle reflects GPS accuracy radius.
          </p>
          <p>
            Privacy Guaranteed: Location remains strictly on your device.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LiveGpsTracker;
