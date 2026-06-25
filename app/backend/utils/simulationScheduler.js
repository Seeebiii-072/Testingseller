const cron = require('node-cron');
const Order = require('../models/Order');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification'); 
const Product = require('../models/Product');
const { sendPayoutEmail } = require('../utils/emailService');

// Helper function to create product auto-sold notifications
async function createProductAutoSoldNotification(user, productName, itemsSold, profit) {
  await Notification.create({
    user: user._id,
    type: 'product_autosold',
    message: `📦 ${itemsSold} items of "${productName}" were auto-sold today! Profit of PKR ${Math.round(profit).toLocaleString()} has been added to your wallet.`
  });
}

const startSimulation = () => {
  // Schedule task to run once daily at midnight
  // 30-day cycle: sell ~1/30th of items each day
  cron.schedule('0 0 * * *', async () => {
    console.log('🔄 AUTO-SELL SIMULATION STARTED: Processing orders...');

    try {
      // 1. Find all orders that are in 'auto-selling' status
      const activeOrders = await Order.find({ status: 'auto-selling' });

      if (activeOrders.length === 0) {
        console.log('✅ No orders in auto-sell queue.');
        return;
      }

      console.log(`Processing ${activeOrders.length} orders for auto-sell...`);

      // Get today's date string for comparison (to prevent duplicate notifications)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 2. Loop through each order and simulate sales
      for (const order of activeOrders) {
        const remainingItems = order.totalQuantity - order.itemsSold;
        
        if (remainingItems <= 0) {
          // Order already complete, mark it
          order.status = 'completed';
          await order.save();
          continue;
        }

        // --- LOGIC: Sell items over 30 days ---
        // Each day sell ~1/30th of remaining items
        // On day 1: ~3.3%, day 2: ~3.4%, etc.
        // This ensures complete cycle in approximately 30 days
        const daysElapsed = Math.ceil((Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        const expectedSoldByNow = Math.floor((order.totalQuantity * daysElapsed) / 30);
        
        // Items to sell today to keep on track
        let itemsToSellToday = expectedSoldByNow - order.itemsSold;
        
        // Ensure at least 1 item sells per day if available
        if (itemsToSellToday < 1 && remainingItems > 0) {
          itemsToSellToday = 1;
        }
        
        // Don't oversell
        if (itemsToSellToday > remainingItems) {
          itemsToSellToday = remainingItems;
        }

        // Check if we've already processed this order today (prevent duplicate notifications)
        const lastProcessed = order.lastProcessedDate ? new Date(order.lastProcessedDate) : null;
        if (lastProcessed) {
          lastProcessed.setHours(0, 0, 0, 0);
          // If already processed today, skip this order
          if (lastProcessed.getTime() === today.getTime()) {
            console.log(`⏭️ SKIP: Order ${order._id} already processed today`);
            continue;
          }
        }
        
        // If no items sold today (catch-up scenario), don't create notification
        if (itemsToSellToday <= 0) {
          console.log(`⏭️ SKIP: Order ${order._id} - no new items sold today`);
          continue;
        }
        
        // Calculate profit per item based on ROI
        const profitPerItem = (order.pricePerItem * order.roi) / 100;
        const profitGainedToday = profitPerItem * itemsToSellToday;

        // Log the calculation details
        console.log(`[BALANCE LOG] Auto-sell Calculation - Order ${order._id}: ${itemsToSellToday} items sold, Price per item: PKR ${order.pricePerItem}, ROI: ${order.roi}%, Profit per item: PKR ${profitPerItem.toFixed(2)}, Total Profit Today: PKR ${profitGainedToday.toFixed(2)}`);

        // Update order progress
        order.itemsSold += itemsToSellToday;
        order.lastProcessedDate = new Date();

        // Check if cycle is finished (all items sold)
        if (order.itemsSold >= order.totalQuantity) {
          order.itemsSold = order.totalQuantity;
          order.status = 'completed';
          
          // Save order first
          await order.save();

          // Add profit for the FINAL day's items sold (this was NOT added in else block)
          const finalDayProfit = profitPerItem * itemsToSellToday;
          
          const user = await User.findById(order.user);
          if (user) {
            const balanceBeforeFinal = user.walletBalance;
            user.walletBalance += finalDayProfit;
            await user.save();
            
            // Log the Completion with balance details
            console.log(`[BALANCE LOG] Auto-sell COMPLETED - User ${user._id}, Order: ${order.productName}, Items Sold: ${order.totalQuantity}, Final Profit: PKR ${finalDayProfit.toFixed(2)}, Balance Before: PKR ${balanceBeforeFinal}, Balance After: PKR ${user.walletBalance}`);
            
            // Log the Completion Transaction with the final profit
            await Transaction.create({
              user: user._id,
              type: 'profit_payout',
              amount: finalDayProfit,
              status: 'approved',
              description: `Auto-sell Complete: ${order.productName} - Final profit for last ${itemsToSellToday} items`
            });

            // Notify User (type: autosell_complete)
            await Notification.create({
              user: user._id,
              type: 'autosell_complete',
              message: `🎉 All ${order.totalQuantity} items of "${order.productName}" sold! Final profit of PKR ${Math.round(finalDayProfit).toLocaleString()} added to wallet.`
            });

            // Send Email
            sendPayoutEmail(user.email, user.name, order.expectedProfit || 0, order.productName);

            console.log(`✅ COMPLETE: Order ${order._id} finished - final profit PKR ${Math.round(finalDayProfit)} added`);
          }

        } else {
          // Not complete yet, just update progress and add daily profit to wallet
          await order.save();
          
          // Add daily profit to user's wallet immediately
          const user = await User.findById(order.user);
          if (user) {
            const balanceBeforeProfit = user.walletBalance;
            user.walletBalance += profitGainedToday;
            await user.save();
            
            // Log daily profit with balance details
            console.log(`[BALANCE LOG] Daily Profit - User ${user._id}, Order: ${order.productName}, Items Sold Today: ${itemsToSellToday}, Total Sold: ${order.itemsSold}/${order.totalQuantity}, Profit: PKR ${profitGainedToday.toFixed(2)}, Balance Before: PKR ${balanceBeforeProfit}, Balance After: PKR ${user.walletBalance}`);

            // Log daily profit transaction
            await Transaction.create({
              user: user._id,
              type: 'daily_profit',
              amount: profitGainedToday,
              status: 'approved',
              description: `Daily profit: ${itemsToSellToday} items of ${order.productName}`
            });
            
            // Create notification for product auto-sold
            await createProductAutoSoldNotification(user, order.productName, itemsToSellToday, profitGainedToday);

            console.log(`📈 UPDATE: Order ${order._id} - ${itemsToSellToday} items sold, ${order.itemsSold}/${order.totalQuantity} total, Profit: PKR ${Math.round(profitGainedToday)}`);
          }
        }
      }
      
      console.log('✅ Auto-sell simulation completed successfully.');

    } catch (error) {
      console.error('❌ SIMULATION ERROR:', error);
    }
  });
};

module.exports = startSimulation;
