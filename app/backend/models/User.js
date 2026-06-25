const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  
  // Subscription System
  currentPlan: { type: String, default: null }, // Plan name (Starter, Growth, Premium)
  planActivatedAt: { type: Date, default: null },
  planExpiresAt: { type: Date, default: null },
  hasCompletedFirstPurchase: { type: Boolean, default: false }, // Track if user has bought a plan
  subscriptionStatus: { type: String, enum: ['inactive', 'active', 'expired'], default: 'inactive' },
  pendingPlanPurchase: {
    planName: String,
    transactionId: String,
    amount: Number,
    initiatedAt: Date
  },
  // User tier (1 = first tier, 2 = second, 3 = third)
  tier: { type: Number, enum: [1, 2, 3], default: 1 },
  
  // The Wallet
  walletBalance: { type: Number, default: 0 }, // Available to withdraw
  
  // Affiliate System
  referralCode: { type: String, unique: true }, // Their unique code
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who invited them
  // Selected store for reselling products. Null or undefined means 'none'.
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
