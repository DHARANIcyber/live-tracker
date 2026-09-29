const mongoose = require('mongoose');

const busSchema = new mongoose.Schema({
  busNumber: { type: String, required: true, unique: true },
  driverId: String,
  registrationNumber: String,
  driverName: String,
  driverPhone: String,
  capacity: Number,
  route: String,
  startingPoint: String,
  destination: String,
  timing: String,
  currentLocation: {
    latitude: Number,
    longitude: Number
  },
  accuracy: Number,
  lastUpdated: Date,
  speed: Number,
  status: String,
  currentStudents: Number,
  stops: [{ name: String, distance: Number, studentsWaiting: Number }]
}, { timestamps: true });

module.exports = mongoose.model('Bus', busSchema);
