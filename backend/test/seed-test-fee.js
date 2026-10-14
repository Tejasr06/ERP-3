require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const { Fee } = require('../models');

async function ensureFee() {
  await mongoose.connect(process.env.MONGO_URI);
  const pending = await Fee.findOne({ studentId: '1SB23IS056', status: { $ne: 'Paid' } });
  if (!pending) {
    const newFee = await Fee.create({
      studentId: '1SB23IS056',
      term: 'Term 3 Tuition Fee',
      amount: 2500,
      amountPaid: 0,
      balance: 2500,
      dueDate: new Date(Date.now() + 15 * 86400000),
      status: 'Due'
    });
    console.log('✅ Created pending fee for 1SB23IS056:', newFee.term, `₹${newFee.amount}`);
  } else {
    console.log('✅ Pending fee exists for 1SB23IS056:', pending.term, `₹${pending.balance || pending.amount}`);
  }
  await mongoose.disconnect();
}

ensureFee().catch(err => {
  console.error(err);
  process.exit(1);
});
