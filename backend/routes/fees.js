// ╔══════════════════════════════════════════════════════════════╗
// ║   EduConnect — Fee Management Routes (Enhanced)              ║
// ║   Razorpay Gateway + PDF Receipts + Notifications           ║
// ╚══════════════════════════════════════════════════════════════╝
const router = require('express').Router();
const { Fee, Payment, FeeStructure, Student, Notification, User } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');
const { sendMailToParentWithOptions } = require('../middleware/email');
const { createOrder, verifyPaymentSignature, getPaymentDetails } = require('../utils/razorpay');
const { generateReceiptPDF } = require('../utils/pdfGenerator');
const path = require('path');
const fs   = require('fs');

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function autoUpdateOverdue(fees) {
  const now = new Date();
  return fees.map(fee => {
    if (fee.status !== 'Paid' && fee.dueDate && new Date(fee.dueDate) < now) {
      fee.status = 'Overdue';
    }
    return fee;
  });
}

function normalizeFeeBalance(fee) {
  const paid = fee.amountPaid || 0;
  const isPaid = String(fee.status || '').toLowerCase() === 'paid';
  if (isPaid) {
    fee.balance = 0;
  } else {
    const owed = Math.max(0, fee.amount - paid);
    fee.balance = (fee.balance != null && fee.balance > 0) ? fee.balance : owed;
  }
  return fee;
}

// ═══════════════════════════════════════════════════════════════
// PARENT SIDE
// ═══════════════════════════════════════════════════════════════

// GET /api/fees/my-fees — Parent: view pending fees + summary
router.get('/fees/my-fees', auth, async (req, res) => {
  try {
    if (req.user.role !== 'parent') return res.status(403).json({ error: 'Access denied.' });

    let fees = await Fee.find({ studentId: req.user.studentId })
      .populate('feeStructureId')
      .sort({ dueDate: 1 });

    // Auto-mark overdue
    const now = new Date();
    for (const fee of fees) {
      if (fee.status !== 'Paid' && fee.dueDate && new Date(fee.dueDate) < now && fee.status !== 'Overdue') {
        fee.status = 'Overdue';
        await fee.save();
      }
    }

    fees.forEach(normalizeFeeBalance);

    const summary = {
      totalFees:    fees.reduce((s, f) => s + f.amount, 0),
      totalPaid:    fees.reduce((s, f) => s + (f.amountPaid || 0), 0),
      totalDue:     fees.reduce((s, f) => s + (f.balance || 0), 0),
      pendingCount: fees.filter(f => f.status !== 'Paid').length,
      overdueCount: fees.filter(f => f.status === 'Overdue').length,
    };

    res.json({ fees, summary });
  } catch (err) {
    console.error('my-fees error:', err);
    res.status(500).json({ error: 'Failed to fetch fees.' });
  }
});

// GET /api/fees/payment-history — Parent: all successful payments
router.get('/fees/payment-history', auth, async (req, res) => {
  try {
    if (req.user.role !== 'parent') return res.status(403).json({ error: 'Access denied.' });

    const payments = await Payment.find({ studentId: req.user.studentId, status: 'success' })
      .populate('feeId')
      .sort({ paymentDate: -1 });

    res.json(payments);
  } catch (err) {
    console.error('payment-history error:', err);
    res.status(500).json({ error: 'Failed to fetch payment history.' });
  }
});

// GET /api/fees/receipt/:receiptId — Download receipt PDF
router.get('/fees/receipt/:receiptId', auth, async (req, res) => {
  try {
    const filePath = path.join(__dirname, '../uploads', req.params.receiptId);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Receipt not found.' });
    res.download(filePath);
  } catch (err) {
    res.status(500).json({ error: 'Failed to download receipt.' });
  }
});

