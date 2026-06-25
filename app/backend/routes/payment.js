const express = require('express');
const router = express.Router();
const { processPayment, queryOrderStatus, getIPNUrl, validateCredentials } = require('../utils/paymentGateway');
const authMiddleware = require('../middleware/authMiddleware');
const Order = require('../models/Order');
const Product = require('../models/Product');

const findOrderIdFromRequest = (req) => {
  return req.query.orderId ||
    req.query.O ||
    req.query.o ||
    req.body?.orderId ||
    req.body?.O ||
    req.body?.TransactionReferenceNumber ||
    req.body?.TransactionID ||
    req.params?.orderId;
};

const markOrderPaid = async (order, bankResponse = {}) => {
  if (order.paymentStatus === 'COMPLETED') {
    return order;
  }

  order.paymentStatus = 'COMPLETED';
  order.status = 'auto-selling';
  order.lastProcessedDate = new Date();
  order.bankResponse = bankResponse;

  if (order.product) {
    const product = await Product.findById(order.product);
    if (product) {
      product.quantity = Math.max(0, product.quantity - order.quantity);
      await product.save();
    }
  }

  await order.save();
  return order;
};

const markOrderFailed = async (order, bankResponse = {}) => {
  order.paymentStatus = 'FAILED';
  order.status = 'cancelled';
  order.bankResponse = bankResponse;
  await order.save();
  return order;
};

const refreshOrderFromBank = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) {
    return null;
  }

  const bankOrderId = order.transactionId || order._id.toString();
  const bankResponse = await queryOrderStatus(bankOrderId);
  const bankStatus = String(bankResponse?.TransactionStatus || '').toLowerCase();

  if (bankStatus === 'paid') {
    return markOrderPaid(order, bankResponse);
  }

  if (bankStatus) {
    return markOrderFailed(order, bankResponse);
  }

  order.bankResponse = bankResponse;
  await order.save();
  return order;
};

/**
 * POST /api/payment/initiate
 * Initiates a new payment request - can create new order or use existing orderId
 */
