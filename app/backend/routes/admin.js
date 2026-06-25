const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const { sendWithdrawalApprovedEmail } = require('../utils/emailService');
const ProductModel = require('../models/Product');
const Notification = require('../models/Notification');
const Store = require('../models/Store');
const Plan = require('../models/Plan');
const SystemConfig = require('../models/SystemConfig'); // <-- Added Database Model

// @route   GET api/admin/stats
// @desc    Get Global Dashboard Stats + ALL Activity
router.get('/stats', [auth, admin], async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    
    // 1. Calculate Totals
    const allTransactions = await Transaction.find({});
    
    const totalDeposited = allTransactions
      .filter(t => t.type === 'deposit')
      .reduce((acc, curr) => acc + curr.amount, 0);

    const pendingWithdrawals = allTransactions
      .filter(t => t.type === 'withdrawal' && t.status === 'pending')
      .reduce((acc, curr) => acc + curr.amount, 0);

    const totalPayouts = allTransactions
      .filter(t => t.type === 'withdrawal' && t.status === 'approved')
      .reduce((acc, curr) => acc + curr.amount, 0);

    // 2. Fetch ALL Transactions (Sorted Newest First)
    const recentTransactions = await Transaction.find({})
      .sort({ createdAt: -1 }) 
      .populate('user', 'name'); 

    res.json({
      totalUsers,
      totalDeposited,
      pendingWithdrawals,
      totalPayouts,
      recentTransactions 
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/admin/withdrawals
// @desc    Get all withdrawal requests
router.get('/withdrawals', [auth, admin], async (req, res) => {
  try {
    // Populate user details (name) to show in the table
    const withdrawals = await Transaction.find({ type: 'withdrawal' })
      .populate('user', 'name')
      .sort({ createdAt: -1 }); // Newest first

    res.json(withdrawals);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/admin/withdrawals/:id
// @desc    Approve or Reject a withdrawal
router.put('/withdrawals/:id', [auth, admin], async (req, res) => {
  const { status } = req.body; // 'approved' or 'rejected'

  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ msg: 'Transaction not found' });
    if (tx.status !== 'pending') return res.status(400).json({ msg: 'Transaction already processed' });

    tx.status = status;
    await tx.save();

    // IF APPROVED: Send Email to User
    if (status === 'approved') {
      const user = await User.findById(tx.user);
      if (user) {
          // Send email notification
          try {
              await sendWithdrawalApprovedEmail(user.email, user.name, tx.amount);
          } catch (emailErr) {
              console.error("Email sending failed", emailErr);
              // Continue execution even if email fails
          }
      }
    }

    // IF REJECTED: Refund the money back to user wallet
    if (status === 'rejected') {
      const user = await User.findById(tx.user);
      if (user) {
          user.walletBalance += tx.amount;
          await user.save();
      }
    }

    res.json(tx);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/admin/transactions
// @desc    Get full transaction history sorted by date
router.get('/transactions', [auth, admin], async (req, res) => {
  try {
    const transactions = await Transaction.find({})
      .sort({ createdAt: -1 }) // Latest first
      .populate('user', 'name email'); // Get user details
    
    res.json(transactions);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/admin/orders
// @desc    Get ALL orders from ALL users (Newest first)
// @access  Private (Admin only)
router.get('/orders', [auth, admin], async (req, res) => {
    try {
        // Fetch all orders and populate user details
        // FIX: Changed 'phoneNumber' to 'phone' to match User Schema
        const orders = await Order.find()
            .populate('user', 'name email phone') 
            .sort({ createdAt: -1 }); 

        res.json(orders);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/admin/orders/:id
// @desc    Update order status (e.g. Processing -> Approved -> Auto-Selling)
// @access  Private (Admin only)
router.put('/orders/:id', [auth, admin], async (req, res) => {
    const { status } = req.body;

    try {
        let order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }

        // Update the status
        order.status = status;
        
        // If status is changed to 'approved', decrease product inventory
        if (status === 'approved') {
            // Use 'product' field instead of 'productId'
            const product = await ProductModel.findById(order.product);
            if (product) {
                console.log(`Decreasing inventory for ${product.name}: ${product.quantity} - ${order.quantity} = ${product.quantity - order.quantity}`);
                product.quantity -= order.quantity;
                await product.save();
                console.log(`Inventory updated: ${product.name} now has ${product.quantity} items`);
            } else {
                console.log('Product not found for order:', order._id);
            }
        }
        
        // If status is changed to 'auto-selling', initialize the auto-sell tracking
        if (status === 'auto-selling') {
            order.itemsSold = 0;
            order.totalQuantity = order.quantity;
            order.lastProcessedDate = new Date();
            // Note: User notification only sent when auto-sell completes (in simulationScheduler.js)
        }
        
        await order.save();

        // Send notification to user when order is approved
        if (status === 'approved') {
            await Notification.create({
                user: order.user,
                type: 'product_autosold',
                message: `🎉 Your order for ${order.productName} (Qty: ${order.quantity}) has been approved!`,
                isRead: false
            });
        }

        // Return the updated order with user details populated so the UI updates instantly
        await order.populate('user', 'name email phone');
        
        res.json(order);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

  // @route   PUT api/admin/users/:id/subscription
  // @desc    Update a user's subscription tier (1,2,3)
  // @access  Private (Admin only)
  router.put('/users/:id/subscription', [auth, admin], async (req, res) => {
    const { subscriptionTier } = req.body;

    try {
      if (![1,2,3].includes(Number(subscriptionTier))) {
        return res.status(400).json({ msg: 'subscriptionTier must be 1, 2 or 3' });
      }

      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ msg: 'User not found' });

      user.subscriptionTier = Number(subscriptionTier);
      await user.save();

      res.json({ msg: 'Subscription tier updated', user });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

  // ------------------ Stores management ------------------
  // @route   POST api/admin/stores
  // @desc    Create a store (Admin only)
  router.post('/stores', [auth, admin], async (req, res) => {
    const { name, description } = req.body;
    try {
      if (!name) return res.status(400).json({ msg: 'Store name is required' });
      const exists = await Store.findOne({ name });
      if (exists) return res.status(400).json({ msg: 'Store already exists' });
      const store = new Store({ name, description });
      await store.save();
      res.json(store);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

  // @route   GET api/admin/stores
  // @desc    List all stores
  router.get('/stores', [auth, admin], async (req, res) => {
    try {
      const stores = await Store.find().sort({ name: 1 });
      res.json(stores);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

  // @route   DELETE api/admin/stores/:id
  // @desc    Delete a store
  router.delete('/stores/:id', [auth, admin], async (req, res) => {
    try {
      const store = await Store.findById(req.params.id);
      if (!store) return res.status(404).json({ msg: 'Store not found' });
      await store.deleteOne();
      res.json({ msg: 'Store removed' });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

// ------------------ Product trending toggle ------------------
  // @route   PUT api/admin/products/:id/trendy
  // @desc    Mark/unmark product as trendy
  router.put('/products/:id/trendy', [auth, admin], async (req, res) => {
    const { trendy } = req.body; // boolean
    try {
      const product = await ProductModel.findById(req.params.id);
      if (!product) return res.status(404).json({ msg: 'Product not found' });
      product.trendy = !!trendy;
      await product.save();
      res.json(product);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

  // ------------------ Plan Management ------------------
  // @route   GET api/admin/plans
  // @desc    Get all plans (from database with fallback to defaults)
  router.get('/plans', [auth, admin], async (req, res) => {
    try {
      // Try to get plans from database
      const plans = await Plan.find();
      
      if (plans.length === 0) {
        // Fallback to default plans if none exist in database
        const { PLANS } = require('../config/plans');
        res.json(Object.values(PLANS));
      } else {
        res.json(plans);
      }
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

  // @route   PUT api/admin/plans/:name
  // @desc    Update plan details (price, return percentage, etc.)
  router.put('/plans/:name', [auth, admin], async (req, res) => {
    const { name } = req.params;
    const { price, returnPercentage, durationDays } = req.body;

    try {
      // Validate required fields
      if (typeof price !== 'number' || price <= 0) {
        return res.status(400).json({ msg: 'Valid price is required' });
      }
      if (typeof returnPercentage !== 'number' || returnPercentage <= 0 || returnPercentage > 100) {
        return res.status(400).json({ msg: 'Return percentage must be between 0 and 100' });
      }
      if (typeof durationDays !== 'number' || durationDays <= 0) {
        return res.status(400).json({ msg: 'Valid duration days is required' });
      }

      // Find existing plan or create new one
      let plan = await Plan.findOne({ name });
      
      if (plan) {
        // Update existing plan
        plan.price = price;
        plan.returnPercentage = returnPercentage;
        plan.durationDays = durationDays;
        await plan.save();
      } else {
        // Create new plan
        plan = new Plan({
          name,
          price,
          returnPercentage,
          durationDays
        });
        await plan.save();
      }

      res.json({ msg: 'Plan updated successfully', plan });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

  // ------------------ Referral Configuration ------------------
  // @route   GET api/admin/referral-config
  // @desc    Get current referral configuration
  router.get('/referral-config', [auth, admin], async (req, res) => {
    try {
      // Fetch from database
      let config = await SystemConfig.findOne();
      
      // Seed default if database is empty
      if (!config) {
        config = await SystemConfig.create({
          referralBonusCap: 10000
        });
      }
      
      res.json(config);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

  // @route   PUT api/admin/referral-config
  // @desc    Update referral configuration
  router.put('/referral-config', [auth, admin], async (req, res) => {
    const { referralBonusCap } = req.body;

    try {
      // Validate input
      if (typeof referralBonusCap !== 'number' || referralBonusCap < 0) {
        return res.status(400).json({ msg: 'Referral bonus amount must be a positive number' });
      }

      // Update database
      let config = await SystemConfig.findOne();
      if (!config) {
        config = new SystemConfig();
      }

      config.referralBonusCap = referralBonusCap;
      await config.save();

      res.json({ 
        msg: 'Referral configuration updated successfully',
        config
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

module.exports = router;