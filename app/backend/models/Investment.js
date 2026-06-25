const mongoose = require('mongoose');

const InvestmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  plan: {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    returnRate: { type: String, required: true }, // e.g., "4%"
    dailySales: { type: String, required: true }  // e.g., "1-2 items"
  },
  totalStock: {
    type: Number,
    required: true
  },
  itemsSold: {
    type: Number,
    default: 0
  },
  accumulatedReturn: {
    type: Number,
    default: 0.0
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  // --- NEW FIELD ---
  lastProcessedDate: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Investment', InvestmentSchema);