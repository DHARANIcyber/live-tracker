const mongoose = require('mongoose');

const gpsSchema = new mongoose.Schema({
  busId: { type: String, required: true },
  busNumber: { type: String, required: true },
  driverId: { type: String, required: true },
  latitude: Number,
  longitude: Number,
  accuracy: Number,
  speed: Number,
  timestamp: { type: Date, default: Date.now },
  status: String
}, { timestamps: true });

gpsSchema.index({ busId: 1, timestamp: -1 });

module.exports = mongoose.model('GPS', gpsSchema);
