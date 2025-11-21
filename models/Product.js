const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productID: { type: Number, required: true, unique: true },
  productName: { type: String },
  // add other product fields as needed
}, { timestamps: true });

module.exports = mongoose.model('products', productSchema);