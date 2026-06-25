const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const User = require('../models/User');
const Investment = require('../models/Investment');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const Plan = require('../models/Plan');
const SystemConfig = require('../models/SystemConfig'); // <-- Required for dynamic referrals
const { processPayment, queryOrderStatus } = require('../utils/paymentGateway');
const { PLANS } = require('../config/plans');

// @route   GET api/plans/referral-config
// @desc    Get current referral payout amount for users
// @access  Public
router.get('/referral-config', async (req, res) => {
    try {
        let config = await SystemConfig.findOne();
        res.json({ 
            referralBonusCap: config ? config.referralBonusCap : 10000 
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/plans
// @desc    Get all available plans (Dynamic from DB with config fallback)
// @access  Public
router.get('/', async (req, res) => {
    try {
        // Try to get dynamic plans from database first
        const plansFromDB = await Plan.find().sort({ price: 1 });
        
        if (plansFromDB.length > 0) {
            return res.json(plansFromDB);
        }

        // Fallback to static config if DB is empty
        const { PLANS } = require('../config/plans');
        res.json(Object.values(PLANS));
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/plans/user
// @desc    Get user's current plan status
// @access  Private
router.get('/user', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Check for active investment
        const activeInvestment = await Investment.findOne({ 
            user: req.user.id, 
            status: 'active' 
        });

        let currentPlan = null;
        let planStatus = 'inactive';
        let planActivatedAt = null;
        let planExpiresAt = null;

        // Priority 1: Check user data first (most reliable)
        if (user.currentPlan) {
            // Check if plan expired
            if (user.planExpiresAt && new Date() > user.planExpiresAt) {
                planStatus = 'expired';
            } else {
                currentPlan = user.currentPlan;
                planStatus = user.subscriptionStatus;
                planActivatedAt = user.planActivatedAt;
                planExpiresAt = user.planExpiresAt;
            }
        } 
        // Priority 2: Fallback to active investment if user data is missing
        else if (activeInvestment) {
            currentPlan = activeInvestment.plan.name;
            planStatus = 'active';
            planActivatedAt = activeInvestment.startDate;
            planExpiresAt = new Date(activeInvestment.startDate);
            planExpiresAt.setDate(planExpiresAt.getDate() + 30); // 30 days duration
        }
        // Priority 3: Fallback for edge cases
        else {
            if (user.currentPlan && user.subscriptionStatus === 'active') {
                currentPlan = user.currentPlan;
                planStatus = 'active';
                planActivatedAt = user.planActivatedAt;
                planExpiresAt = user.planExpiresAt;
            }
        }

        res.json({
            currentPlan,
            planActivatedAt,
            planExpiresAt,
            hasCompletedFirstPurchase: user.hasCompletedFirstPurchase,
            subscriptionStatus: planStatus,
            canUpgrade: planStatus === 'active' || planStatus === 'expired'
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/plans/purchase
// @desc    Purchase a plan with payment gateway integration
// @access  Private
router.post('/purchase', auth, async (req, res) => {
    try {
        const { planName, paymentMethod = 'payment_gateway' } = req.body;

        console.log('Plan purchase request:', { planName, paymentMethod, userId: req.user.id });

        // Get live plan from DB or fallback to config
        let selectedPlan = await Plan.findOne({ name: planName });
        if (!selectedPlan) {
            const { PLANS } = require('../config/plans');
            selectedPlan = PLANS[planName];
        }

        if (!selectedPlan) {
            console.log('Invalid plan selected:', planName);
            return res.status(400).json({ error: 'Invalid plan selected' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            console.log('User not found:', req.user.id);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('User found:', { name: user.name, walletBalance: user.walletBalance });

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1. Single Source of Truth: Check User profile to see if they already have this exact plan active
            if (user.currentPlan === planName && user.subscriptionStatus === 'active') {
                console.log('User already has this plan:', planName);
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: 'You already have this plan' });
            }

            console.log(`User changing plan to ${planName}. Cancelling old investments...`);

            // 2. Bulletproof Cleanup: Cancel ALL existing active investments to kill ghosts
            await Investment.updateMany(
                { user: req.user.id, status: 'active' },
                { $set: { status: 'cancelled' } },
                { session }
            );

            if (paymentMethod === 'wallet') {
                // Check wallet balance
                if (user.walletBalance < selectedPlan.price) {
                    console.log('Insufficient wallet balance:', { 
                        required: selectedPlan.price, 
                        available: user.walletBalance 
                    });
                    await session.abortTransaction();
                    session.endSession();
                    return res.status(400).json({ error: 'Insufficient wallet balance' });
                }

                console.log('Processing wallet payment...');

                // Deduct from wallet
                user.walletBalance -= selectedPlan.price;
                await user.save({ session });

                // Create investment
                const newInvestment = await createInvestment(user._id, selectedPlan, session);
                
                // Record transaction
                await Transaction.create([{
                    user: user._id,
                    type: 'plan_purchase',
                    amount: selectedPlan.price,
                    status: 'approved',
                    description: `Purchased ${planName} plan`
                }], { session });

                // Update user subscription status
                user.currentPlan = planName;
                user.planActivatedAt = new Date();
                user.planExpiresAt = new Date(Date.now() + (selectedPlan.durationDays || 30) * 24 * 60 * 60 * 1000); 
                user.hasCompletedFirstPurchase = true;
                user.subscriptionStatus = 'active';
                await user.save({ session });

                // Create notification
                await Notification.create([{
                    user: user._id,
                    type: 'plan_subscribed',
                    message: `Congratulations! You have successfully subscribed to the ${planName} plan. Your plan will expire on ${user.planExpiresAt.toLocaleDateString()}.`
                }], { session });

                await session.commitTransaction();
                session.endSession();

                console.log('Wallet payment successful:', { planName, newBalance: user.walletBalance });

                res.json({
                    success: true,
                    message: `${planName} plan activated successfully!`,
                    plan: {
                        name: planName,
                        activatedAt: user.planActivatedAt,
                        expiresAt: user.planExpiresAt
                    }
                });

            } else {
                console.log('Processing payment gateway payment...');
                
                const paymentResult = await processPayment({
                    orderId: `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    amount: selectedPlan.price,
                    description: `Purchase ${planName} Plan`,
                    returnUrl: `${process.env.VITE_APP_URL}/return-url`
                });

                console.log('Payment gateway result:', paymentResult);

                if (!paymentResult.success) {
                    console.log('Payment gateway failed:', paymentResult.error);
                    await session.abortTransaction();
                    session.endSession();
                    return res.status(400).json({ 
                        error: 'Payment initiation failed',
                        details: paymentResult.error 
                    });
                }

                user.pendingPlanPurchase = {
                    planName,
                    transactionId: paymentResult.transactionId,
                    amount: selectedPlan.price,
                    initiatedAt: new Date()
                };
                await user.save({ session });

                await session.commitTransaction();
                session.endSession();

                res.json({
                    success: true,
                    message: 'Payment initiated successfully',
                    ...paymentResult
                });
            }
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    } catch (err) {
        console.error('Plan purchase error:', err);
        res.status(500).json({ error: err.message });
    }
});

// @route   POST api/plans/upgrade
// @desc    Upgrade to a higher plan
// @access  Private
router.post('/upgrade', auth, async (req, res) => {
    try {
        const { planName } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get requested plan from DB or config
        let selectedPlan = await Plan.findOne({ name: planName });
        if (!selectedPlan) {
            const { PLANS } = require('../config/plans');
            selectedPlan = PLANS[planName];
        }

        if (!selectedPlan) return res.status(400).json({ error: 'Invalid plan selected' });

        // Get current plan from DB or config
        let currentPlan = await Plan.findOne({ name: user.currentPlan });
        if (!currentPlan) {
            const { PLANS } = require('../config/plans');
            currentPlan = PLANS[user.currentPlan];
        }

        if (!currentPlan) {
            return res.status(400).json({ error: 'No active plan found to upgrade' });
        }

        if (selectedPlan.price <= currentPlan.price) {
            return res.status(400).json({ error: 'You can only upgrade to a higher plan' });
        }

        const upgradeCost = selectedPlan.price - currentPlan.price;

        if (user.walletBalance < upgradeCost) {
            return res.status(400).json({ error: 'Insufficient wallet balance for upgrade' });
        }

        // Deduct upgrade cost
        user.walletBalance -= upgradeCost;
        await user.save();

        // Bulletproof Cleanup: Cancel ALL existing active investments
        await Investment.updateMany(
            { user: req.user.id, status: 'active' },
            { $set: { status: 'cancelled' } }
        );

        // Create new investment
        const newInvestment = await createInvestment(user._id, selectedPlan);

        // Record upgrade transaction
        await Transaction.create({
            user: user._id,
            type: 'plan_upgrade',
            amount: upgradeCost,
            status: 'approved',
            description: `Upgraded from ${currentPlan.name} to ${planName}`
        });

        // Update user subscription
        user.currentPlan = planName;
        user.planActivatedAt = new Date();
        user.planExpiresAt = new Date(Date.now() + (selectedPlan.durationDays || 30) * 24 * 60 * 60 * 1000);
        user.subscriptionStatus = 'active';
        await user.save();

        res.json({
            success: true,
            message: `Successfully upgraded to ${planName} plan!`,
            plan: {
                name: planName,
                activatedAt: user.planActivatedAt,
                expiresAt: user.planExpiresAt
            }
        });

    } catch (err) {
        console.error('Plan upgrade error:', err);
        res.status(500).json({ error: err.message });
    }
});

// @route   POST api/plans/callback
// @desc    Handle payment callback for plan purchases
// @access  Public
router.post('/callback', async (req, res) => {
    try {
        const responseData = req.body;
        const orderId = req.query.orderId ||
            responseData.TransactionReferenceNumber ||
            responseData.TransactionID ||
            responseData.O;

        const user = await User.findOne({ 'pendingPlanPurchase.transactionId': orderId });
        if (!user) {
            return res.status(404).json({ error: 'User not found for this transaction' });
        }

        const pendingPurchase = user.pendingPlanPurchase;
        
        // Fetch pending plan from DB or config
        let selectedPlan = await Plan.findOne({ name: pendingPurchase.planName });
        if (!selectedPlan) {
            const { PLANS } = require('../config/plans');
            selectedPlan = PLANS[pendingPurchase.planName];
        }

        const status = String(responseData.TransactionStatus || responseData.Status || '').toLowerCase();

        if (status === 'paid' || status === 'success' || status === 'approved') {
            await completePendingPlanPurchase(user, selectedPlan);
            res.json({
                success: true,
                message: 'Plan purchase completed successfully'
            });
        } else {
            user.pendingPlanPurchase = undefined;
            await user.save();

            res.json({
                success: false,
                message: 'Plan purchase failed'
            });
        }
    } catch (err) {
        console.error('Plan callback error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/return-url', async (req, res) => {
    try {
        const orderId = req.query.orderId || req.query.O || req.query.o;
        if (!orderId) {
            return res.redirect('/dashboard?payment=error&message=Missing+order+id');
        }

        const bankResponse = await queryOrderStatus(orderId);
        const user = await User.findOne({ 'pendingPlanPurchase.transactionId': orderId });
        if (!user) {
            return res.redirect(`/dashboard?payment=error&message=Plan+purchase+not+found`);
        }

        if (String(bankResponse?.TransactionStatus || '').toLowerCase() !== 'paid') {
            user.pendingPlanPurchase = undefined;
            await user.save();
            return res.redirect(`/dashboard?payment=cancelled&orderId=${encodeURIComponent(orderId)}`);
        }

        const pendingPurchase = user.pendingPlanPurchase;
        let selectedPlan = await Plan.findOne({ name: pendingPurchase.planName });
        if (!selectedPlan) {
            const { PLANS } = require('../config/plans');
            selectedPlan = PLANS[pendingPurchase.planName];
        }

        await completePendingPlanPurchase(user, selectedPlan);
        return res.redirect(`/dashboard?payment=success&orderId=${encodeURIComponent(orderId)}`);
    } catch (err) {
        console.error('Plan return error:', err);
        return res.redirect(`/dashboard?payment=error&message=${encodeURIComponent(err.message)}`);
    }
});

async function completePendingPlanPurchase(user, selectedPlan) {
    const pendingPurchase = user.pendingPlanPurchase;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        await Investment.updateMany(
            { user: user._id, status: 'active' },
            { $set: { status: 'cancelled' } },
            { session }
        );

        await createInvestment(user._id, selectedPlan, session);

        await Transaction.create([{
            user: user._id,
            type: 'plan_purchase',
            amount: pendingPurchase.amount,
            status: 'approved',
            description: `Purchased ${pendingPurchase.planName} plan`
        }], { session });

        user.currentPlan = pendingPurchase.planName;
        user.planActivatedAt = new Date();
        user.planExpiresAt = new Date(Date.now() + (selectedPlan.durationDays || 30) * 24 * 60 * 60 * 1000);
        user.hasCompletedFirstPurchase = true;
        user.subscriptionStatus = 'active';
        user.pendingPlanPurchase = undefined;
        await user.save({ session });

        await Notification.create([{
            user: user._id,
            type: 'plan_subscribed',
            message: `Congratulations! Your payment for the ${pendingPurchase.planName} plan has been successful. Your plan is now active and will expire on ${user.planExpiresAt.toLocaleDateString()}.`
        }], { session });

        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
}

// Helper function to create investment
async function createInvestment(userId, plan, session = null) {
    const newInvestment = new Investment({
        user: userId,
        status: 'active',
        plan: {
            name: plan.name,
            price: plan.price,
            dailySales: plan.dailyMaxSales || 5,
            returnRate: plan.returnPercentage,
            dailyMinSales: plan.dailyMinSales || 2,
            dailyMaxSales: plan.dailyMaxSales || 5
        },
        totalStock: 100,
        startDate: new Date(),
        lastProcessedDate: new Date(),
        itemsSold: 0,
        accumulatedReturn: 0
    });

    if (session) {
        await newInvestment.save({ session });
    } else {
        await newInvestment.save();
    }
    return newInvestment;
}

module.exports = router;
