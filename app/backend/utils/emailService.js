const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendEmail = async (to, subject, htmlContent) => {
  try {
    const mailOptions = {
      from: `"eGrocify Alerts" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('❌ Email Error:', error);
    return false;
  }
};

// --- PRE-BUILT TEMPLATES ---

const sendPurchaseEmail = async (userEmail, userName, planName, amount) => {
  const subject = `🚀 Plan Activated: ${planName}`;
  const html = `
    <h3>Hello ${userName},</h3>
    <p>Your purchase of the <strong>${planName}</strong> plan for <strong>PKR ${amount.toLocaleString()}</strong> was successful.</p>
    <p>Your automated sales simulation has started. Check your dashboard for daily updates.</p>
    <br>
    <p>Regards,<br>eGrocify Team</p>
  `;
  await sendEmail(userEmail, subject, html);
  
  // Also Notify Admin
  await sendEmail(process.env.ADMIN_EMAIL, `New Sale: ${planName}`, `User ${userName} bought ${planName} for PKR ${amount}.`);
};

const sendWithdrawalRequestEmail = async (userName, amount, bankName) => {
  // Notify Admin
  const subject = `💰 New Withdrawal Request: PKR ${amount.toLocaleString()}`;
  const html = `
    <h3>Admin Alert</h3>
    <p>User <strong>${userName}</strong> has requested a withdrawal.</p>
    <ul>
      <li>Amount: PKR ${amount.toLocaleString()}</li>
      <li>Bank: ${bankName}</li>
    </ul>
    <p>Please login to the Admin Panel to approve/reject.</p>
  `;
  await sendEmail(process.env.ADMIN_EMAIL, subject, html);
};

const sendWithdrawalApprovedEmail = async (userEmail, userName, amount) => {
  const subject = `✅ Withdrawal Approved: PKR ${amount.toLocaleString()}`;
  const html = `
    <h3>Hi ${userName},</h3>
    <p>Great news! Your withdrawal request for <strong>PKR ${amount.toLocaleString()}</strong> has been processed.</p>
    <p>The funds should appear in your bank account shortly.</p>
  `;
  await sendEmail(userEmail, subject, html);
};

const sendPayoutEmail = async (userEmail, userName, amount, planName) => {
  const subject = `🎉 Cycle Complete! Payout: PKR ${amount.toLocaleString()}`;
  const html = `
    <h3>Congratulations ${userName}!</h3>
    <p>Your <strong>${planName}</strong> investment cycle is complete.</p>
    <p>We have added <strong>PKR ${amount.toLocaleString()}</strong> (Capital + Profit) to your wallet.</p>
    <p>You can withdraw this anytime or reinvest in a higher plan.</p>
  `;
  await sendEmail(userEmail, subject, html);
};

module.exports = { 
  sendPurchaseEmail, 
  sendWithdrawalRequestEmail, 
  sendWithdrawalApprovedEmail,
  sendPayoutEmail
};