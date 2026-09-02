# EduConnect — Fee Module Integration Guide

## 📂 Files in This Package

```
erp_fee_module/
├── frontend/
│   ├── fees.html          ← Replace existing  (Parent portal)
│   └── admin-fees.html    ← Replace existing  (Admin panel)
├── backend/
│   ├── server.js          ← Replace existing  (adds /fees & /notifications routes)
│   ├── .env.example       ← Add Razorpay keys to your .env
│   ├── routes/
│   │   ├── fees.js        ← Replace existing  (enhanced routes)
│   │   └── notifications.js ← NEW FILE — copy to backend/routes/
│   └── utils/
│       ├── razorpay.js    ← Replace existing
│       └── pdfGenerator.js ← Replace existing  (enhanced receipt)
```

---

## 🚀 Step-by-Step Integration

### 1. Copy Files
```bash
# from your project root
cp erp_fee_module/frontend/fees.html           frontend/fees.html
cp erp_fee_module/frontend/admin-fees.html     frontend/admin-fees.html
cp erp_fee_module/backend/server.js            backend/server.js
cp erp_fee_module/backend/routes/fees.js       backend/routes/fees.js
cp erp_fee_module/backend/routes/notifications.js  backend/routes/notifications.js
cp erp_fee_module/backend/utils/razorpay.js    backend/utils/razorpay.js
cp erp_fee_module/backend/utils/pdfGenerator.js    backend/utils/pdfGenerator.js
```

### 2. Install dependencies (if not already installed)
```bash
cd backend
npm install razorpay pdfkit nodemailer bcryptjs jsonwebtoken mongoose express cors dotenv
```

### 3. Add Razorpay Keys to `.env`
Get your API keys from https://dashboard.razorpay.com → Settings → API Keys
```env
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXXXXXXXXXXXXXXXX
```
> Use `rzp_test_` keys for development. Switch to `rzp_live_` for production.

### 4. Restart Server
```bash
node server.js
```

---

## ✅ Feature Checklist

### Parent Side (`/fees`)
- [x] View pending fees with status (Pending / Paid / Overdue / Partial)
- [x] Auto-overdue detection (past due date)
- [x] Pay online via Razorpay (UPI / Card / NetBanking / Wallet)
- [x] Download receipt PDF after payment
- [x] Payment history tab with all transactions
- [x] In-app notifications (bell icon)
- [x] Overdue banner warning
- [x] Stats: Total / Paid / Balance / Overdue

### Admin Side (`/admin/fees`)
- [x] Dashboard with live stats + donut chart + bar charts
- [x] Create fee structures (class/section/term/type)
- [x] Bulk assign fees to students (paste student IDs)
- [x] Track paid/unpaid/overdue students (filterable)
- [x] View all transactions with search + pagination
- [x] Export transactions to CSV
- [x] Generate date-range reports with payment method breakdown
- [x] Export reports to CSV
- [x] Send bulk email reminders to parents with pending fees
- [x] In-app notifications for parents auto-created on reminder

## 🚍 Bus Tracking Features You Can Add

### Parent Side
- View live bus location
- Estimated arrival time (ETA)
- Bus route map
- Driver details
- Notifications

Example parent view:

Bus No: `KA01AB1234`
Current Location: Marathahalli
ETA: 8:20 AM
Status: Arriving

### Admin Side
- Add buses
- Add routes
- Assign students to buses
- Monitor all buses
- View trip history

### Architecture
GPS Device / Mobile
       ↓
Node.js Backend
       ↓
MongoDB
       ↓
Parent Portal
       ↓
Live Map

---

## 📋 API Endpoints Added

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/fees/my-fees` | Parent | Get fees + summary |
| GET | `/api/fees/payment-history` | Parent | Payment history |
| POST | `/api/fees/create-order` | Any | Create Razorpay order |
| POST | `/api/fees/verify-payment` | Any | Verify + record payment |
| GET | `/api/fees/receipt/:id` | Any | Download PDF receipt |
| GET | `/api/razorpay/key` | Public | Get Razorpay public key |
| GET | `/api/fees/statistics` | Admin | Dashboard stats |
| POST | `/api/fees/structure` | Admin | Create fee structure |
| GET | `/api/fees/structures` | Admin | List fee structures |
| DELETE | `/api/fees/structure/:id` | Admin | Deactivate structure |
| POST | `/api/fees/bulk-create` | Admin | Bulk assign fees |
| GET | `/api/fees/track-payments` | Admin | Track paid/unpaid |
| GET | `/api/fees/transactions` | Admin | All transactions (paged) |
| GET | `/api/fees/report` | Admin | Date-range report |
| POST | `/api/fees/send-reminders` | Admin | Send email reminders |
| GET | `/api/notifications` | Auth | Get notifications |
| POST | `/api/notifications/mark-all-read` | Auth | Mark all read |

---

## 🔑 Razorpay Test Cards
| Type | Number | CVV | Expiry |
|------|--------|-----|--------|
| Visa | 4111 1111 1111 1111 | Any | Any future |
| MC   | 5267 3181 8797 5449 | Any | Any future |
| UPI  | success@razorpay | — | — |

---

## ⚠️ Important Notes
- Receipts are saved in `backend/uploads/` — ensure write permission
- The `uploads/` folder is auto-created on first payment
- In test mode, no real money is deducted
- Switch to `rzp_live_` keys + real credentials for production
 
