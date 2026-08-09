// ╔═══════════════════════════════════════════╗
// ║   EduConnect — Enhanced PDF Receipt       ║
// ╚═══════════════════════════════════════════╝
const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const generateReceiptPDF = (data) => new Promise((resolve, reject) => {
  try {
    const fileName  = data.fileName || `receipt_${data.transactionId}_${Date.now()}.pdf`;
    const filePath  = data.filePath ? data.filePath : path.join(uploadsDir, fileName);
    const doc       = new PDFDocument({ margin: 50, size: 'A4' });
    const stream    = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // ── Colors ──
    const C_PRIMARY  = '#000000';
    const C_DARK     = '#000000';
    const C_GRAY     = '#444444';
    const C_TEXT     = '#000000';
    const C_SUCCESS  = '#000000';
    const C_LIGHT    = '#f2f2f2';
    const C_BORDER   = '#d1d1d1';

    const W = 595 - 100; // usable width

    // ── Header ──
    doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(22)
       .text(data.schoolName || 'EduConnect School', 50, 28, { width: 400 });
    doc.fillColor(C_GRAY).font('Helvetica').fontSize(9)
       .text(data.schoolAddress || '', 50, 54)
       .text(data.schoolPhone  || '', 50, 66);

    // Receipt badge top-right
    doc.roundedRect(430, 24, 115, 44, 8).fill('#f2f2f2').stroke('#d1d1d1');
    doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(10).text('PAYMENT RECEIPT', 437, 30, { width: 100, align: 'center' });
    doc.font('Helvetica').fontSize(8).text(new Date(data.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), 437, 50, { width: 100, align: 'center' });

    // ── Title ──
    doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(16).text('Fee Payment Receipt', 50, 120);
    doc.moveTo(50, 138).lineTo(545, 138).lineWidth(1).strokeColor('#d1d1d1').stroke();

    // ── Two-column info ──
    let y = 150;
    function kv(label, value, col = 0) {
      const x = col === 0 ? 50 : 310;
      doc.fillColor(C_GRAY).font('Helvetica').fontSize(8).text(label.toUpperCase(), x, y, { width: 100 });
      doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(10).text(String(value || '—'), x + 110, y - 1, { width: 130 });
    }

    kv('Transaction ID', data.transactionId, 0);   kv('Payment Date', new Date(data.paymentDate).toLocaleDateString('en-IN'), 1);
    y += 22;
    kv('Razorpay ID', data.razorpayPaymentId || '—', 0); kv('Order ID', data.razorpayOrderId || '—', 1);
    y += 22;
    kv('Payment Method', data.paymentMethod || 'Card', 0); kv('Status', 'SUCCESS', 1);

    // ── Section divider ──
    y += 30;
    doc.rect(50, y, W, 1).fill(C_BORDER);
    y += 12;

    // Student Details
    doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(11).text('Student Details', 50, y);
    y += 18;
    kv('Student ID',   data.studentId,   0);  kv('Class / Section', `${data.class || '—'} / ${data.section || '—'}`, 1);
    y += 22;
    kv('Student Name', data.studentName, 0);  kv('Parent', data.parentName || '—', 1);

    // ── Section divider ──
    y += 30;
    doc.rect(50, y, W, 1).fill(C_BORDER);
    y += 12;

    // Fee Details
    doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(11).text('Fee Details', 50, y);
    y += 18;
    kv('Term',     data.term,    0);  kv('Fee Type', data.feeType || 'Tuition Fee', 1);
    y += 22;
    kv('Due Date', data.dueDate ? new Date(data.dueDate).toLocaleDateString('en-IN') : '—', 0);

    // ── Amount box ──
    y += 36;
    doc.roundedRect(50, y, W, 60, 10).fill(C_LIGHT).stroke(C_BORDER).lineWidth(1);
    doc.fillColor(C_GRAY).font('Helvetica').fontSize(10).text('AMOUNT PAID', 70, y + 14);
    doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(26)
       .text(`Rs. ${parseFloat(data.amount).toFixed(2)}`, 70, y + 28, { width: W - 40 });

    // Status stamp (right side)
    doc.roundedRect(430, y + 12, 100, 32, 6).fill(C_LIGHT).stroke(C_BORDER).lineWidth(1);
    doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(12).text('PAID', 430, y + 21, { width: 100, align: 'center' });

    // ── Footer ──
    y += 90;
    doc.fillColor('#ffffff').rect(0, 730, 595, 112).fill();
    doc.fillColor(C_GRAY).font('Helvetica-Oblique').fontSize(8.5)
       .text('This is a computer-generated receipt. No manual signature is required.', 50, 742, { align: 'center', width: W })
       .text('For queries, contact the school finance department.', 50, 756, { align: 'center', width: W });
    doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(9)
       .text(data.schoolName || 'EduConnect School', 50, 774, { align: 'center', width: W });
    doc.fillColor(C_GRAY).font('Helvetica').fontSize(8)
       .text(data.schoolPhone || '', 50, 786, { align: 'center', width: W });

    doc.end();

    stream.on('finish', () => resolve({ fileName, filePath, url: `/api/receipts/${fileName}` }));
    stream.on('error',  reject);
  } catch (err) { reject(err); }
});

module.exports = { generateReceiptPDF };
