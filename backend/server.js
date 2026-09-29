const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const Bus = require('./models/Bus');
const Student = require('./models/Student');
const GPS = require('./models/GPS');
const Driver = require('./models/Driver');
const { createAccessToken, createDriverToken, hashPassword, verifyAccessToken, verifyPassword } = require('./services/driverAuth');

dotenv.config();

const app = express();
const requireAccessRole = (...roles) => (req, res, next) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const claims = verifyAccessToken(token);
  if (!claims) return res.status(401).json({ message: 'Please log in to continue.' });
  if (!roles.includes(claims.role)) return res.status(403).json({ message: 'You do not have access to this resource.' });
  req.auth = claims;
  return next();
};

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  process.env.FRONTEND_URL,
  process.env.VERCEL_FRONTEND_URL
].filter(Boolean);
const pfxPath = process.env.SSL_PFX_PATH || path.join(__dirname, 'certs', 'localhost.pfx');
const certPath = process.env.SSL_CERT_PATH || path.join(__dirname, 'certs', 'localhost.pem');
const keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, 'certs', 'localhost-key.pem');
const pfxPassphrase = process.env.SSL_PFX_PASSPHRASE || 'live2local';
const hasPfx = fs.existsSync(pfxPath);
const hasPem = fs.existsSync(certPath) && fs.existsSync(keyPath);
const preferHttps = process.env.USE_HTTPS === 'true';
const useHttps = preferHttps && (hasPfx || hasPem);

const httpsOptions = hasPfx
  ? { pfx: fs.readFileSync(pfxPath), passphrase: pfxPassphrase }
  : hasPem
    ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
    : null;

const server = useHttps
  ? https.createServer(httpsOptions, app)
  : http.createServer(app);

