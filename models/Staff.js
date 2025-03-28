const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String } // Add phone field (e.g., '+12345678901')
});

module.exports = mongoose.model('Staff', staffSchema);