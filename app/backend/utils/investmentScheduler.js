const cron = require('node-cron');
const Investment = require('../models/Investment');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const PlanConfig = require('../models/PlanConfig');
const { sendReferralBonusEmail } = require('./emailService');

// Schedule the investment simulation to run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('Running investment simulation...');
  await runSimulation();
}, {
  scheduled: true,
  timezone: 'Asia/Karachi'
});

async function runSimulation() {
  try {
    const now = new Date();
    const investments = await Investment.find({ status: 'active' });

    for (const investment of investments) {
      // Get plan configuration from database
      const planConfig = await PlanConfig.findOne({ name: investment.plan.name });
      if (!planConfig) continue;

      // Check if 24 hours have passed since last processing
      const lastProcessed = investment.lastProcessedDate;
      const hoursPassed = (now - lastProcessed) / (1000 * 60 * 60);

      if (hoursPassed >= 24) {
        // Generate random sales between min and max (use defaults if not specified)
        const dailyMinSales = planConfig.dailyMinSales || 2;
        const dailyMaxSales = planConfig.dailyMaxSales || 5;
        const salesCount = Math.floor(Math.random() * (dailyMaxSales - dailyMinSales + 1)) + dailyMinSales;
        const totalSales = salesCount * 1000; // Assuming each sale is 1000 PKR

        // Calculate profit
        const profit = (totalSales * planConfig.returnPercentage) / 100;

        // Update investment
        investment.itemsSold += salesCount;
        investment.accumulatedReturn += profit;
        investment.lastProcessedDate = now;
        await investment.save();

        // Update user wallet
        const user = await User.findById(investment.user);
        user.walletBalance += profit;
        await user.save();

        // Record transaction
        await Transaction.create({
          user: investment.user,
          type: 'investment_return',
          amount: profit,
          status: 'approved',
          description: `Daily return from ${investment.plan.name} plan`
        });

        // Send notification
        await Notification.create({
          user: investment.user,
          type: 'investment_return',
          message: `🎉 Your ${investment.plan.name} plan generated PKR ${profit} profit today!`,
          isRead: false
        });

        console.log(`Processed investment for user ${user.name}: ${salesCount} sales, PKR ${profit} profit`);
      }
    }
  } catch (error) {
    console.error('Error running simulation:', error);
  }
}

// Function to process referral bonuses
async function processReferralBonus(referrerId, amount) {
  try {
    const referrer = await User.findById(referrerId);
    if (!referrer) return;

    // Calculate referral bonus based on environment variables
    const bonusType = process.env.REFERRAL_BONUS_TYPE || 'percentage';
    const bonusPercentage = parseFloat(process.env.REFERRAL_BONUS_PERCENTAGE || '5');
    const bonusCap = parseFloat(process.env.REFERRAL_BONUS_CAP || '10000');

    let bonusAmount = 0;

    if (bonusType === 'percentage') {
      bonusAmount = (amount * bonusPercentage) / 100;
      // Apply cap if set
      if (bonusCap > 0 && bonusAmount > bonusCap) {
        bonusAmount = bonusCap;
      }
    } else if (bonusType === 'fixed') {
      bonusAmount = Math.min(amount, bonusCap);
    }

    if (bonusAmount > 0) {
      // Add bonus to referrer's wallet
      referrer.walletBalance += bonusAmount;
      await referrer.save();

      // Record transaction
      await Transaction.create({
        user: referrerId,
        type: 'referral_bonus',
        amount: bonusAmount,
        status: 'approved',
        description: 'Referral bonus from friend\'s investment'
      });

      // Send notification
      await Notification.create({
        user: referrerId,
        type: 'referral_bonus',
        message: `🎉 You earned PKR ${bonusAmount} from your friend's investment!`,
        isRead: false
      });

      // Send email notification
      try {
        await sendReferralBonusEmail(referrer.email, referrer.name, bonusAmount);
      } catch (emailErr) {
        console.error('Failed to send referral bonus email:', emailErr);
      }

      console.log(`Referral bonus processed for user ${referrer.name}: PKR ${bonusAmount}`);
    }
  } catch (error) {
    console.error('Error processing referral bonus:', error);
  }
}

module.exports = { runSimulation, processReferralBonus };