const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  customerID: { type: Number, required: true, unique: true },
  customerName: { type: String },
  lastOrder: { type: String },
  // add other customer fields as needed
}, { timestamps: true });

module.exports = mongoose.model('customers', customerSchema);