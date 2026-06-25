const express = require('express');
const router = express.Router();
const Plan = require('../models/Plan');
const auth = require('../middleware/authMiddleware'); // <-- 1. Added auth import
const adminMiddleware = require('../middleware/adminMiddleware');

// Get all plans
// <-- 2. Added auth to the middleware array
router.get('/', [auth, adminMiddleware], async (req, res) => {
  try {
    const plansFromDB = await Plan.find().sort({ price: 1 });
    
    if (plansFromDB.length === 0) {
      // Create default plans if none exist
      const defaultPlans = [
        { name: 'Starter', price: 50000, returnPercentage: 4.0, durationDays: 30 },
        { name: 'Growth', price: 100000, returnPercentage: 4.5, durationDays: 30 },
        { name: 'Premium', price: 200000, returnPercentage: 5.0, durationDays: 30 }
      ];
      
      const createdPlans = await Plan.insertMany(defaultPlans);
      return res.json(createdPlans);
    }
    
    res.json(plansFromDB);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get plan by name
// <-- 3. Added auth to the middleware array
router.get('/:name', [auth, adminMiddleware], async (req, res) => {
  try {
    const plan = await Plan.findOne({ name: req.params.name });
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }
    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update plan by name
// <-- 4. Added auth to the middleware array
router.put('/:name', [auth, adminMiddleware], async (req, res) => {
  try {
    const { price, returnPercentage, durationDays } = req.body;
    
    // Validate input
    if (typeof price !== 'number' || price < 0) {
      return res.status(400).json({ message: 'Invalid price' });
    }
    
    if (typeof returnPercentage !== 'number' || returnPercentage < 0 || returnPercentage > 100) {
      return res.status(400).json({ message: 'Invalid return percentage' });
    }
    
    if (typeof durationDays !== 'number' || durationDays < 1) {
      return res.status(400).json({ message: 'Invalid duration days' });
    }
    
    const plan = await Plan.findOneAndUpdate(
      { name: req.params.name },
      { price, returnPercentage, durationDays },
      { new: true, runValidators: true }
    );
    
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }
    
    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;