const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product: { // Reference to the product just in case
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  productName: { // Stored as string so it remains even if product is deleted
    type: String,
    required: true
  },
  productImage: {
    type: String
  },
  quantity: {
    type: Number,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'approved', 'cancelled', 'auto-selling', 'completed'],
    default: 'processing' // Default to processing since payment "succeeded"
  },
  paymentMethod: {
    type: String,
    default: 'Bank Alfalah Gateway'
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'],
    default: 'PENDING'
  },
  transactionId: {
    type: String
  },
  bankResponse: {
    type: Object
  },
  // --- AUTO-SELL TRACKING FIELDS ---
  itemsSold: {
    type: Number,
    default: 0
  },
  totalQuantity: {
    type: Number,
    required: true
  },
  expectedProfit: {
    type: Number,
    default: 0
  },
  lastProcessedDate: {
    type: Date,
    default: Date.now
  },
  // Price per item (for profit calculation)
  pricePerItem: {
    type: Number,
    required: true
  },
  roi: {
    type: Number,
    default: 0
  },
  // User tier at the time of order (for tracking purposes)
  userTier: {
    type: Number,
    enum: [1, 2, 3],
    default: 1
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Order', OrderSchema);
