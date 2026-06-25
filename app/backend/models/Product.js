const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, default: 0 },
  description: { type: String },
  // Added image field (Stores URL)
  image: { type: String, default: 'https://placehold.co/400' }, 
  // Required subscription tier for this product (1 = first tier, 2 = second, 3 = third)
  tier: { type: Number, enum: [1, 2, 3], default: 1 },
  // Return on Investment (percentage or absolute number depending on business logic)
  roi: { type: Number, default: 0 },
  // Whether this product is marked as trendy by admin
  trendy: { type: Boolean, default: false },
  // Stores this product is available to for reselling (references Store collection)
  stores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', ProductSchema);