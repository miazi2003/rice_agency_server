const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  customerID: { type: Number, required: true },
  customerName: { type: String },
  productName: { type: String },
  message: { type: String },
  date: { type: String },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

// 🔥 Prevent duplicate notifications (customerID + date + productName)
notificationSchema.index(
  { customerID: 1, date: 1, productName: 1 },
  { unique: true }
);

module.exports = mongoose.model('notifications', notificationSchema);
