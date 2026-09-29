import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const BusSearchBox = ({ className = '' }) => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (event) => {
    event.preventDefault();
    const searchTerm = query.trim();
    if (!searchTerm) return;
    navigate(`/search?q=${encodeURIComponent(searchTerm)}`);
  };

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col gap-3 sm:flex-row ${className}`}>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Bus number, route, or driver"
        aria-label="Search buses by bus number, route, or driver"
        className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-100"
        required
      />
      <button type="submit" className="rounded-xl bg-cyan-700 px-5 py-3 font-semibold text-white hover:bg-cyan-800">
        Search buses
      </button>
    </form>
  );
};

export default BusSearchBox;