// POST /api/fees/create-order — Create Razorpay order
router.post('/fees/create-order', auth, async (req, res) => {
  try {
    const { feeId } = req.body;
    if (!feeId) return res.status(400).json({ error: 'Fee ID required.' });

    const fee = await Fee.findById(feeId);
    if (!fee) return res.status(404).json({ error: 'Fee not found.' });

    if (req.user.role === 'parent' && req.user.studentId !== fee.studentId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (String(fee.status || '').toLowerCase() === 'paid') return res.status(400).json({ error: 'Fee is already paid.' });

    normalizeFeeBalance(fee);
    const amount = fee.balance;
    if (amount <= 0) return res.status(400).json({ error: 'No balance due on this fee.' });

    const order  = await createOrder(amount, `FEE_${feeId}`, `Fee Payment — ${fee.term}`);

    res.json({ orderId: order.id, amount: order.amount / 100, currency: order.currency, feeId });
  } catch (err) {
    console.error('create-order error:', err);
    res.status(500).json({ error: 'Failed to create payment order.' });
  }
});

// POST /api/fees/verify-payment — Verify Razorpay signature & record payment
router.post('/fees/verify-payment', auth, async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, feeId, paymentMethod } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ error: 'Missing Razorpay payment details.' });
    }

    // 1. Verify signature
    const valid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!valid) return res.status(400).json({ error: 'Invalid payment signature. Possible fraud.' });

    // 2. Fetch payment amount from Razorpay
    const rpPayment = await getPaymentDetails(razorpayPaymentId);
    const amount    = rpPayment.amount / 100;

    // 3. Update fee record
    const fee = await Fee.findById(feeId);
    if (!fee) return res.status(404).json({ error: 'Fee record not found.' });

    fee.amountPaid = (fee.amountPaid || 0) + amount;
    fee.balance    = Math.max(0, fee.amount - fee.amountPaid);
    fee.status     = fee.balance === 0 ? 'Paid' : 'Partially Paid';
    if (fee.status === 'Paid') fee.paidDate = new Date();
    await fee.save();

    // 4. Get student info
    const student = await Student.findOne({ studentId: fee.studentId });

    // 5. Record payment
    const allowedMethods = ['UPI', 'Card', 'NetBanking', 'Wallet'];
    const method = allowedMethods.includes(paymentMethod) ? paymentMethod : 'Card';

    const transactionId = `TXN_${Date.now()}`;
    const payment = await Payment.create({
      studentId:         fee.studentId,
      feeId:             feeId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      amount,
      paymentMethod:     method,
      status:            'success',
      transactionId,
      paymentDate:       new Date(),
      email:             req.user.email,
      notes:             `Payment for ${fee.term} fees`,
    });

    // 6. Generate receipt PDF
    let receiptUrl = null;
    try {
      const receipt = await generateReceiptPDF({
        transactionId,
        studentId:        fee.studentId,
        studentName:      student?.name || 'N/A',
        class:            student?.class || 'N/A',
        section:          student?.section || 'N/A',
        parentName:       student?.parentName || 'Parent',
        term:             fee.term,
        feeType:          fee.feeType || 'Tuition Fee',
        amount,
        paymentMethod:    method,
        razorpayPaymentId,
        razorpayOrderId,
        paymentDate:      new Date(),
        dueDate:          fee.dueDate,
        status:           'success',
        schoolName:       process.env.SCHOOL_NAME || 'EduConnect School',
        schoolAddress:    process.env.SCHOOL_ADDRESS || '',
        schoolPhone:      process.env.SCHOOL_PHONE || '',
      });
      receiptUrl = receipt.url;
      payment.receiptUrl = receiptUrl;
      await payment.save();
    } catch (pdfErr) {
      console.error('PDF generation failed:', pdfErr.message);
    }

    // 7. Send email to parent
    try {
      await sendMailToParentWithOptions(student?.parentEmail || req.user.email, {
        subject:        'Fee Payment Successful — EduConnect',
        studentName:    student?.name || 'Student',
        parentName:     student?.parentName || 'Parent',
        amount:         amount.toFixed(2),
        transactionId,
        term:           fee.term,
        paymentDate:    new Date().toLocaleDateString('en-IN'),
        receiptUrl,
      });
    } catch (emailErr) {
      console.error('Email send failed:', emailErr.message);
    }

    // 8. Create in-app notification
    await Notification.create({
      targetEmail: req.user.email,
      type:        'success',
      title:       'Payment Successful ✅',
      message:     `₹${amount.toFixed(2)} received for ${fee.term} fees. TXN: ${transactionId}`,
      sentEmail:   true,
    });

    res.json({
      success:       true,
      message:       'Payment successful',
      transactionId,
      receiptUrl,
      feeStatus:     fee.status,
      amountPaid:    fee.amountPaid,
      balance:       fee.balance,
    });
  } catch (err) {
    console.error('verify-payment error:', err);
    const msg = err.message?.includes('validation failed')
      ? 'Payment was received but could not be saved. Please contact support.'
      : (err.message || 'Payment verification failed.');
    res.status(500).json({ error: msg });
  }
});

