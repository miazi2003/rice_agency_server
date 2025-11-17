const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  role: { type: String, required: true },
  // add other user fields as needed
}, { timestamps: true });

module.exports = mongoose.model('users', userSchema);