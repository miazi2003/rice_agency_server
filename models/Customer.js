const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  customerID: { type: Number, required: true, unique: true },

  customerName: { type: String },  // ← name from frontend
  phone: { type: String },
  altPhone: { type: String },
  whatsapp: { type: String },

  houseNumber: { type: String },
  roadNumber: { type: String },
  blockNumber: { type: String },

  address: { type: String },
  joinDate: { type: String },

  lastOrder: [
    {
      productId: Number,
      productName: String,
      orderDate: String,
    }
  ],

}, { timestamps: true });

module.exports = mongoose.model("customers", customerSchema);