// Expose Razorpay public key
router.get('/razorpay/key', (_req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID || '' });
});

// ═══════════════════════════════════════════════════════════════
// ADMIN SIDE
// ═══════════════════════════════════════════════════════════════

// GET /api/fees/statistics
router.get('/fees/statistics', auth, adminOnly, async (req, res) => {
  try {
    const [totalFees, paidFees, unpaidFees, overdueFees, partialFees, collectedAgg, dueAgg] = await Promise.all([
      Fee.countDocuments(),
      Fee.countDocuments({ status: 'Paid' }),
      Fee.countDocuments({ status: 'Pending' }),
      Fee.countDocuments({ status: 'Overdue' }),
      Fee.countDocuments({ status: 'Partially Paid' }),
      Fee.aggregate([{ $match: { status: 'Paid' } }, { $group: { _id: null, total: { $sum: '$amountPaid' } } }]),
      Fee.aggregate([{ $match: { status: { $ne: 'Paid' } } }, { $group: { _id: null, total: { $sum: '$balance' } } }]),
    ]);

    res.json({
      totalFees, paidFees, unpaidFees, overdueFees, partialFees,
      totalCollected: collectedAgg[0]?.total || 0,
      totalDue:       dueAgg[0]?.total || 0,
    });
  } catch (err) {
    console.error('statistics error:', err);
    res.status(500).json({ error: 'Failed to get statistics.' });
  }
});

// POST /api/fees/structure — Create fee structure
router.post('/fees/structure', auth, adminOnly, async (req, res) => {
  try {
    const { class: cls, section, term, feeType, amount, dueDate, description } = req.body;
    if (!cls || !section || !term || !feeType || !amount || !dueDate) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    const fs = await FeeStructure.create({ class: cls, section, term, feeType, amount, dueDate, description, isActive: true });
    res.status(201).json(fs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create fee structure.' });
  }
});

// GET /api/fees/structures
router.get('/fees/structures', auth, adminOnly, async (req, res) => {
  try {
    const structures = await FeeStructure.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(structures);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch fee structures.' });
  }
});

// DELETE /api/fees/structure/:id
router.delete('/fees/structure/:id', auth, adminOnly, async (req, res) => {
  try {
    await FeeStructure.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Fee structure deactivated.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete structure.' });
  }
});

// POST /api/fees/bulk-create — Assign fees to students
router.post('/fees/bulk-create', auth, adminOnly, async (req, res) => {
  try {
    const { studentIds, feeStructureId, term, amount, dueDate } = req.body;
    if (!Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({ error: 'Student IDs required.' });
    }
    if (!term || !amount || !dueDate) {
      return res.status(400).json({ error: 'Term, amount, and due date are required.' });
    }

    const fees = [];
    for (const studentId of studentIds) {
      const sid = studentId.trim();
      if (!sid) continue;
      const exists = await Fee.findOne({ studentId: sid, term, feeStructureId: feeStructureId || undefined });
      if (!exists) {
        fees.push({ studentId: sid, term, feeStructureId: feeStructureId || undefined, amount, balance: amount, dueDate, status: 'Pending' });
      }
    }

    if (fees.length) await Fee.insertMany(fees);
    res.json({ message: `${fees.length} fees created.`, feesCreated: fees.length, skipped: studentIds.length - fees.length });
  } catch (err) {
    console.error('bulk-create error:', err);
    res.status(500).json({ error: 'Failed to create fees.' });
  }
});

// GET /api/fees/track-payments
router.get('/fees/track-payments', auth, adminOnly, async (req, res) => {
  try {
    const { term } = req.query;
    const query = term ? { term } : {};

    // Auto-update overdue
    const now = new Date();
    await Fee.updateMany({ ...query, status: { $in: ['Pending', 'Due'] }, dueDate: { $lt: now } }, { $set: { status: 'Overdue' } });

    const fees = await Fee.find(query).sort({ dueDate: 1 });

    const summary = {
      total:    fees.length,
      paid:     fees.filter(f => f.status === 'Paid').length,
      unpaid:   fees.filter(f => f.status === 'Pending').length,
      partial:  fees.filter(f => f.status === 'Partially Paid').length,
      overdue:  fees.filter(f => f.status === 'Overdue').length,
      totalAmount:    fees.reduce((s, f) => s + f.amount, 0),
      totalCollected: fees.reduce((s, f) => s + (f.amountPaid || 0), 0),
    };

    res.json({ summary, fees });
  } catch (err) {
    console.error('track-payments error:', err);
    res.status(500).json({ error: 'Failed to track payments.' });
  }
});

// GET /api/fees/transactions
router.get('/fees/transactions', auth, adminOnly, async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Payment.find({ status: 'success' }).populate('feeId').sort({ paymentDate: -1 }).skip(skip).limit(limit),
      Payment.countDocuments({ status: 'success' }),
    ]);

    res.json({ transactions, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
});

