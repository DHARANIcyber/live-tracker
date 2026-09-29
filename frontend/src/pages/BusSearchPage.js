import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../apiConfig';

const normalizeBusNumber = (value) => String(value || '').trim().toUpperCase();

const BusSearchPage = () => {
  const [searchParams] = useSearchParams();
  const routeQuery = searchParams.get('q')?.trim() || '';
  const initialRouteQueryRef = useRef(routeQuery);
  const [query, setQuery] = useState(routeQuery);
  const [bus, setBus] = useState(null);
  const [allBuses, setAllBuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [noResults, setNoResults] = useState(false);
  const [timeoutError, setTimeoutError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const shouldShowBusList = allBuses.length > 0;
  const visibleBuses = allBuses.slice(0, visibleCount);

  useEffect(() => {
    if (!initialRouteQueryRef.current) {
      axios.get(`${API_BASE_URL}/api/buses`).then((res) => {
        const buses = Array.isArray(res.data) ? res.data : [];
        setAllBuses(buses);
        setVisibleCount(12);
      }).catch(() => setError('Unable to load buses. Please check your connection and try again.'));
    }
  }, []);

  const executeSearch = useCallback(async (searchTerm) => {
    if (!searchTerm) {
      setBus(null);
      setError('Please enter a bus number, route, driver name, or phone to search.');
      setNoResults(false);
      setTimeoutError(false);
      return;
    }

    setLoading(true);
    setError('');
    setNoResults(false);
    setTimeoutError(false);
    setBus(null);

    try {
      const res = await axios.get(`${API_BASE_URL}/api/bus?q=${encodeURIComponent(searchTerm)}`, {
        timeout: 10000
      });
      const matches = Array.isArray(res.data) ? res.data : [res.data];
      setBus(matches[0] || null);
      setAllBuses(matches);
      setVisibleCount(12);
      setNoResults(false);
    } catch (err) {
      setBus(null);
      setAllBuses([]);
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404) {
          setNoResults(true);
          setError('');
        } else if (err.code === 'ECONNABORTED') {
          setTimeoutError(true);
          setError('Request timed out. Please try again in a moment.');
        } else {
          setError(err.response?.data?.message || 'Unable to search buses right now. Please try again later.');
        }
      } else {
        setError('Unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!routeQuery) return;
    setQuery(routeQuery);
    executeSearch(routeQuery);
  }, [routeQuery, executeSearch]);

  const handleSearch = async (e) => {
    e.preventDefault();
    executeSearch(query.trim());
  };

  const handleBusSelect = async (item) => {
    setQuery(item.busNumber);
    executeSearch(item.busNumber);
  };

  const handleRetry = () => {
    executeSearch(query.trim());
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Bus Search</h2>
            <p className="mt-1 text-sm text-slate-600">Search any bus to view its route and schedule.</p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
            {bus ? 'Bus found' : 'Search for a bus'}
          </div>
        </div>
        <form onSubmit={handleSearch} className="mt-4 flex flex-col gap-3 md:flex-row">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Enter Bus Number, Route or Driver Name" className="flex-1 rounded-2xl border border-slate-300 px-4 py-3" />
          <button type="submit" className="rounded-2xl bg-cyan-700 px-5 py-3 font-semibold text-white">Search</button>
        </form>

        {loading && <p className="mt-3 text-sm text-slate-600">Searching buses...</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {!loading && timeoutError && (
          <button type="button" onClick={handleRetry} className="mt-3 inline-flex items-center rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
            Retry
          </button>
        )}
        {!loading && noResults && <p className="mt-3 text-sm text-slate-700">Bus {normalizeBusNumber(query)} was not found.</p>}
      </div>

      {bus && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold">Bus Details</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Info label="Bus Number" value={bus.busNumber} />
            <Info label="Driver Name" value={bus.driverName} />
            <Info label="Registration Number" value={bus.registrationNumber} />
            <Info label="Starting Point" value={bus.startingPoint} />
            <Info label="Destination" value={bus.destination} />
            <Info label="Start Time" value={bus.timing} />
          </div>
        </div>
      )}

      {shouldShowBusList && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold">Available Buses</h3>
          <p className="mt-2 text-sm text-slate-600">Showing {Math.min(visibleCount, allBuses.length)} of {allBuses.length} matching buses.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {visibleBuses.map((item) => (
              <div key={item.busNumber} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold">{item.busNumber}</p>
                <p className="text-sm text-slate-600">Route: {item.route} • Driver: {item.driverName}</p>
                <button onClick={() => handleBusSelect(item)} className="mt-3 rounded-xl bg-cyan-700 px-3 py-2 text-sm font-semibold text-white">
                  View Details
                </button>
              </div>
            ))}
          </div>
          {visibleCount < allBuses.length && (
            <button type="button" onClick={() => setVisibleCount((prev) => prev + 12)} className="mt-4 rounded-2xl border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-50">
              Show more buses
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const Info = ({ label, value }) => (
  <div className="rounded-2xl bg-slate-50 p-4">
    <p className="text-sm font-semibold text-slate-500">{label}</p>
    <p className="mt-2 text-slate-700">{value}</p>
  </div>
);

export default BusSearchPage;
