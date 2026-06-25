const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Store = require('../models/Store');
const auth = require('../middleware/authMiddleware');

// @route   POST api/auth/register
// @desc    Register user & Handle Referral
// @access  Public
router.post('/register', async (req, res) => {
  const { name, email, password, phone, referralCode, store } = req.body;

  try {
    // 1. Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // 2. Create User Object
    user = new User({
      name,
      email,
      password,
      phone,
      // Selected store (will be validated below)
      store: null,
      // Generate unique referral code (e.g., name-1234)
      referralCode: `${name.replace(/\s/g, '').toLowerCase()}-${Math.floor(1000 + Math.random() * 9000)}`
    });

    // 3. Handle Referral Logic
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        user.referredBy = referrer._id;
        
        // Add commission to referrer's wallet (PKR 10,000)
        referrer.walletBalance = (referrer.walletBalance || 0) + 10000;
        await referrer.save();
        
        // Create transaction record for referrer
        const Transaction = require('../models/Transaction');
        await Transaction.create({
          user: referrer._id,
          type: 'referral_commission',
          amount: 10000,
          status: 'approved',
          description: `Referral commission for inviting new user: ${name}`
        });
        
        // Create notification for referrer (type: referral)
        const Notification = require('../models/Notification');
        await Notification.create({
          user: referrer._id,
          type: 'referral',
          message: `🎉 You earned PKR 10,000 commission for referring new user ${name}!`
        });
      }
    }

    // 4. Handle store selection if provided (validate against Store collection)
    if (store) {
      // allow special value 'none' or validate ObjectId
      if (store === 'none') {
        user.store = null;
      } else {
        const s = await Store.findById(store);
        if (!s) {
          return res.status(400).json({ msg: 'Selected store is invalid' });
        }
        user.store = s._id;
      }
    }

    // 5. Encrypt Password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // 6. Save to DB
    await user.save();

    // 7. Return JWT Token
    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 360000 }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Check User
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    // 2. Check Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    // 3. Return Token
    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 360000 }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/auth/user
// @desc    Get logged in user data
// @access  Private
router.get('/user', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    // Log user balance for debugging
    console.log(`[BALANCE LOG] User ${user._id} loaded. Current wallet balance: PKR ${user.walletBalance}`);
    console.log(`[PLAN LOG] User plan status:`, {
      currentPlan: user.currentPlan,
      subscriptionStatus: user.subscriptionStatus,
      hasCompletedFirstPurchase: user.hasCompletedFirstPurchase,
      planActivatedAt: user.planActivatedAt,
      planExpiresAt: user.planExpiresAt
    });
    
    // Check if user needs to purchase a plan (first login after signup)
    const needsPlanPurchase = !user.hasCompletedFirstPurchase && !user.currentPlan;
    const hasActivePlan = !!user.currentPlan && user.subscriptionStatus === 'active';
    
    // Check if plan has expired
    let finalSubscriptionStatus = user.subscriptionStatus;
    if (user.planExpiresAt && new Date() > user.planExpiresAt && user.subscriptionStatus === 'active') {
      finalSubscriptionStatus = 'expired';
      console.log(`[PLAN LOG] Plan expired, updating status to: ${finalSubscriptionStatus}`);
    }
    
    // Include balance calculation info and plan status in response
    res.json({
      ...user.toObject(),
      _balanceInfo: {
        walletBalance: user.walletBalance,
        lastUpdated: new Date().toISOString()
      },
      _planStatus: {
        needsPlanPurchase,
        hasActivePlan: finalSubscriptionStatus === 'active',
        currentPlan: user.currentPlan,
        planActivatedAt: user.planActivatedAt,
        planExpiresAt: user.planExpiresAt,
        hasCompletedFirstPurchase: user.hasCompletedFirstPurchase,
        subscriptionStatus: finalSubscriptionStatus,
        canUpgrade: finalSubscriptionStatus === 'active' || finalSubscriptionStatus === 'expired'
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/auth/logout
// @desc    Logout user (Stateless - Client should delete token)
// @access  Public
router.post('/logout', (req, res) => {
  // Since JWT is stateless, the backend doesn't need to do much.
  // The Client must remove 'token' from localStorage.
  // We just send a success message.
  res.json({ msg: 'Logged out successfully' });
});

module.exports = router;