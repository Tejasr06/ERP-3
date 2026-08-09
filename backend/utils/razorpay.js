// ╔═══════════════════════════════════════════╗
// ║   EduConnect — Razorpay Gateway Utility   ║
// ╚═══════════════════════════════════════════╝
const Razorpay = require('razorpay');
const crypto   = require('crypto');

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID     || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

// Create order (amount in rupees → paise internally)
const createOrder = async (amount, receipt, description = '') => {
  const options = {
    amount:      Math.round(amount * 100),
    currency:    'INR',
    receipt:     String(receipt).slice(0, 40),
    description: description,
    notes:       { source: 'EduConnect Fee Portal' },
  };
  return razorpay.orders.create(options);
};

// Verify Razorpay HMAC signature
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const body     = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body).digest('hex');
    return expected === signature;
  } catch { return false; }
};

// Fetch payment details from Razorpay
const getPaymentDetails = (paymentId) => razorpay.payments.fetch(paymentId);

// Full/partial refund
const refundPayment = (paymentId, amount = null) => {
  const opts = amount ? { amount: Math.round(amount * 100) } : {};
  return razorpay.payments.refund(paymentId, opts);
};

module.exports = { razorpay, createOrder, verifyPaymentSignature, getPaymentDetails, refundPayment };
