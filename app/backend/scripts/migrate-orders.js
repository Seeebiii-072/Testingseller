require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to MongoDB');

    const res = await Order.updateMany({ status: 'delivered' }, { $set: { status: 'approved' } });
    console.log(`Updated ${res.modifiedCount} orders from 'delivered' to 'approved'`);
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
};

run();
