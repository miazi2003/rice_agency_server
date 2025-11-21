const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  customerID: { type: Number, required: true, unique: true },
  customerName: { type: String },          // তুমি frontend-এ name ব্যবহার করছ
  address: { type: String },
  phone: { type: String },
  joinDate: { type: String },

  // lastOrder should be an array
  lastOrder: [
    {
      productId: Number,
      productName: String,
      orderDate: String,
    }
  ],
}, { timestamps: true });

module.exports = mongoose.model("customers", customerSchema);
