const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
  referralBonusCap: {
    type: Number,
    default: 10000 // Fixed amount in PKR
  }
}, { 
  timestamps: true // Automatically handles createdAt and updatedAt without needing any hooks!
});

module.exports = mongoose.model('SystemConfig', systemConfigSchema);