if (useHttps) {
  console.log(`Starting HTTPS server using ${hasPfx ? 'PFX' : 'PEM'} certificates`);
} else if (preferHttps) {
  console.warn('HTTPS was requested but certificates are unavailable. Starting HTTP server instead.');
} else {
  console.log('Starting HTTP server for local development.');
}

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.options('*', cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
app.set('io', io);

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || '';
const GPS_LOCATION_TIMEOUT_MS = Number(process.env.GPS_LOCATION_TIMEOUT_MS) || 45000;
let buses = [];
let students = [];
let drivers = [];
let gpsLogs = [];
const demoDriverId = new mongoose.Types.ObjectId().toString();
let college = {
  collegeName: 'Shree Venkateshwara Group of Institutions',
  address: 'Otthakkuthirai, Gobichettipalayam, Erode District, Tamil Nadu',
  phone: '+91 98765 43210',
  email: 'transport@svg.edu',
  website: 'https://svg.edu'
};

const buildBusSeedData = () => {
  const routeTemplates = [
    { route: 'Route 1', startingPoint: 'Main Gate', destination: 'Hostel Block', timing: '07:30 AM' },
    { route: 'Route 2', startingPoint: 'North Campus', destination: 'Science Block', timing: '08:00 AM' },
    { route: 'Route 3', startingPoint: 'Library', destination: 'Cafeteria', timing: '08:15 AM' },
    { route: 'Route 4', startingPoint: 'Residential Area', destination: 'Admin Block', timing: '08:30 AM' },
    { route: 'Route 5', startingPoint: 'Sports Complex', destination: 'Main Gate', timing: '09:00 AM' },
    { route: '107', startingPoint: 'Ottakkuthirai', destination: 'Sivagiri', timing: '08:45 AM' }
  ];

  const buses = [];
  for (let index = 1; index <= 120; index += 1) {
    const template = routeTemplates[(index - 1) % routeTemplates.length];
    const stops = [
      { name: template.startingPoint, distance: 0, studentsWaiting: 6 + (index % 5) },
      { name: 'Middle Stop', distance: 2.1 + (index % 4), studentsWaiting: 4 + (index % 3) },
      { name: template.destination, distance: 4.8 + (index % 3), studentsWaiting: 3 + (index % 4) }
    ];

    buses.push({
      _id: new mongoose.Types.ObjectId().toString(),
      driverId: index === 1 ? demoDriverId : undefined,
      busNumber: `SVG-${String(index).padStart(3, '0')}`,
      registrationNumber: `TN-01-AB-${String(index).padStart(4, '0')}`,
      driverName: `Driver ${index}`,
      driverPhone: '+91 96593 96462',
      capacity: 42 + (index % 4),
      route: template.route,
      startingPoint: template.startingPoint,
      destination: template.destination,
      timing: template.timing,
      status: 'OFFLINE',
      currentStudents: 14 + (index % 24),
      stops
    });
  }

  return buses;
};

const initialBuses = buildBusSeedData();
const initialDrivers = [{
  _id: demoDriverId,
  name: 'Driver 1',
  email: 'driver@greenvalley.edu',
  phoneNumber: '919659396462',
  passwordHash: hashPassword('driver2svgi'),
  busId: initialBuses[0]._id
}];

const initialStudents = [
  {
    _id: 'std-1',
    name: 'Aarav Sharma',
    email: 'student@gmail.com',
    registerNumber: 'REG-1001',
    department: 'Computer Science',
    year: '2nd Year',
    busNumber: 'GVC-101',
    stop: 'Library'
  },
  {
    _id: 'std-2',
    name: 'Sneha Nair',
    registerNumber: 'REG-1002',
    department: 'Electronics',
    year: '3rd Year',
    busNumber: 'GVC-202',
    stop: 'Science Block'
  }
];

const seedData = () => {
  buses = [...initialBuses];
  students = [...initialStudents];
  drivers = process.env.NODE_ENV === 'production' ? [] : [...initialDrivers];
  gpsLogs = [];
  app.locals.buses = buses;
  app.locals.students = students;
  app.locals.drivers = drivers;
  app.locals.gpsLogs = gpsLogs;
  app.locals.college = college;
};

seedData();

const initializeDatabase = async () => {
  if (!MONGO_URI) {
    console.log('No MONGO_URI provided. Running with seeded in-memory data.');
    return;
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected');

    const busCount = await Bus.countDocuments();
    const studentCount = await Student.countDocuments();

    if (busCount === 0) {
      await Bus.insertMany(initialBuses);
      console.log('Seeded buses into MongoDB');
    }

    if (studentCount === 0) {
      await Student.insertMany(initialStudents);
      console.log('Seeded students into MongoDB');
    }

    if (process.env.NODE_ENV !== 'production' && await Driver.countDocuments() === 0) {
      const developmentBus = await Bus.findOne({ busNumber: 'SVG-001' });
      if (developmentBus) {
        const developmentDriver = await Driver.create({
          ...initialDrivers[0],
          busId: String(developmentBus._id)
        });
        developmentBus.driverId = String(developmentDriver._id);
        await developmentBus.save();
        console.log('Seeded development driver into MongoDB');
      }
    }

    const bootstrapEmail = String(process.env.DRIVER_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
    const bootstrapPhone = String(process.env.DRIVER_BOOTSTRAP_PHONE || '').replace(/\D/g, '');
    const bootstrapPassword = process.env.DRIVER_BOOTSTRAP_PASSWORD || '';
    const bootstrapBusNumber = String(process.env.DRIVER_BOOTSTRAP_BUS_NUMBER || '').trim().toUpperCase();
    if (bootstrapEmail && bootstrapPhone && bootstrapPassword && bootstrapBusNumber) {
      let bootstrapDriver = await Driver.findOne({ email: bootstrapEmail });
      const bootstrapBus = await Bus.findOne({ busNumber: bootstrapBusNumber });
      if (bootstrapBus && !bootstrapDriver) {
        bootstrapDriver = await Driver.create({
          name: bootstrapBus.driverName || bootstrapEmail,
          email: bootstrapEmail,
          phoneNumber: bootstrapPhone,
          passwordHash: hashPassword(bootstrapPassword),
          busId: String(bootstrapBus._id)
        });
      }
      if (bootstrapDriver && !bootstrapDriver.phoneNumber) {
        bootstrapDriver.phoneNumber = bootstrapPhone;
        await bootstrapDriver.save();
      }
      if (bootstrapBus && bootstrapDriver && String(bootstrapDriver.busId) === String(bootstrapBus._id)) {
        bootstrapBus.driverId = String(bootstrapDriver._id);
        await bootstrapBus.save();
      }
    }

    const dbBuses = await Bus.find();
    buses = dbBuses;
    app.locals.buses = buses;

    const dbStudents = await Student.find();
    students = dbStudents;
    app.locals.students = students;
    drivers = await Driver.find();
    app.locals.drivers = drivers;
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
};

initializeDatabase();

io.on('connection', (socket) => {
  socket.on('joinBus', (busNumber) => socket.join(String(busNumber || '').trim().toUpperCase()));
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/college', (req, res) => res.json(college));
app.get('/dashboard-summary', requireAccessRole('admin'), (req, res) => {
  res.json({
    totalBuses: buses.length,
    totalStudents: students.length,
    activeBuses: buses.filter((bus) => bus.status === 'ONLINE').length,
    completedTrips: 8
  });
});

app.post('/login', async (req, res) => {
  const { role, email, phoneNumber, busNumber, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (role === 'driver') {
    try {
      const normalizedPhone = String(phoneNumber || '').replace(/\D/g, '');
      const normalizedBusNumber = String(busNumber || '').trim().toUpperCase();
      if (!/^\d{7,15}$/.test(normalizedPhone)) {
        return res.status(400).json({ message: 'Enter a valid driver phone number.' });
      }

      const databaseConnected = mongoose.connection.readyState === 1;
      const phoneLookup = normalizedPhone.length === 10 ? { $regex: `${normalizedPhone}$` } : normalizedPhone;
      let driver = databaseConnected
        ? await Driver.findOne({ phoneNumber: phoneLookup })
        : (app.locals.drivers || []).find((item) => {
            const savedPhone = String(item.phoneNumber || '').replace(/\D/g, '');
            return savedPhone === normalizedPhone || (normalizedPhone.length === 10 && savedPhone.endsWith(normalizedPhone));
          });
      let claimDemoPhone = Boolean(driver && !databaseConnected && String(driver._id) === String(demoDriverId) && !driver.phoneNumberClaimed);
      let demoPhoneAlreadyClaimed = false;

      if (!driver && !databaseConnected && process.env.NODE_ENV !== 'production') {
        const demoDriver = (app.locals.drivers || []).find((item) => String(item._id) === String(demoDriverId));
        if (demoDriver && verifyPassword(password, demoDriver.passwordHash)) {
          const savedPhone = String(demoDriver.phoneNumber || '').replace(/\D/g, '');
          if (demoDriver.phoneNumberClaimed && savedPhone !== normalizedPhone) {
            demoPhoneAlreadyClaimed = true;
          } else {
            driver = demoDriver;
            claimDemoPhone = true;
          }
        }
      }

      if ((!driver && !demoPhoneAlreadyClaimed) || (driver && !verifyPassword(password, driver.passwordHash))) {
        return res.status(401).json({ message: 'Invalid driver phone number or password.' });
      }

      const assignedBus = mongoose.connection.readyState === 1
        ? await Bus.findById(driver.busId)
        : (app.locals.buses || []).find((item) => String(item._id) === String(driver.busId));
      if (!assignedBus || String(assignedBus.driverId) !== String(driver._id)) {
        return res.status(403).json({ message: 'No bus is assigned to this driver.' });
      }

      const requestedBus = normalizedBusNumber
        ? (databaseConnected
            ? await Bus.findOne({ busNumber: normalizedBusNumber })
            : (app.locals.buses || []).find((item) => String(item.busNumber || '').trim().toUpperCase() === normalizedBusNumber))
        : assignedBus;

      if (!requestedBus) {
        return res.status(404).json({ message: normalizedBusNumber ? `Bus ${normalizedBusNumber} was not found.` : 'No bus is assigned to this driver.' });
      }
      if (demoPhoneAlreadyClaimed) {
        return requestedBus.driverId
          ? res.status(409).json({ message: `Bus ${normalizedBusNumber || assignedBus.busNumber} is already assigned to another driver.` })
          : res.status(401).json({ message: 'Invalid driver phone number or password.' });
      }
      if (normalizedBusNumber && requestedBus.driverId && String(requestedBus.driverId) !== String(driver._id)) {
        return res.status(409).json({ message: `Bus ${normalizedBusNumber} is already assigned to another driver.` });
      }
      if (normalizedBusNumber && String(assignedBus._id) !== String(requestedBus._id)) {
        return res.status(403).json({ message: `${normalizedBusNumber} is not assigned to this driver.` });
      }
      if (claimDemoPhone) {
        driver.phoneNumber = normalizedPhone;
        driver.phoneNumberClaimed = true;
      }

      return res.json({
        role: 'driver',
        name: driver.name,
        email: driver.email,
        token: createDriverToken(driver._id),
        assignedBus: {
          id: String(assignedBus._id),
          busNumber: assignedBus.busNumber,
          route: assignedBus.route
        }
      });
    } catch (error) {
      console.error('Driver login failed:', error);
      return res.status(503).json({ message: 'Driver login is temporarily unavailable.' });
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const users = {
    admin: {
      email: (isProduction ? process.env.ADMIN_EMAIL : 'admin@greenvalley.edu')?.trim().toLowerCase(),
      password: isProduction ? process.env.ADMIN_PASSWORD : 'admin1svgi'
    },
    student: {
      email: (isProduction ? process.env.STUDENT_EMAIL : 'student@gmail.com')?.trim().toLowerCase(),
      password: isProduction ? process.env.STUDENT_PASSWORD : 'student3svgi'
    }
  };

  const user = users[role];
  const emailAllowed = !isProduction || user?.email === normalizedEmail;
  if (!user || !emailAllowed || user.password !== password) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (role === 'student') {
    let student = mongoose.connection.readyState === 1
      ? await Student.findOne({ email: normalizedEmail })
      : (app.locals.students || []).find((item) => String(item.email || '').trim().toLowerCase() === normalizedEmail);

    if (!student && !process.env.MONGO_URI && process.env.NODE_ENV !== 'production') {
      student = (app.locals.students || []).find((item) => String(item._id) === 'std-1');
    }

    if (!student) return res.status(401).json({ message: 'No student profile is registered with this email.' });
    return res.json({
      role,
      name: student.name,
      email: normalizedEmail,
      studentId: String(student._id),
      token: createAccessToken(student._id, role)
    });
  }

  return res.json({
    role,
    name: role.charAt(0).toUpperCase() + role.slice(1),
    email: normalizedEmail,
    token: createAccessToken(normalizedEmail, role)
  });
});

app.use('/api', require('./routes/busRoutes'));

const markStaleBusesOffline = async () => {
  const staleBefore = new Date(Date.now() - GPS_LOCATION_TIMEOUT_MS);
  try {
    if (mongoose.connection.readyState === 1) {
      const staleBuses = await Bus.find({ status: 'ONLINE', lastUpdated: { $lte: staleBefore } }).select('busNumber');
      if (staleBuses.length) {
        await Bus.updateMany({ status: 'ONLINE', lastUpdated: { $lte: staleBefore } }, { $set: { status: 'OFFLINE' } });
        staleBuses.forEach((bus) => io.emit('gpsStatus', { busNumber: bus.busNumber, status: 'OFFLINE' }));
      }
      return;
    }

    (app.locals.buses || []).forEach((bus) => {
      if (bus.status === 'ONLINE' && (!bus.lastUpdated || new Date(bus.lastUpdated) <= staleBefore)) {
        bus.status = 'OFFLINE';
        io.emit('gpsStatus', { busNumber: bus.busNumber, status: 'OFFLINE' });
      }
    });
  } catch (error) {
    console.warn('Could not expire stale bus locations:', error.message);
  }
};

const staleBusTimer = setInterval(markStaleBusesOffline, 5000);
staleBusTimer.unref();

const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
app.use(express.static(frontendBuildPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/college' || req.path === '/dashboard-summary') {
    return next();
  }
  return res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} (${useHttps ? 'https' : 'http'})`);
});
