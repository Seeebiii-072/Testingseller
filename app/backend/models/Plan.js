const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['Starter', 'Growth', 'Premium']
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  returnPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  durationDays: {
    type: Number,
    required: true,
    min: 1
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
planSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Plan', planSchema);