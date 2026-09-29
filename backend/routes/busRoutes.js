const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Bus = require('../models/Bus');
const Student = require('../models/Student');
const GPS = require('../models/GPS');
const Driver = require('../models/Driver');
const { syncBusLocation } = require('../services/gpsService');
const { verifyAccessToken, verifyDriverToken } = require('../services/driverAuth');

const GPS_LOCATION_TIMEOUT_MS = Number(process.env.GPS_LOCATION_TIMEOUT_MS) || 45000;
const useMongo = () => mongoose.connection.readyState === 1;
const normalizeBusNumber = (value) => String(value || '').trim().toUpperCase();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const requireAccessRole = (...roles) => (req, res, next) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const claims = verifyAccessToken(token);
  if (!claims) return res.status(401).json({ message: 'Please log in to continue.' });
  if (!roles.includes(claims.role)) return res.status(403).json({ message: 'You do not have access to this resource.' });
  req.auth = claims;
  return next();
};

router.use((req, res, next) => {
  if (process.env.MONGO_URI && !useMongo()) {
    return res.status(503).json({ message: 'The location database is temporarily unavailable.' });
  }
  return next();
});

const findBusByNumber = async (app, busNumber) => {
  const normalized = normalizeBusNumber(busNumber);
  if (useMongo()) return Bus.findOne({ busNumber: new RegExp(`^${escapeRegex(normalized)}$`, 'i') });
  return (app.locals.buses || []).find((bus) => normalizeBusNumber(bus.busNumber) === normalized);
};

const publicBusState = async (bus) => {
  const record = typeof bus.toObject === 'function' ? bus.toObject() : { ...bus };
  const latitude = Number(record.currentLocation?.latitude);
  const longitude = Number(record.currentLocation?.longitude);
  const accuracy = Number(record.accuracy);
  const lastUpdated = record.lastUpdated ? new Date(record.lastUpdated) : null;
  const ageMs = lastUpdated ? Date.now() - lastUpdated.getTime() : Infinity;
  const online = record.status === 'ONLINE' && Boolean(record.driverId) &&
    Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
    Number.isFinite(accuracy) && accuracy >= 0 && Number.isFinite(ageMs) &&
    ageMs >= 0 && ageMs <= GPS_LOCATION_TIMEOUT_MS;

  if (!online && record.status !== 'OFFLINE') {
    if (useMongo()) await Bus.updateOne({ _id: record._id }, { $set: { status: 'OFFLINE' } });
    else bus.status = 'OFFLINE';
  }

  delete record.driverPhone;
  const { driverId, ...publicRecord } = record;
  return {
    ...publicRecord,
    status: online ? 'ONLINE' : 'OFFLINE',
    online,
    currentLocation: online ? { latitude, longitude } : null,
    accuracy: online ? accuracy : null,
    lastUpdated: online ? lastUpdated : null
  };
};

const requireDriver = async (req, res, next) => {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const claims = verifyDriverToken(token);
    if (!claims) return res.status(401).json({ message: 'Please log in as a driver to update GPS.' });

    const driver = useMongo()
      ? await Driver.findById(claims.sub)
      : (req.app.locals.drivers || []).find((item) => String(item._id) === claims.sub);
    if (!driver) return res.status(401).json({ message: 'Driver account is no longer available.' });

    const bus = useMongo()
      ? await Bus.findById(driver.busId)
      : (req.app.locals.buses || []).find((item) => String(item._id) === String(driver.busId));
    if (!bus || String(bus.driverId) !== String(driver._id)) {
      return res.status(403).json({ message: 'This driver is not assigned to an active bus.' });
    }

    req.driver = driver;
    req.assignedBus = bus;
    return next();
  } catch (error) {
    return res.status(503).json({ message: 'Driver authentication is temporarily unavailable.' });
  }
};

const normalizeValue = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const isBusNumberQuery = (rawQuery) => {
  const normalizedQuery = normalizeValue(rawQuery);
  if (!normalizedQuery) return false;

  return normalizedQuery.startsWith('svg') || /^\d{1,3}$/.test(normalizedQuery);
};

