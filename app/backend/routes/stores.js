const express = require('express');
const router = express.Router();
const Store = require('../models/Store');

// Public endpoint to list available stores for signup/frontend
router.get('/', async (req, res) => {
  try {
    const stores = await Store.find().sort({ name: 1 });
    res.json(stores);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