// GET /api/fees/report
router.get('/fees/report', auth, adminOnly, async (req, res) => {
  try {
    const { startDate, endDate, term } = req.query;

    const match = { status: 'success' };
    if (startDate && endDate) {
      match.paymentDate = { $gte: new Date(startDate), $lte: new Date(new Date(endDate).setHours(23, 59, 59)) };
    }

    const payments = await Payment.find(match).populate('feeId').sort({ paymentDate: -1 });

    // Filter by term if given (via populated feeId)
    const filtered = term ? payments.filter(p => p.feeId?.term === term) : payments;

    const totalAmount = filtered.reduce((s, p) => s + p.amount, 0);

    const byPaymentMethod = {};
    const byAmount = {};
    filtered.forEach(p => {
      const m = p.paymentMethod || 'Unknown';
      byPaymentMethod[m] = (byPaymentMethod[m] || 0) + 1;
      byAmount[m] = (byAmount[m] || 0) + p.amount;
    });

    res.json({
      totalTransactions: filtered.length,
      totalAmount,
      byPaymentMethod,
      byAmount,
      payments: filtered,
    });
  } catch (err) {
    console.error('report error:', err);
    res.status(500).json({ error: 'Failed to generate report.' });
  }
});

// POST /api/fees/send-reminders
router.post('/fees/send-reminders', auth, adminOnly, async (req, res) => {
  try {
    const { term } = req.body;
    const query = { status: { $in: ['Pending', 'Overdue'] }, reminderSent: false };
    if (term) query.term = term;

    const fees = await Fee.find(query);

    let sent = 0;
    for (const fee of fees) {
      try {
        const student = await Student.findOne({ studentId: fee.studentId });
        if (!student?.parentEmail) continue;

        await sendMailToParentWithOptions(student.parentEmail, {
          subject:      `Fee Payment Reminder — ${fee.term}`,
          studentName:  student.name,
          parentName:   student.parentName || 'Parent',
          amount:       (fee.balance || fee.amount).toFixed(2),
          term:         fee.term,
          dueDate:      new Date(fee.dueDate).toLocaleDateString('en-IN'),
          reminderType: 'pending',
        });

        // Create in-app notification for parent
        const parentUser = await User.findOne({ studentId: fee.studentId, role: 'parent' });
        if (parentUser) {
          await Notification.create({
            targetEmail: parentUser.email,
            type:        'warn',
            title:       `Fee Due Reminder — ${fee.term}`,
            message:     `Your ${fee.term} fee of ₹${(fee.balance || fee.amount).toFixed(2)} is due by ${new Date(fee.dueDate).toLocaleDateString('en-IN')}.`,
          });
        }

        fee.reminderSent = true;
        await fee.save();
        sent++;
      } catch (emailErr) {
        console.error(`Reminder failed for ${fee.studentId}:`, emailErr.message);
      }
    }

    res.json({ message: `Reminders sent to ${sent} parents.`, sent, total: fees.length });
  } catch (err) {
    console.error('send-reminders error:', err);
    res.status(500).json({ error: 'Failed to send reminders.' });
  }
});

module.exports = router;
