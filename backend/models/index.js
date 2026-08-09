const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentId:       { type: String, required: true, unique: true },
  name:            { type: String, required: true },
  class:           { type: String, required: true },
  section:         { type: String, required: true },
  rollNumber:      { type: String },
  dateOfBirth:     { type: String },
  parentName:      { type: String },
  parentEmail:     { type: String, required: true },
  parentPhone:     { type: String },
  facultyWhatsapp: { type: String },
  facultyName:     { type: String },
  facultyEmail:    { type: String },
  address:         { type: String },
  busId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Bus' },
  pickupPoint:     { type: String },
  dropPoint:       { type: String },
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true },
  password:     { type: String, required: true },
  role:         { type: String, enum: ['parent','admin'], default: 'parent' },
  studentId:    { type: String },
  name:         { type: String },
  passwordSet:  { type: Boolean, default: false },
  resetToken:   { type: String },
  resetExpires: { type: Date },
}, { timestamps: true });

const attendanceSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  date:      { type: String, required: true },
  subject:   { type: String, default: 'All' },
  status:    { type: String, enum: ['Present','Absent','Late','Holiday'], required: true },
}, { timestamps: true });
attendanceSchema.index({ studentId: 1, date: 1, subject: 1 }, { unique: true });

const marksSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  subject:   { type: String, required: true },
  examType:  { type: String, required: true },
  score:     { type: Number, required: true },
  maxScore:  { type: Number, required: true },
  remarks:   { type: String },
}, { timestamps: true });

const feeStructureSchema = new mongoose.Schema({
  class:       { type: String, required: true },
  section:     { type: String, required: true },
  term:        { type: String, required: true },
  feeType:     { type: String, required: true }, // e.g., "Tuition", "Sports", "Library"
  amount:      { type: Number, required: true },
  dueDate:     { type: Date, required: true },
  description: { type: String },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

const feeSchema = new mongoose.Schema({
  studentId:      { type: String, required: true },
  term:           { type: String, required: true },
  feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure' },
  amount:         { type: Number, required: true },
  amountPaid:     { type: Number, default: 0 },
  balance:        { type: Number },
  dueDate:        { type: Date },
  paidDate:       { type: Date },
  status:         { type: String, enum: ['Pending','Due','Partially Paid','Paid','Overdue'], default: 'Pending' },
  reminderSent:   { type: Boolean, default: false },
}, { timestamps: true });

const paymentSchema = new mongoose.Schema({
  studentId:    { type: String, required: true },
  feeId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Fee', required: true },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  amount:       { type: Number, required: true },
  paymentMethod: { type: String, enum: ['UPI', 'Card', 'NetBanking', 'Wallet'], default: 'Card' },
  status:       { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
  receiptUrl:   { type: String },
  transactionId: { type: String },
  paymentDate:  { type: Date },
  email:        { type: String, required: true },
  phone:        { type: String },
  notes:        { type: String },
}, { timestamps: true });

const notificationSchema = new mongoose.Schema({
  targetEmail: { type: String, required: true },
  type:        { type: String, enum: ['info','success','warn','danger'], default: 'info' },
  title:       { type: String, required: true },
  message:     { type: String, required: true },
  isRead:      { type: Boolean, default: false },
  sentEmail:   { type: Boolean, default: false },
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  senderEmail:   { type: String, required: true },
  receiverEmail: { type: String, required: true },
  senderName:    { type: String },
  content:       { type: String, required: true },
}, { timestamps: true });

const alertLogSchema = new mongoose.Schema({
  recipient: { type: String },
  type:      { type: String },
  subject:   { type: String },
  message:   { type: String },
  status:    { type: String, default: 'sent' },
}, { timestamps: true });

const achievementSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  studentName: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  category: { type: String, enum: ['Academic','Sports','Cultural','Technical','Attendance','Other'], required: true },
  achievementDate: { type: String, required: true },
  position: { type: String, default: '' },
  badge: { type: String, default: '' },
  studentPhoto: { type: String, default: '' },
  certificate: { type: String, default: '' },
  certificateName: { type: String, default: '' },
  certificateType: { type: String, default: '' },
}, { timestamps: true });

const routeSchema = new mongoose.Schema({
  routeCode:   { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  stops:       [{ type: String }],
  description: { type: String },
}, { timestamps: true });

const busSchema = new mongoose.Schema({
  busNo:          { type: String, required: true, unique: true },
  driverName:     { type: String, required: true },
  driverPhone:    { type: String },
  routeId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
  currentLocation:{ type: String, default: 'Not available' },
  eta:            { type: String, default: 'TBD' },
  status:         { type: String, default: 'On Route' },
  coordinates: {
    lat: { type: Number },
    lng: { type: Number },
  },
  history: [{
    location:    { type: String },
    eta:         { type: String },
    status:      { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    updatedAt:   { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = {
  Student:      mongoose.model('Student', studentSchema),
  User:         mongoose.model('User', userSchema),
  Attendance:   mongoose.model('Attendance', attendanceSchema),
  Marks:        mongoose.model('Marks', marksSchema),
  FeeStructure: mongoose.model('FeeStructure', feeStructureSchema),
  Fee:          mongoose.model('Fee', feeSchema),
  Payment:      mongoose.model('Payment', paymentSchema),
  Notification: mongoose.model('Notification', notificationSchema),
  Message:      mongoose.model('Message', messageSchema),
  AlertLog:     mongoose.model('AlertLog', alertLogSchema),
  Achievement:  mongoose.model('Achievement', achievementSchema),
  Route:        mongoose.model('Route', routeSchema),
  Bus:          mongoose.model('Bus', busSchema),
};