const matchesQuery = (bus, rawQuery) => {
  const query = rawQuery?.trim();
  if (!query) return false;

  const normalizedQuery = normalizeValue(query);
  if (!normalizedQuery) return false;

  const isBusSearch = isBusNumberQuery(query);
  if (normalizedQuery.startsWith('svg')) {
    return normalizeBusNumber(bus.busNumber) === normalizeBusNumber(query) ||
      normalizeBusNumber(bus.registrationNumber) === normalizeBusNumber(query);
  }

  const queryDigits = normalizedQuery.replace(/\D/g, '');
  const queryDigitsWithoutLeadingZeros = queryDigits.replace(/^0+/, '');
  const valuesToCheck = isBusSearch
    ? [bus.busNumber, bus.registrationNumber]
    : [bus.busNumber, bus.route, bus.registrationNumber, bus.driverName, bus.startingPoint, bus.destination];

  return valuesToCheck.some((value) => {
    const normalizedValue = normalizeValue(value);

    if (normalizedValue.includes(normalizedQuery)) {
      return true;
    }

    if (!isBusSearch || !queryDigitsWithoutLeadingZeros) {
      return false;
    }

    const valueDigits = normalizedValue.replace(/\D/g, '');
    const valueDigitsWithoutLeadingZeros = valueDigits.replace(/^0+/, '');

    if (!valueDigitsWithoutLeadingZeros) {
      return false;
    }

    if (queryDigitsWithoutLeadingZeros.length <= 1) {
      return valueDigitsWithoutLeadingZeros.startsWith(queryDigitsWithoutLeadingZeros);
    }

    if (queryDigitsWithoutLeadingZeros.length === 2) {
      return valueDigitsWithoutLeadingZeros.startsWith(queryDigitsWithoutLeadingZeros) ||
        valueDigitsWithoutLeadingZeros.includes(queryDigitsWithoutLeadingZeros);
    }

    return valueDigitsWithoutLeadingZeros.startsWith(queryDigitsWithoutLeadingZeros) ||
      queryDigitsWithoutLeadingZeros.startsWith(valueDigitsWithoutLeadingZeros) ||
      valueDigitsWithoutLeadingZeros.includes(queryDigitsWithoutLeadingZeros);
  });
};

router.get('/buses', async (req, res) => {
  try {
    const buses = useMongo() ? await Bus.find() : (req.app.locals.buses || []);
    return res.json(await Promise.all(buses.map(publicBusState)));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/bus/:busNumber', async (req, res) => {
  try {
    const busParam = normalizeBusNumber(req.params.busNumber);
    if (!busParam) {
      return res.status(400).json({ message: 'Bus identifier is required' });
    }

    if (useMongo()) {
      const bus = await Bus.findOne({
        $or: [
          { busNumber: new RegExp(`^${escapeRegex(busParam)}$`, 'i') },
          { registrationNumber: new RegExp(`^${escapeRegex(busParam)}$`, 'i') }
        ]
      });
      if (!bus) return res.status(404).json({ message: `Bus ${busParam} was not found.` });
      return res.json(await publicBusState(bus));
    }

    const buses = req.app.locals.buses || [];
    const bus = buses.find((item) =>
      normalizeBusNumber(item.busNumber) === busParam ||
      normalizeBusNumber(item.registrationNumber) === busParam
    );

    if (!bus) return res.status(404).json({ message: `Bus ${busParam} was not found.` });
    return res.json(await publicBusState(bus));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/bus', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.status(400).json({ message: 'Query parameter q is required' });
    }

    if (useMongo()) {
      const buses = await Bus.find();
      const exact = buses.find((b) =>
        normalizeBusNumber(b.busNumber) === normalizeBusNumber(query) ||
        normalizeBusNumber(b.registrationNumber) === normalizeBusNumber(query)
      );
      if (exact) return res.json(await publicBusState(exact));

      const matchingBuses = buses.filter((item) => matchesQuery(item, query));
      if (!matchingBuses.length) return res.status(404).json({ message: `Bus ${normalizeBusNumber(query)} was not found.` });
      const publicBuses = await Promise.all(matchingBuses.map(publicBusState));
      return res.json(publicBuses.length === 1 ? publicBuses[0] : publicBuses);
    }

    const buses = req.app.locals.buses || [];
    const exact = buses.find((b) =>
      normalizeBusNumber(b.busNumber) === normalizeBusNumber(query) ||
      normalizeBusNumber(b.registrationNumber) === normalizeBusNumber(query)
    );
    if (exact) return res.json(await publicBusState(exact));

    const matchingBuses = buses.filter((item) => matchesQuery(item, query));

    if (!matchingBuses.length) return res.status(404).json({ message: `Bus ${normalizeBusNumber(query)} was not found.` });
    const publicBuses = await Promise.all(matchingBuses.map(publicBusState));
    return res.json(publicBuses.length === 1 ? publicBuses[0] : publicBuses);
  } catch (error) {
    console.error('Bus search failed:', error);
    return res.status(500).json({ message: 'Unable to search buses right now. Please try again later.' });
  }
});

