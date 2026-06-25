require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Import User Model only (We don't need the others since we aren't wiping them)
const User = require('./models/User');

// Check for required environment variables
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.error("❌ ERROR: Please set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file.");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('🔥 Connected to DB.');

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPass = process.env.ADMIN_PASSWORD;
    const adminPhone = process.env.ADMIN_PHONE || '0000000000';

    // --- 1. RESET ADMIN ACCOUNT ONLY ---
    // We look for an existing user with this email and delete it to ensure a clean slate
    const deletedAdmin = await User.deleteOne({ email: adminEmail });
    
    if (deletedAdmin.deletedCount > 0) {
      console.log(`🗑️  Old Admin account (${adminEmail}) found and deleted.`);
    } else {
      console.log(`ℹ️  No existing Admin found with email ${adminEmail}. Creating new one...`);
    }

    // --- 2. CREATE NEW ADMIN ---
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPass, salt);

    const newAdmin = new User({
      name: 'Super Admin',
      email: adminEmail,
      password: hashedPassword,
      phone: adminPhone,
      role: 'admin',
      walletBalance: 0,
      referralCode: 'ADMIN' // Keeps the referral code constant
    });

    await newAdmin.save();
    
    console.log('✅ Admin Account Synced with .env');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Pass:  [HIDDEN] (Set in .env)`);

    process.exit();
  })
  .catch(err => {
    console.error('❌ Script Failed:', err);
    process.exit(1);
  });