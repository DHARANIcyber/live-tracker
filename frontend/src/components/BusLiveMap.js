import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const busIcon = L.divIcon({
  className: 'bus-location-marker',
  html: '<span style="display:flex;width:38px;height:38px;align-items:center;justify-content:center;border:3px solid white;border-radius:50%;background:#047857;color:white;font-size:20px;box-shadow:0 2px 8px #0f172a66">B</span>',
  iconSize: [38, 38],
  iconAnchor: [19, 19]
});

const RecenterMap = ({ latitude, longitude }) => {
  const map = useMap();

  useEffect(() => {
    map.setView([latitude, longitude], Math.max(map.getZoom(), 15), { animate: true });
  }, [map, latitude, longitude]);

  return null;
};

const BusLiveMap = ({ busNumber, online, location }) => {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  const hasValidLocation = location && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;

  if (!online || !hasValidLocation) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 px-4 text-center text-sm font-medium text-slate-600">
        {busNumber ? `${busNumber} is currently offline. Live location is unavailable.` : 'Search for a bus to view its live location.'}
      </div>
    );
  }

  return (
    <MapContainer center={[latitude, longitude]} zoom={15} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterMap latitude={latitude} longitude={longitude} />
      <Marker position={[latitude, longitude]} icon={busIcon} alt={`${busNumber} live location`}>
        <Popup>
          <strong>Bus {busNumber}</strong>
          <br />Live Location · Online
        </Popup>
      </Marker>
    </MapContainer>
  );
};

export default BusLiveMap;