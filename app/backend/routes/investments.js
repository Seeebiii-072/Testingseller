const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Investment = require('../models/Investment');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Plan = require('../models/Plan');

// @route   GET api/investments/active
router.get('/active', auth, async (req, res) => {
    try {
        let investment = await Investment.findOne({ 
            user: req.user.id, 
            status: 'active' 
        });

        if (!investment) {
            return res.json(null);
        }

        // Get stock limit outside the block for use in response
        const stockLimit = investment.totalStock || 100;

        // --- SIMULATION LOGIC (only run once per day) ---
        const now = new Date();
        const lastUpdate = new Date(investment.lastProcessedDate || investment.startDate);
        
        // Check if already processed today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const lastProcessed = new Date(lastUpdate);
        lastProcessed.setHours(0, 0, 0, 0);
        
        // Only run if not already processed today
        if (lastProcessed.getTime() !== today.getTime()) {
            const todayMidnight = new Date(now.setHours(0,0,0,0));
            const lastMidnight = new Date(lastUpdate.setHours(0,0,0,0));
            const diffTime = Math.abs(todayMidnight - lastMidnight);
            const daysPassed = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

            if (daysPassed > 0 && investment.itemsSold < stockLimit) {
                
                // Handle naming mismatch for simulation
                const min = investment.plan.dailyMinSales || 1;
                // If strictly "dailySales" exists, use it as max, otherwise use dailyMaxSales
                const max = investment.plan.dailyMaxSales || investment.plan.dailySales || 2;
                const profitRate = investment.plan.returnPercentage || investment.plan.returnRate || 4.0;

                let newSales = 0;
                let newProfit = 0;

                for (let i = 0; i < daysPassed; i++) {
                    if (investment.itemsSold + newSales >= stockLimit) break;

                    const actualSales = Math.floor(Math.random() * (max - min + 1)) + min;
                    const dailyProfit = (investment.plan.price * (profitRate / 100)) / 30;

                    newSales += actualSales;
                    newProfit += dailyProfit;
                }

                // Only update if there are new sales
                if (newSales > 0) {
                    investment.itemsSold += newSales;
                    investment.accumulatedReturn += newProfit;
                    investment.lastProcessedDate = new Date();

                    // CRITICAL FIX: Actually add profit to user's wallet!
                    const user = await User.findById(req.user.id);
                    if (user && newProfit > 0) {
                        const previousBalance = user.walletBalance;
                        user.walletBalance += newProfit;
                        await user.save();
                        
                        // Log balance addition for investment profit
                        console.log(`[BALANCE LOG] Investment Profit - User ${user._id}, Previous Balance: PKR ${previousBalance}, Profit Added: PKR ${newProfit.toFixed(2)}, New Balance: PKR ${user.walletBalance}`);
                        
                        // Also create transaction record
                        await Transaction.create({
                            user: user._id,
                            type: 'investment_profit',
                            amount: newProfit,
                            status: 'approved',
                            description: `Daily profit from ${investment.plan.name} investment`
                        });
                        
                        console.log(`[BALANCE LOG] Investment ${investment.plan.name} - ${newSales} items sold, Profit: PKR ${newProfit.toFixed(2)}`);
                    }

                    if (investment.itemsSold >= stockLimit) {
                        investment.status = 'completed';
                        
                        // Add final payout to wallet (capital + remaining profit)
                        const finalPayout = investment.plan.price + (investment.expectedProfit - investment.accumulatedReturn);
                        if (user && finalPayout > 0) {
                            const balanceBeforeFinal = user.walletBalance;
                            user.walletBalance += finalPayout;
                            await user.save();
                            
                            console.log(`[BALANCE LOG] Investment Completed - User ${user._id}, Capital Return: PKR ${investment.plan.price}, Final Profit: PKR ${(finalPayout - investment.plan.price).toFixed(2)}, Balance Before: PKR ${balanceBeforeFinal}, Balance After: PKR ${user.walletBalance}`);
                        }
                    }

                    await investment.save();
                }
            }
        }

        // Include balance logs in response for frontend developer tools
        const user = await User.findById(req.user.id);
        res.json({
            ...investment.toObject(),
            _balanceLogs: {
                currentWalletBalance: user ? user.walletBalance : 0,
                totalAccumulatedReturn: investment.accumulatedReturn,
                itemsSold: investment.itemsSold,
                totalItems: stockLimit,
                timestamp: new Date().toISOString()
            }
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/investments/buy
router.post('/buy', auth, async (req, res) => {
    try {
        const { planName } = req.body; 

        // 1. Validate the Plan Name (from database)
        const selectedPlan = await Plan.findOne({ name: planName });
        if (!selectedPlan) {
            return res.status(400).json({ msg: "Invalid Plan Selected" });
        }

        // 2. Check if user already has an active plan
        const existing = await Investment.findOne({ user: req.user.id, status: 'active' });
        if (existing) {
            return res.status(400).json({ msg: "You already have an active plan" });
        }

        // 3. Create the Investment (CRITICAL MAPPING FIX)
        const newInvestment = new Investment({
            user: req.user.id,
            status: 'active',
            
            // MAP DATA: Translate "Plan Model" names to "Investment Schema" names
            plan: {
                name: selectedPlan.name,
                price: selectedPlan.price,
                
                // MAPPING 1: Schema wants 'dailySales', we give it the average or max
                dailySales: selectedPlan.dailyMaxSales || 5, 
                
                // MAPPING 2: Schema wants 'returnRate', we give it 'returnPercentage'
                returnRate: selectedPlan.returnPercentage,
                
                // Keep these for future reference if schema allows
                dailyMinSales: selectedPlan.dailyMinSales || 2,
                dailyMaxSales: selectedPlan.dailyMaxSales || 5
            },
            
            // Set a default stock limit since totalItems is no longer available
            totalStock: 100,
            
            startDate: new Date(),
            lastProcessedDate: new Date(),
            itemsSold: 0,
            accumulatedReturn: 0
        });

        await newInvestment.save();

        // 4. Record the Transaction
        const newTx = new Transaction({
            user: req.user.id,
            type: 'deposit',
            amount: selectedPlan.price,
            description: `Purchased ${planName} Plan`,
            status: 'approved'
        });
        await newTx.save();

        res.json(newInvestment);

    } catch (err) {
        console.error("Investment Error:", err.message);
        // Send the specific error message to the frontend/logs
        res.status(500).send('Investment Failed: ' + err.message);
    }
});

module.exports = router;