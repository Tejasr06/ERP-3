const nodemailer = require('nodemailer');
const https = require('https');

function getTransporter() {
  const host = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
  const port = Number(process.env.BREVO_SMTP_PORT || 587);
  const secure = port === 465;
  const user = process.env.BREVO_SMTP_USER;
  const pass = process.env.BREVO_SMTP_KEY;

  if (!user || !pass) {
    throw new Error('Brevo SMTP is not configured. Set BREVO_SMTP_USER and BREVO_SMTP_KEY in .env');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function smsRecipient(phone) {
  const domain = (process.env.SMS_GATEWAY_DOMAIN || '').trim();
  const normalized = normalizePhone(phone);
  if (!domain || !normalized) return null;
  return `${normalized}@${domain}`;
}

function buildParentRecipients(parentEmail, parentPhone) {
  const recipients = [];
  if (parentEmail) recipients.push(parentEmail);
  const sms = smsRecipient(parentPhone);
  if (sms) recipients.push(sms);
  return recipients;
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<\/(p|div|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?\>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeRecipients(to) {
  if (!to) return [];
  return Array.isArray(to) ? to.filter(Boolean) : [to];
}

function formatBrevoRecipients(to) {
  return normalizeRecipients(to).map(email => ({ email }));
}

function sendWithBrevoApi({ to, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const fromName = process.env.SCHOOL_NAME || 'EduConnect';

  if (!apiKey || !senderEmail) {
    throw new Error('Brevo API is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL in .env');
  }

  const recipients = formatBrevoRecipients(to);
  if (!recipients.length) {
    throw new Error('No email recipient');
  }

  const payload = JSON.stringify({
    sender: { email: senderEmail, name: fromName },
    to: recipients,
    subject,
    htmlContent: html,
    textContent: text
  });

  const options = {
    method: 'POST',
    hostname: 'api.brevo.com',
    path: '/v3/smtp/email',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      Authorization: `Bearer ${apiKey}`
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            resolve({ raw: body });
          }
        } else {
          reject(new Error(`Brevo API failed: ${res.statusCode} ${res.statusMessage} ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function sendMail(to, subject, html, text) {
  try {
    const recipients = normalizeRecipients(to);

    if (!recipients.length) {
      console.error("❌ No email recipient");
      return false;
    }

    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const emailText = text || htmlToText(html);

    if (process.env.BREVO_API_KEY) {
      const info = await sendWithBrevoApi({
        to: recipients,
        subject: subject,
        html: html,
        text: emailText
      });

      console.log("✅ Email sent via Brevo API →", recipients.join(", "));
      console.log("Brevo API response:", info.messageId || info.message_id || JSON.stringify(info));
      return true;
    }

    const transporter = getTransporter();

    const info = await transporter.sendMail({
      from: `"${process.env.SCHOOL_NAME || 'EduConnect'}" <${senderEmail}>`,
      to: recipients.join(', '),
      subject: subject,
      html: html,
      text: emailText
    });

    console.log("✅ Email sent →", recipients.join(", "));
    console.log("Message ID:", info.messageId);

    return true;

  } catch (err) {
    console.error("❌ Email failed:", err.message);
    return false;
  }
}

function passwordSetupEmail(parentName, email, studentName, setupUrl) {
  return `
  <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#0a1628;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#00c9a7,#4fc3f7);padding:32px;text-align:center;">
      <div style="font-size:2rem;font-weight:900;color:#0a1628;letter-spacing:-1px;">EduConnect</div>
      <div style="color:rgba(10,22,40,.7);font-size:.9rem;margin-top:4px;">${process.env.SCHOOL_NAME || 'Parent Portal'}</div>
    </div>
    <div style="padding:36px;color:#e8f0fe;">
      <h2 style="color:#00c9a7;margin:0 0 16px;font-size:1.4rem;">Welcome, ${parentName}!</h2>
      <p style="color:#8892a4;line-height:1.7;margin-bottom:24px;">Your parent portal account has been created for <strong style="color:#e8f0fe;">${studentName}</strong>. Use the button below to create your password, then sign in with <strong style="color:#e8f0fe;">${email}</strong>.</p>
      <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:20px;margin-bottom:24px;">
        <div><span style="color:#8892a4;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;">Login Email</span><div style="color:#e8f0fe;font-size:1rem;margin-top:4px;">${email}</div></div>
      </div>
      <p style="color:#f4c430;font-size:.85rem;margin-bottom:24px;">⚠️ This setup link expires in 7 days.</p>
      <a href="${setupUrl}" style="display:inline-block;background:linear-gradient(135deg,#00c9a7,#4fc3f7);color:#0a1628;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:1rem;">Set Your Password →</a>
      <p style="color:#8892a4;font-size:.8rem;margin-top:28px;border-top:1px solid rgba(255,255,255,.08);padding-top:20px;">Questions? Contact us at ${process.env.EMAIL_USER}<br>${process.env.SCHOOL_NAME || 'School'} • ${process.env.SCHOOL_PHONE || ''}</p>
    </div>
  </div>`;
}

function notificationEmail(parentName, title, message, studentName) {
  return `
  <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#0a1628;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#00c9a7,#4fc3f7);padding:24px 32px;text-align:center;">
      <div style="font-size:1.6rem;font-weight:900;color:#0a1628;">EduConnect</div>
    </div>
    <div style="padding:32px;color:#e8f0fe;">
      <h2 style="color:#f4c430;margin:0 0 12px;">📢 ${title}</h2>
      <p style="color:#8892a4;margin-bottom:8px;">Dear ${parentName},</p>
      <p style="color:#e8f0fe;line-height:1.7;background:rgba(255,255,255,.05);padding:16px;border-radius:10px;border-left:3px solid #00c9a7;">${message}</p>
      <p style="color:#8892a4;font-size:.82rem;margin-top:20px;">This notification is for <strong>${studentName}</strong>. Log in to your portal for more details.</p>
      <p style="color:#8892a4;font-size:.78rem;margin-top:24px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px;">${process.env.SCHOOL_NAME} — Do not reply to this email.</p>
    </div>
  </div>`;
}

function attendanceAlertEmail(parentName, studentName, percentage) {
  return `
  <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#0a1628;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#ff6b6b,#f4c430);padding:24px 32px;text-align:center;">
      <div style="font-size:1.6rem;font-weight:900;color:#0a1628;">⚠️ Attendance Alert</div>
    </div>
    <div style="padding:32px;color:#e8f0fe;">
      <h2 style="color:#ff6b6b;margin:0 0 16px;">Low Attendance Warning</h2>
      <p style="color:#8892a4;line-height:1.7;">Dear <strong style="color:#e8f0fe;">${parentName}</strong>,<br><br>
      We wish to inform you that <strong style="color:#e8f0fe;">${studentName}</strong>'s attendance has dropped to <strong style="color:#ff6b6b;font-size:1.3rem;">${percentage}%</strong>, which is below the minimum required attendance of <strong>75%</strong>.</p>
      <div style="background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.3);border-radius:12px;padding:16px;margin:20px 0;">
        <p style="color:#ff6b6b;margin:0;font-size:.9rem;">Continued low attendance may affect your child's academic performance and eligibility for examinations. Please ensure regular attendance.</p>
      </div>
      <p style="color:#8892a4;font-size:.82rem;">Please contact the school if there are medical or personal reasons. — ${process.env.SCHOOL_NAME}</p>
    </div>
  </div>`;
}

async function sendMailToParent(parentEmail, parentPhone, subject, html, text) {
  const recipients = buildParentRecipients(parentEmail, parentPhone);
  if (!recipients.length) return false;
  return sendMail(recipients, subject, html, text);
}

function feePaymentSuccessEmail(studentName, parentName, amount, transactionId, term, paymentDate) {
  return `
  <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#0a1628;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#00c9a7,#4fc3f7);padding:24px 32px;text-align:center;">
      <div style="font-size:1.6rem;font-weight:900;color:#0a1628;">✓ Payment Successful</div>
    </div>
    <div style="padding:32px;color:#e8f0fe;">
      <p style="color:#8892a4;margin-bottom:24px;">Dear <strong style="color:#e8f0fe;">${parentName}</strong>,</p>
      <p style="color:#e8f0fe;line-height:1.7;margin-bottom:24px;">We confirm that the fee payment for <strong>${studentName}</strong> has been successfully received.</p>
      <div style="background:rgba(0,201,167,.1);border:1px solid rgba(0,201,167,.3);border-radius:12px;padding:20px;margin:20px 0;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <p style="color:#8892a4;font-size:.8rem;margin:0;text-transform:uppercase;">Amount Paid</p>
            <p style="color:#00c9a7;font-size:1.8rem;font-weight:700;margin:8px 0 0;">₹${parseFloat(amount).toFixed(2)}</p>
          </div>
          <div>
            <p style="color:#8892a4;font-size:.8rem;margin:0;text-transform:uppercase;">Transaction ID</p>
            <p style="color:#e8f0fe;font-size:.9rem;margin:8px 0 0;word-break:break-all;">${transactionId}</p>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;border-top:1px solid rgba(0,201,167,.2);padding-top:16px;">
          <div>
            <p style="color:#8892a4;font-size:.8rem;margin:0;text-transform:uppercase;">Fee Term</p>
            <p style="color:#e8f0fe;font-size:.9rem;margin:8px 0 0;">${term}</p>
          </div>
          <div>
            <p style="color:#8892a4;font-size:.8rem;margin:0;text-transform:uppercase;">Payment Date</p>
            <p style="color:#e8f0fe;font-size:.9rem;margin:8px 0 0;">${paymentDate}</p>
          </div>
        </div>
      </div>
      <p style="color:#8892a4;font-size:.82rem;margin-top:24px;">A detailed receipt has been attached to this email. You can also download it from your parent portal dashboard.</p>
      <p style="color:#8892a4;font-size:.78rem;margin-top:24px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px;">${process.env.SCHOOL_NAME} — For assistance, reply to this email or contact the school.</p>
    </div>
  </div>`;
}

function feeDueReminderEmail(studentName, parentName, amount, dueDate, term) {
  return `
  <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#0a1628;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#f4c430,#ff6b6b);padding:24px 32px;text-align:center;">
      <div style="font-size:1.6rem;font-weight:900;color:#0a1628;">📌 Fee Due Reminder</div>
    </div>
    <div style="padding:32px;color:#e8f0fe;">
      <p style="color:#8892a4;margin-bottom:24px;">Dear <strong style="color:#e8f0fe;">${parentName}</strong>,</p>
      <p style="color:#e8f0fe;line-height:1.7;margin-bottom:24px;">This is a friendly reminder that the <strong>${term}</strong> fee for <strong>${studentName}</strong> is due.</p>
      <div style="background:rgba(244,196,48,.1);border:1px solid rgba(244,196,48,.3);border-radius:12px;padding:20px;margin:20px 0;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <p style="color:#8892a4;font-size:.8rem;margin:0;text-transform:uppercase;">Amount Due</p>
            <p style="color:#f4c430;font-size:1.8rem;font-weight:700;margin:8px 0 0;">₹${parseFloat(amount).toFixed(2)}</p>
          </div>
          <div>
            <p style="color:#8892a4;font-size:.8rem;margin:0;text-transform:uppercase;">Due Date</p>
            <p style="color:#e8f0fe;font-size:.9rem;margin:8px 0 0;">${dueDate}</p>
          </div>
        </div>
      </div>
      <p style="color:#8892a4;font-size:.82rem;margin-top:24px;">Please pay the fee before the due date to avoid late fees. You can pay online using the parent portal with multiple payment options including UPI, Card, and NetBanking.</p>
      <p style="color:#8892a4;font-size:.78rem;margin-top:24px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px;">${process.env.SCHOOL_NAME} — For assistance, reply to this email or contact the school.</p>
    </div>
  </div>`;
}

// Enhanced sendMailToParent to support options object
async function sendMailToParentWithOptions(email, options = {}) {
  const { subject, amount, transactionId, term, paymentDate, dueDate, studentName, parentName, reminderType } = options;
  let html, text;

  if (reminderType === 'pending') {
    html = feeDueReminderEmail(studentName, parentName, amount, dueDate, term);
    text = `Fee reminder: ${term} fee of ₹${amount} is due by ${dueDate}.`;
  } else {
    // Payment success
    html = feePaymentSuccessEmail(studentName, parentName, amount, transactionId, term, paymentDate);
    text = `Payment successful: ₹${amount} for ${term} fees.`;
  }

  return sendMail(email, subject || 'Fee Notification', html, text);
}

module.exports = { 
  sendMail, 
  sendMailToParent, 
  sendMailToParentWithOptions,
  passwordSetupEmail, 
  notificationEmail, 
  attendanceAlertEmail,
  feePaymentSuccessEmail,
  feeDueReminderEmail,
};