router.get('/students', requireAccessRole('admin', 'student'), async (req, res) => {
  try {
    if (req.auth.role === 'student') {
      const student = useMongo()
        ? await Student.findById(req.auth.sub)
        : (req.app.locals.students || []).find((item) => String(item._id) === req.auth.sub);
      if (!student) return res.status(404).json({ message: 'Student profile not found.' });
      return res.json([student]);
    }

    if (useMongo()) {
      const students = await Student.find();
      return res.json(students);
    }

    return res.json(req.app.locals.students || []);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/gps/update', requireDriver, async (req, res) => {
  try {
    const { latitude, longitude, accuracy } = req.body;
    const bus = req.assignedBus;
    const driver = req.driver;
    const io = req.app.get('io');
    const lat = Number(latitude);
    const lng = Number(longitude);
    const accuracyMeters = Number(accuracy);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ message: 'Valid GPS latitude and longitude are required.' });
    }
    if (!Number.isFinite(accuracyMeters) || accuracyMeters < 0) {
      return res.status(400).json({ message: 'Valid GPS accuracy is required.' });
    }

    const eventTime = new Date();
    const busId = String(bus._id);
    const driverId = String(driver._id);
    const status = 'ONLINE';

    if (useMongo()) {
      const gpsEntry = new GPS({ busId, busNumber: bus.busNumber, driverId, latitude: lat, longitude: lng, accuracy: accuracyMeters, timestamp: eventTime, status });
      await gpsEntry.save();
      await syncBusLocation({ app: req.app, busId, latitude: lat, longitude: lng, accuracy: accuracyMeters, status, timestamp: eventTime, useMongo: true, busModel: Bus });
    } else {
      const history = req.app.locals.gpsLogs || [];
      req.app.locals.gpsLogs = [...history, { busId, busNumber: bus.busNumber, driverId, latitude: lat, longitude: lng, accuracy: accuracyMeters, timestamp: eventTime, status }];
      await syncBusLocation({ app: req.app, busId, latitude: lat, longitude: lng, accuracy: accuracyMeters, status, timestamp: eventTime, useMongo: false });
    }

    const payload = { busId, busNumber: bus.busNumber, latitude: lat, longitude: lng, accuracy: accuracyMeters, timestamp: eventTime, status };
    if (io) {
      io.to(normalizeBusNumber(bus.busNumber)).emit('gpsUpdate', payload);
      io.emit('gpsUpdate', payload);
    }

    return res.json({ message: 'GPS update received', data: payload });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/gps/offline', requireDriver, async (req, res) => {
  try {
    const bus = req.assignedBus;
    if (useMongo()) {
      await Bus.updateOne({ _id: bus._id, driverId: String(req.driver._id) }, { $set: { status: 'OFFLINE' } });
    } else {
      bus.status = 'OFFLINE';
    }

    const payload = { busId: String(bus._id), busNumber: bus.busNumber, status: 'OFFLINE' };
    const io = req.app.get('io');
    if (io) {
      io.to(normalizeBusNumber(bus.busNumber)).emit('gpsStatus', payload);
      io.emit('gpsStatus', payload);
    }
    return res.json({ message: `${bus.busNumber} is offline.` });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update bus status right now.' });
  }
});

router.get('/gps/history/:busId', requireAccessRole('admin'), async (req, res) => {
  try {
    if (useMongo()) {
      const history = await GPS.find({ busId: req.params.busId }).sort({ timestamp: 1 });
      return res.json(history);
    }

    const history = (req.app.locals.gpsLogs || []).filter((entry) => entry.busId === req.params.busId);
    return res.json(history);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/gps/status/:busId', async (req, res) => {
  try {
    const busNumber = normalizeBusNumber(req.params.busId);
    const bus = await findBusByNumber(req.app, busNumber);
    if (!bus) return res.status(404).json({ message: `Bus ${busNumber} was not found.` });
    const publicState = await publicBusState(bus);
    return res.json({
      busNumber: publicState.busNumber,
      online: publicState.online,
      status: publicState.status,
      location: publicState.currentLocation,
      accuracy: publicState.accuracy,
      lastUpdated: publicState.lastUpdated
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/addBus', requireAccessRole('admin'), async (req, res) => {
  try {
    if (useMongo()) {
      const newBus = new Bus(req.body);
      await newBus.save();
      return res.status(201).json(newBus);
    }

    const buses = req.app.locals.buses || [];
    const newBus = { ...req.body, _id: `bus-${Date.now()}` };
    req.app.locals.buses = [...buses, newBus];
    return res.status(201).json(newBus);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/addStudent', requireAccessRole('admin'), async (req, res) => {
  try {
    if (useMongo()) {
      const newStudent = new Student(req.body);
      await newStudent.save();
      return res.status(201).json(newStudent);
    }

    const students = req.app.locals.students || [];
    const newStudent = { ...req.body, _id: `student-${Date.now()}` };
    req.app.locals.students = [...students, newStudent];
    return res.status(201).json(newStudent);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
