const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    customerID: { type: Number, required: true },
    customerName: { type: String },
    mobile: { type: String },
    address: { type: String },
    joinDate: { type: String },

    orderDate: { type: String, required: true },
    futureOrderDate: { type: String },

    products: [
      {
        productId: { type: Number, required: true },
        productName: { type: String, required: true },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("orders", orderSchema);
