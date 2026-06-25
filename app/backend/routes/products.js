const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware'); // Ensure you have this middleware
const Product = require('../models/Product');
const User = require('../models/User');

// @route   GET api/products
// @desc    Get all products (Visible to all logged in users)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    // Get the logged in user's subscription tier based on their plan
    const user = await User.findById(req.user.id).select('currentPlan store');
    let subscriptionTier = 1; // Default to tier 1 (Starter)

    if (user && user.currentPlan) {
      // Map plans to tiers
      const planToTier = {
        'Starter': 1,
        'Growth': 2, 
        'Premium': 3
      };
      subscriptionTier = planToTier[user.currentPlan] || 1;
    }

    // Build base filter: products available to user's subscription tier
    const baseFilter = { tier: { $lte: subscriptionTier } };

    // If user selected a store, only include products that are either global (no stores) or include that store
    if (user && user.store) {
      baseFilter.$or = [
        { stores: { $exists: true, $size: 0 } },
        { stores: { $exists: true, $in: [user.store] } }
      ];
    }

    const products = await Product.find(baseFilter).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/products
// @desc    Create a product (Admin Only)
// @access  Private (Admin)
router.post('/', [auth, admin], async (req, res) => {
  // Destructure image, tier, roi, trendy and stores from body
  const { name, price, quantity, description, image, tier, roi, trendy, stores } = req.body; 
  try {
    const newProduct = new Product({
      name,
      price,
      quantity,
      description,
      image, // Save it
      tier: tier && [1,2,3].includes(Number(tier)) ? Number(tier) : 1,
      roi: roi ? Number(roi) : 0,
      trendy: !!trendy,
      stores: Array.isArray(stores) ? stores : []
    });
    const product = await newProduct.save();
    res.json(product);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/products/:id
// @desc    Update a product (Admin Only) - Used for adding stock/updating details
// @access  Private (Admin)
router.put('/:id', [auth, admin], async (req, res) => {
  try {
    let product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    // Use findByIdAndUpdate to apply the new changes. 
    // { new: true } ensures it returns the newly updated document instead of the old one.
    product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: req.body }, 
      { new: true, runValidators: true }
    );

    res.json(product);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Product not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/products/:id
// @desc    Delete a product (Admin Only)
// @access  Private (Admin)
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ msg: 'Product not found' });
    
    await product.deleteOne();
    res.json({ msg: 'Product removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;