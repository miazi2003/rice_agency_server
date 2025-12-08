// models/Product.js
const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema({
  productID: Number,
  name: String,
  category: String,
  details: String,
  price: Number,
  quality: String,

  // 👇 নতুন স্টক ফিল্ড
  stock: {
    type: Number,
    required: true,
    default: 0,
  }
});

module.exports = mongoose.model("Product", ProductSchema);
