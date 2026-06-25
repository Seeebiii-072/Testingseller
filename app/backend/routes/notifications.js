const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Notification = require('../models/Notification');

// @route   GET api/notifications
// @desc    Get the logged-in user's notifications (all types)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    console.log(`[NOTIFICATION FETCH DEBUG] Fetching notifications for user ${req.user.id}`);
    const notifications = await Notification.find({ 
      user: req.user.id
    })
      .sort({ createdAt: -1 }) // Newest first
      .limit(50);
      
    console.log(`[NOTIFICATION FETCH DEBUG] Found ${notifications.length} notifications for user ${req.user.id}`);
    console.log(`[NOTIFICATION FETCH DEBUG] Notifications:`, notifications.map(n => ({ id: n._id, message: n.message, type: n.type, isRead: n.isRead })));
    
    res.json(notifications);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/notifications/mark-read
// @desc    Mark all notifications as read for the logged-in user
// @access  Private
router.put('/mark-read', auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { 
        user: req.user.id, 
        isRead: false
      },
      { $set: { isRead: true } }
    );
    res.json({ msg: 'Notifications marked as read' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/notifications/:id/mark-read
// @desc    Mark a specific notification as read
// @access  Private
router.put('/:id/mark-read', auth, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ msg: 'Notification not found' });
    }

    notification.isRead = true;
    await notification.save();

    res.json(notification);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/notifications/:id
// @desc    Delete a specific notification
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ msg: 'Notification not found' });
    }

    await notification.remove();
    res.json({ msg: 'Notification removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
