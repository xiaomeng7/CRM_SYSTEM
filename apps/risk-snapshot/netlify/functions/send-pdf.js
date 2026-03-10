const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.PDF_FROM_EMAIL || 'onboarding@resend.dev';
const FROM_NAME = process.env.PDF_FROM_NAME || 'Better Home Technology';

const PDF_EN = 'investment property check guide.pdf';
const PDF_ZH = 'investment property check guide CN.pdf';

const BODY_EN = `Thank you for completing the Electrical Risk Snapshot.

As promised, please find attached the Investment Property Electrical Risk Checklist. We hope it helps you plan ahead and spot potential issues early.

If you’d like to discuss your results or book an independent assessment, just reply to this email or contact us at info@bhtechnology.com.au.

Best regards,
Better Home Technology`;

const BODY_ZH = `感谢您完成电路风险快照。

随信附上《投资房电气风险自查指南》，希望对您提前规划和排查潜在问题有帮助。

如需解读结果或预约独立评估，直接回复本邮件或联系 info@bhtechnology.com.au。

此致，
Better Home Technology`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const email = (body.email || '').trim();
  const lang = (body.lang || 'en').toLowerCase() === 'zh' ? 'zh' : 'en';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email' }) };
  }

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Email service not configured' }),
    };
  }

  const origin = event.headers.origin || event.headers.Origin || process.env.URL || 'https://yoursite.netlify.app';
  const base = String(origin).replace(/\/$/, '');
  const pdfPath = lang === 'zh' ? encodeURIComponent(PDF_ZH) : encodeURIComponent(PDF_EN);
  const pdfUrl = base + '/' + pdfPath;
  const filename = lang === 'zh' ? 'Investment_Property_Electrical_Risk_Checklist_CN.pdf' : 'Investment_Property_Electrical_Risk_Checklist.pdf';
  const subject = lang === 'zh' ? '您的《投资房电气风险自查指南》' : 'Your Investment Property Electrical Risk Checklist';

  const resend = new Resend(RESEND_API_KEY);

  try {
    const pdfBuf = await fetch(pdfUrl).then(function(r) {
      if (!r.ok) throw new Error('PDF fetch failed');
      return r.arrayBuffer();
    });
    const result = await resend.emails.send({
      from: FROM_NAME + ' <' + FROM_EMAIL + '>',
      to: email,
      subject: subject,
      text: lang === 'zh' ? BODY_ZH : BODY_EN,
      attachments: [{ filename: filename, content: Buffer.from(pdfBuf) }],
    });
    const data = result.data;
    const error = result.error;

    if (error) {
      console.error('Resend error:', error);
      return { statusCode: 502, body: JSON.stringify({ error: error.message || 'Failed to send' }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, id: data && data.id }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};
