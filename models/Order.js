const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  customerID: { type: Number, required: true },
  futureOrderDate: { type: String },
  productName: { type: String },
  // add other order fields as needed
}, { timestamps: true });

module.exports = mongoose.model('orders', orderSchema);