const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  // 1. Get token from header
  let token = req.header('x-auth-token');
  
  // Try authorization header as fallback
  if (!token) {
    token = req.header('authorization');
    // Handle Bearer token format
    if (token && token.startsWith('Bearer ')) {
      token = token.slice(7);
    }
  }

  // 2. Check if no token
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  // 3. Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
