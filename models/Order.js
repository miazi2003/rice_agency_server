const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderID: { type: Number, required: true, unique: true }, // Auto-incremented order ID

    customerID: { type: Number, required: true },
    customerName: { type: String, required: true },
    mobile: { type: String },
    address: { type: String },
    joinDate: { type: String },

    orderDate: { type: String, required: true },
    futureOrderDate: { type: String },

    products: [
      {
        productId: { type: Number, required: true },
        productName: { type: String, required: true },
        quantity: { type: Number, default: 1 }, // Optional: add quantity per product
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("orders", orderSchema);
