const User = require('../models/User');

module.exports = async function (req, res, next) {
  try {
    // 1. Check if user info exists (set by auth middleware)
    if (!req.user) {
      return res.status(401).json({ msg: 'Authorization denied' });
    }

    // 2. Fetch User from DB to check role
    const user = await User.findById(req.user.id);
    
    // 3. Check if Admin
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ msg: 'Access denied. Admin only.' });
    }
    
    next();
  } catch (err) {
    console.error("Admin Middleware Error:", err);
    res.status(500).send('Server Error');
  }
};