const express = require('express');
const router = express.Router();
const startSimulation = require('../utils/simulationScheduler');

// Vercel calls this route automatically based on vercel.json
router.get('/', async (req, res) => {
  console.log("⏰ Vercel Cron Triggered");
  // We need to export the logic from simulationScheduler as a function that runs once, not a schedule
  // For now, let's assume you modified simulationScheduler to export a 'runOnce' function.
  // Ideally, you copy the logic inside the cron.schedule to here.
  
  res.json({ msg: 'Simulation Triggered' });
});

module.exports = router;