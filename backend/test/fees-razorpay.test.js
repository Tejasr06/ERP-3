// ╔══════════════════════════════════════════════════════════╗
// ║   EduConnect — Razorpay & Fees Verification Test Suite   ║
// ╚══════════════════════════════════════════════════════════╝
require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const crypto = require('crypto');
const { Fee, Payment, Student, User } = require('../models');
const { createOrder, verifyPaymentSignature } = require('../utils/razorpay');

async function runFeesTests() {
  console.log('=== Starting Razorpay & Fees Module Test Suite ===\n');

  // 1. Verify Razorpay Environment Keys
  console.log('--- Test 1: Razorpay Configuration ---');
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('❌ Razorpay keys missing in environment!');
  }
  console.log('✅ Key ID detected:', process.env.RAZORPAY_KEY_ID);
  console.log('✅ Key Secret detected: ' + process.env.RAZORPAY_KEY_SECRET.slice(0, 4) + '****');

  // 2. Test Direct Razorpay Order Creation via SDK
  console.log('\n--- Test 2: Razorpay SDK Order Creation ---');
  const testAmount = 100; // Rs 100
  const testReceipt = `TEST_RCP_${Date.now()}`;
  const rzpOrder = await createOrder(testAmount, testReceipt, 'Test Order Creation');
  if (!rzpOrder || !rzpOrder.id || !rzpOrder.id.startsWith('order_')) {
    throw new Error('❌ Razorpay order creation failed: ' + JSON.stringify(rzpOrder));
  }
  console.log('✅ Razorpay order created successfully:', rzpOrder.id, `(${rzpOrder.amount / 100} ${rzpOrder.currency})`);

  // 3. Test HMAC Signature Verification
  console.log('\n--- Test 3: HMAC Signature Verification ---');
  const sampleOrderId = rzpOrder.id;
  const samplePaymentId = `pay_TEST_${Date.now()}`;
  const validSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${sampleOrderId}|${samplePaymentId}`)
    .digest('hex');

  const isValid = verifyPaymentSignature(sampleOrderId, samplePaymentId, validSignature);
  if (!isValid) throw new Error('❌ Valid signature was rejected!');
  console.log('✅ Valid signature correctly accepted');

  const isInvalid = verifyPaymentSignature(sampleOrderId, samplePaymentId, 'invalid_fake_signature');
  if (isInvalid) throw new Error('❌ Fake signature was accepted!');
  console.log('✅ Tampered/invalid signature correctly rejected');

  // 4. Test MongoDB Connectivity and Fee Flow
  console.log('\n--- Test 4: Database Fee & Payment Flow ---');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // Find or create test student
  let testStudent = await Student.findOne({ studentId: '1SB23IS056' });
  if (!testStudent) {
    testStudent = await Student.create({
      studentId: '1SB23IS056',
      name: 'Tejas R',
      class: '10',
      section: 'A',
      parentEmail: 'tr430933@gmail.com'
    });
  }

  // Create a pending fee for testing
  const testFeeTerm = `Automated Test Term ${Date.now()}`;
  const fee = await Fee.create({
    studentId: testStudent.studentId,
    term: testFeeTerm,
    amount: 1500,
    amountPaid: 0,
    balance: 1500,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: 'Due'
  });
  console.log('✅ Test fee created:', fee._id, `₹${fee.amount} (${fee.term})`);

  // Simulate Order for this fee
  const orderForFee = await createOrder(fee.balance, `FEE_${fee._id}`, `Fee Payment - ${fee.term}`);
  console.log('✅ Order created for test fee:', orderForFee.id);

  // Simulate Payment & Verification
  const simulatedPaymentId = `pay_sim_${Date.now()}`;
  const simSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderForFee.id}|${simulatedPaymentId}`)
    .digest('hex');

  const sigVerified = verifyPaymentSignature(orderForFee.id, simulatedPaymentId, simSignature);
  if (!sigVerified) throw new Error('❌ Simulation signature failed verification');

  // Record payment in DB
  fee.amountPaid = (fee.amountPaid || 0) + (orderForFee.amount / 100);
  fee.balance = Math.max(0, fee.amount - fee.amountPaid);
  fee.status = fee.balance === 0 ? 'Paid' : 'Partially Paid';
  if (fee.status === 'Paid') fee.paidDate = new Date();
  await fee.save();

  const paymentRecord = await Payment.create({
    studentId: fee.studentId,
    feeId: fee._id,
    razorpayOrderId: orderForFee.id,
    razorpayPaymentId: simulatedPaymentId,
    razorpaySignature: simSignature,
    amount: orderForFee.amount / 100,
    paymentMethod: 'Card',
    status: 'success',
    transactionId: `TXN_${Date.now()}`,
    paymentDate: new Date(),
    email: 'tr430933@gmail.com',
    notes: `Test fee payment for ${fee.term}`
  });

  console.log('✅ Payment recorded:', paymentRecord.transactionId, `Amount: ₹${paymentRecord.amount}`);
  console.log('✅ Fee status updated to:', fee.status, `(Balance: ₹${fee.balance})`);

  // Cleanup test fee and payment
  await Fee.findByIdAndDelete(fee._id);
  await Payment.findByIdAndDelete(paymentRecord._id);
  console.log('✅ Test records cleaned up');

  await mongoose.disconnect();
  console.log('\n🎉 ALL RAZORPAY & FEE TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runFeesTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