router.post('/initiate', authMiddleware, async (req, res) => {
  try {
    const { productId, quantity, amount, orderId, description } = req.body;
    const userId = req.user.id;

    let order = null;
    let totalAmount = amount;

    // Check if we have product purchase details
    const hasProductDetails = productId && quantity;
    const hasExistingOrder = orderId;

    if (hasProductDetails) {
      // Create new order from product
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (product.quantity < quantity) {
        return res.status(400).json({ msg: "Not enough stock available" });
      }

      totalAmount = product.price * quantity;
      const roi = product.roi || 0;
      const expectedProfit = (totalAmount * roi) / 100;

      order = new Order({
        user: userId,
        product: product._id,
        productName: product.name,
        productImage: product.image,
        quantity: Number(quantity),
        totalAmount: totalAmount,
        status: 'pending',
        paymentStatus: 'PENDING',
        itemsSold: 0,
        totalQuantity: Number(quantity),
        expectedProfit: expectedProfit,
        pricePerItem: product.price,
        roi: roi,
        lastProcessedDate: null
      });

      await order.save();
    } else if (hasExistingOrder) {
      // Use existing order
      order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      totalAmount = order.totalAmount;
    } else {
      return res.status(400).json({ error: 'Missing required fields: orderId or (productId + quantity)' });
    }

    // Process payment through the gateway
    const paymentResult = await processPayment({
      orderId: order._id.toString(),
      amount: totalAmount,
      description: description || `Purchase: ${order.productName}`,
      returnUrl: `${process.env.VITE_APP_URL}/return-url`
    });

    if (!paymentResult.success) {
      order.status = 'cancelled';
      order.paymentStatus = 'FAILED';
      await order.save();
      return res.status(400).json({ error: 'Payment initiation failed', details: paymentResult });
    }

    // Update order with transaction ID
    order.transactionId = paymentResult.transactionId || paymentResult.formData?.TransactionID;
    order.paymentStatus = 'PENDING';
    await order.save();

    res.json({
      success: true,
      ...paymentResult,
      orderId: order._id.toString()
    });
  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payment/callback
 * Handles payment callback from Alfa Payment Gateway (IPN)
 */
router.post('/callback', async (req, res) => {
  try {
    const responseData = req.body;
    const orderId = findOrderIdFromRequest(req);

    console.log('Payment callback received:', responseData);

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const status = String(responseData.TransactionStatus || responseData.Status || '').toLowerCase();
    if (status === 'paid' || status === 'success' || status === 'approved') {
      await markOrderPaid(order, responseData);
    } else if (status) {
      await markOrderFailed(order, responseData);
    } else {
      await refreshOrderFromBank(orderId);
    }

    res.json({
      success: true,
      message: 'Payment status updated',
      paymentStatus: order.paymentStatus,
      orderStatus: order.status
    });
  } catch (error) {
    console.error('Payment callback error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payment/status/:orderId
 * Get payment status for an order
 */
router.get('/status/:orderId', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      orderId: order._id,
      paymentStatus: order.paymentStatus,
      transactionId: order.transactionId,
      ipnUrl: order.transactionId ? getIPNUrl(order.transactionId) : null,
      amount: order.totalAmount
    });
  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payment/test
 * Test endpoint to verify payment gateway setup
 */
router.get('/test', (req, res) => {
  try {
    const credentialStatus = validateCredentials();
    const testData = {
      merchantId: process.env.ALFALAH_MERCHANT_ID,
      storeId: process.env.ALFALAH_STORE_ID,
      mode: process.env.PAYMENT_MODE,
      credentialsConfigured: credentialStatus.valid,
      missingCredentials: credentialStatus.missing
    };

    res.json({
      success: true,
      message: 'Payment gateway is configured',
      ...testData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payment/return/:orderId
 * Handles user return from payment page (redirect after payment)
 */
router.get('/return-url', async (req, res) => {
  try {
    const orderId = findOrderIdFromRequest(req);

    console.log('Payment return received:', req.query);

    if (!orderId) {
      return res.redirect(`/dashboard?payment=error&message=Missing+order+id`);
    }

    if (String(orderId).startsWith('plan-')) {
      return res.redirect(`/api/plans/return-url?orderId=${encodeURIComponent(orderId)}`);
    }

    const order = await refreshOrderFromBank(orderId);
    if (!order) {
      return res.redirect(`/dashboard?payment=error&message=Order+not+found`);
    }

    if (order.paymentStatus === 'COMPLETED') {
      return res.redirect(`/dashboard?payment=success&orderId=${orderId}`);
    }

    return res.redirect(`/dashboard?payment=cancelled&orderId=${orderId}`);
  } catch (error) {
    console.error('Payment return error:', error);
    res.redirect(`/dashboard?payment=error&message=${encodeURIComponent(error.message)}`);
  }
});

router.get('/return/:orderId', async (req, res) => {
  return res.redirect(`/api/payment/return-url?orderId=${encodeURIComponent(req.params.orderId)}`);
});

router.get('/ipn-listener', async (req, res) => {
  try {
    if (!req.query.url) {
      return res.status(400).json({ error: 'Missing Bank Alfalah IPN url parameter' });
    }

    const bankResponse = await queryOrderStatus(req.query.url.split('/').pop());
    const orderId = bankResponse?.TransactionReferenceNumber;
    if (!orderId) {
      return res.status(400).json({ error: 'Bank response did not include TransactionReferenceNumber', bankResponse });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found', bankResponse });
    }

    if (String(bankResponse.TransactionStatus || '').toLowerCase() === 'paid') {
      await markOrderPaid(order, bankResponse);
    } else {
      await markOrderFailed(order, bankResponse);
    }

    res.json({ success: true, paymentStatus: order.paymentStatus });
  } catch (error) {
    console.error('IPN listener error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
