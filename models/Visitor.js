const mongoose = require('mongoose');
const visitorSchema = new mongoose.Schema({
  visitor_id: String,
  name: String,
  company: String,
  purpose_of_visit: String,
  staff_member: String,
  site: String,
  sign_in_time: { type: Date, default: Date.now },
  departure_time: Date
});
module.exports = mongoose.model('Visitor', visitorSchema);