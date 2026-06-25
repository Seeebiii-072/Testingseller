const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { sendWithdrawalRequestEmail } = require('../utils/emailService'); // <--- ADDED EMAIL IMPORT

// @route   GET api/wallet/history
// @desc    Get all transactions for the logged-in user
// @access  Private
router.get('/history', auth, async (req, res) => {
  try {
    const history = await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 });
    
    // Log transaction history fetch
    console.log(`[BALANCE LOG] Fetched ${history.length} transactions for user ${req.user.id}`);
    
    res.json(history);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Helper function to add balance calculation logs to response headers
const addBalanceLogHeader = (res, logMessage) => {
  const existingLogs = res.getHeader('X-Balance-Logs') || '';
  const newLogs = existingLogs ? `${existingLogs} | ${logMessage}` : logMessage;
  res.setHeader('X-Balance-Logs', newLogs);
};

// @route   POST api/wallet/withdraw
// @desc    Submit a withdrawal request
// @access  Private
router.post('/withdraw', auth, async (req, res) => {
  const { amount, bankName, accountNumber, accountTitle } = req.body;

  try {
    // 1. Get User to check balance
    const user = await User.findById(req.user.id);
    
    // Log current balance
    console.log(`[BALANCE LOG] User ${user._id} - Current Balance: PKR ${user.walletBalance}`);
    addBalanceLogHeader(res, `Current Balance: PKR ${user.walletBalance}`);

    // 2. Validation
    if (amount < 1000) {
      return res.status(400).json({ msg: 'Minimum withdrawal is PKR 1,000' });
    }
    if (user.walletBalance < amount) {
      console.log(`[BALANCE LOG] Withdrawal FAILED - Insufficient balance. Requested: PKR ${amount}, Available: PKR ${user.walletBalance}`);
      addBalanceLogHeader(res, `Insufficient balance. Requested: PKR ${amount}, Available: PKR ${user.walletBalance}`);
      return res.status(400).json({ msg: 'Insufficient wallet balance' });
    }

    // 3. Deduct Balance IMMEDIATELY (Prevent double-spending)
    const previousBalance = user.walletBalance;
    user.walletBalance -= amount;
    await user.save();
    
    // Log balance deduction
    console.log(`[BALANCE LOG] Withdrawal - Previous Balance: PKR ${previousBalance}, Amount Deducted: PKR ${amount}, New Balance: PKR ${user.walletBalance}`);
    addBalanceLogHeader(res, `Withdrawal: PKR ${previousBalance} - ${amount} = PKR ${user.walletBalance}`);

    // 4. Create Transaction Record
    const newTx = new Transaction({
      user: req.user.id,
      type: 'withdrawal',
      amount: amount,
      status: 'pending', // Waiting for Admin
      bankDetails: {
        bankName,
        accountNumber,
        accountTitle
      },
      description: `Withdrawal to ${bankName}`
    });

    await newTx.save();

    // --- 5. SEND EMAIL ALERT ---
    // Notifies Admin that someone requested money
    sendWithdrawalRequestEmail(user.name, amount, bankName);

    console.log(`[BALANCE LOG] Withdrawal completed. Final Balance: PKR ${user.walletBalance}`);
    addBalanceLogHeader(res, `Final Balance: PKR ${user.walletBalance}`);
    
    // Include balance calculation details in response for frontend developer tools
    res.json({ 
      msg: 'Withdrawal requested successfully', 
      balance: user.walletBalance,
      _balanceLogs: {
        previousBalance: previousBalance,
        amountWithdrawn: amount,
        newBalance: user.walletBalance,
        timestamp: new Date().toISOString()
      }
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;