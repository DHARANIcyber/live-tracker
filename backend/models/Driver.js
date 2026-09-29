const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phoneNumber: { type: String, trim: true, unique: true, sparse: true },
  passwordHash: { type: String, required: true },
  busId: { type: String, required: true, unique: true }
}, { timestamps: true });

module.exports = mongoose.model('Driver', driverSchema);