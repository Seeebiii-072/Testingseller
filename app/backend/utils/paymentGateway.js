const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');

const CHANNEL_ID = '1001';
const CURRENCY = 'PKR';
const CARD_TRANSACTION_TYPE_ID = '3';

const URLS = {
  TEST: {
    handshake: 'https://sandbox.bankalfalah.com/HS/HS/HS',
    sso: 'https://sandbox.bankalfalah.com/SSO/SSO/SSO',
    ipnBase: 'https://sandbox.bankalfalah.com/HS/api/IPN/OrderStatus'
  },
  LIVE: {
    handshake: 'https://payments.bankalfalah.com/HS/HS/HS',
    sso: 'https://payments.bankalfalah.com/SSO/SSO/SSO',
    ipnBase: 'https://payments.bankalfalah.com/HS/api/IPN/OrderStatus'
  }
};

const getMode = () => (process.env.PAYMENT_MODE === 'LIVE' ? 'LIVE' : 'TEST');

const getConfig = () => ({
  mode: getMode(),
  merchantId: process.env.ALFALAH_MERCHANT_ID,
  storeId: process.env.ALFALAH_STORE_ID,
  merchantHash: process.env.ALFALAH_MERCHANT_HASH,
  key1: process.env.ALFALAH_KEY1,
  key2: process.env.ALFALAH_KEY2,
  username: process.env.ALFALAH_USERNAME,
  password: process.env.ALFALAH_PASSWORD
});

const validateCredentials = () => {
  const config = getConfig();
  const missing = Object.entries(config)
    .filter(([key, value]) => key !== 'mode' && !value)
    .map(([key]) => key);

  return {
    valid: missing.length === 0,
    missing
  };
};

const encryptHash = (mapString, config = getConfig()) => {
  if (!config.key1 || !config.key2) {
    throw new Error('Bank Alfalah Key1/Key2 are not configured');
  }

  const cipher = crypto.createCipheriv(
    'aes-128-cbc',
    Buffer.from(config.key1, 'utf8'),
    Buffer.from(config.key2, 'utf8')
  );

  return Buffer.concat([
    cipher.update(mapString, 'utf8'),
    cipher.final()
  ]).toString('base64');
};

const postForm = (url, fields) => new Promise((resolve, reject) => {
  const body = querystring.stringify(fields);
  const parsedUrl = new URL(url);

  const req = https.request({
    method: 'POST',
    hostname: parsedUrl.hostname,
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    }
  }, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Bank Alfalah returned HTTP ${res.statusCode}: ${data}`));
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error(`Invalid Bank Alfalah JSON response: ${data}`));
      }
    });
  });

  req.on('error', reject);
  req.write(body);
  req.end();
});

const getJson = (url) => new Promise((resolve, reject) => {
  https.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Bank Alfalah IPN returned HTTP ${res.statusCode}: ${data}`));
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error(`Invalid Bank Alfalah IPN JSON response: ${data}`));
      }
    });
  }).on('error', reject);
});

const buildHandshakeFields = ({ transactionId, returnUrl }, config = getConfig()) => {
  const mapString = [
    `HS_ChannelId=${CHANNEL_ID}`,
    'HS_IsRedirectionRequest=0',
    `HS_MerchantId=${config.merchantId}`,
    `HS_StoreId=${config.storeId}`,
    `HS_ReturnURL=${returnUrl}`,
    `HS_MerchantHash=${config.merchantHash}`,
    `HS_MerchantUsername=${config.username}`,
    `HS_MerchantPassword=${config.password}`,
    `HS_TransactionReferenceNumber=${transactionId}`
  ].join('&');

  return {
    HS_ChannelId: CHANNEL_ID,
    HS_IsRedirectionRequest: '0',
    HS_MerchantId: config.merchantId,
    HS_StoreId: config.storeId,
    HS_ReturnURL: returnUrl,
    HS_MerchantHash: config.merchantHash,
    HS_MerchantUsername: config.username,
    HS_MerchantPassword: config.password,
    HS_TransactionReferenceNumber: transactionId,
    HS_RequestHash: encryptHash(mapString, config)
  };
};

const buildSsoFields = ({ authToken, transactionId, amount, returnUrl }, config = getConfig()) => {
  const normalizedAmount = Number(amount).toFixed(2);
  const mapString = [
    `AuthToken=${authToken}`,
    'RequestHash=',
    `ChannelId=${CHANNEL_ID}`,
    `Currency=${CURRENCY}`,
    'IsBIN=0',
    `ReturnURL=${returnUrl}`,
    `MerchantId=${config.merchantId}`,
    `StoreId=${config.storeId}`,
    `MerchantHash=${config.merchantHash}`,
    `MerchantUsername=${config.username}`,
    `MerchantPassword=${config.password}`,
    `TransactionTypeId=${CARD_TRANSACTION_TYPE_ID}`,
    `TransactionReferenceNumber=${transactionId}`,
    `TransactionAmount=${normalizedAmount}`
  ].join('&');

  return {
    AuthToken: authToken,
    RequestHash: encryptHash(mapString, config),
    ChannelId: CHANNEL_ID,
    Currency: CURRENCY,
    IsBIN: '0',
    ReturnURL: returnUrl,
    MerchantId: config.merchantId,
    StoreId: config.storeId,
    MerchantHash: config.merchantHash,
    MerchantUsername: config.username,
    MerchantPassword: config.password,
    TransactionTypeId: CARD_TRANSACTION_TYPE_ID,
    TransactionReferenceNumber: transactionId,
    TransactionAmount: normalizedAmount
  };
};

const processPayment = async (orderData) => {
  const credentials = validateCredentials();
  if (!credentials.valid) {
    return {
      success: false,
      error: `Missing Bank Alfalah credentials: ${credentials.missing.join(', ')}`
    };
  }

  const config = getConfig();
  const urls = URLS[config.mode];
  const transactionId = orderData.orderId || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const appUrl = process.env.VITE_APP_URL || 'http://localhost:5000';
  const returnUrl = orderData.returnUrl || `${appUrl}/return-url`;

  const handshakeFields = buildHandshakeFields({ transactionId, returnUrl }, config);
  const handshake = await postForm(urls.handshake, handshakeFields);

  if (String(handshake.success).toLowerCase() !== 'true' || !handshake.AuthToken) {
    return {
      success: false,
      error: handshake.ErrorMessage || 'Bank Alfalah handshake failed',
      bankResponse: handshake
    };
  }

  const formData = buildSsoFields({
    authToken: handshake.AuthToken,
    transactionId,
    amount: orderData.amount,
    returnUrl
  }, config);

  return {
    success: true,
    type: 'FORM_POST',
    transactionId,
    checkoutUrl: urls.sso,
    method: 'POST',
    formData,
    returnUrl
  };
};

const getIPNUrl = (transactionId) => {
  const config = getConfig();
  const urls = URLS[config.mode];
  return `${urls.ipnBase}/${config.merchantId}/${config.storeId}/${encodeURIComponent(transactionId)}`;
};

const queryOrderStatus = async (transactionId) => {
  const status = await getJson(getIPNUrl(transactionId));
  return Array.isArray(status) ? status[0] : status;
};

const verifyResponseHash = () => true;

module.exports = {
  processPayment,
  queryOrderStatus,
  getIPNUrl,
  validateCredentials,
  verifyResponseHash
};
