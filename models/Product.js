const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    productID: {
      type: Number,
      required: true,
      unique: true,
    },
    name: { type: String, required: true },
    category: { type: String, required: true },
    details: { type: String, required: true },
    price: { type: Number, required: true },
    quality: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("products", productSchema);
