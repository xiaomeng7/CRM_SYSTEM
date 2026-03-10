const { Resend } = require('resend');
const crypto = require('crypto');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SNAPSHOT_SIGNING_SECRET = process.env.SNAPSHOT_SIGNING_SECRET;
const SITE_URL = process.env.SITE_URL || ''; // 用于邮件里的「Create ServiceM8 Job」链接，如 https://yoursite.netlify.app
const TO_EMAIL = process.env.BOOKING_TO_EMAIL || 'info@bhtechnology.com.au';
const FROM_EMAIL = process.env.PDF_FROM_EMAIL || 'onboarding@resend.dev';
const FROM_NAME = process.env.PDF_FROM_NAME || 'Better Home Technology';
const LEAD_TOKEN_VERSION = 'v1';

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asBooleanOrUndefined(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === 'yes' || v === '1') return true;
    if (v === 'false' || v === 'no' || v === '0') return false;
  }
  return undefined;
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 20);
}

function deriveSnapshotIntake(body) {
  const profile = asString(body.profile);
  const profileDeclared = asString(body.profileDeclared);
  const primaryGoal = asString(body.primaryGoal);
  const managerMode = asString(body.managerMode || body.investorManagerMode);
  const portfolioSizeBand = asString(body.portfolioSizeBand);
  const billBand = asString(body.billBand);
  const tenantChangeSoon = asBooleanOrUndefined(body.tenantChangeSoon);
  const billUploadWilling = asBooleanOrUndefined(body.billUploadWilling);
  const allElectricNoGas = asBooleanOrUndefined(body.allElectricNoGas);
  const devices = asStringArray(body.devices);
  const symptoms = asStringArray(body.symptoms);
  const hasSolar = asBooleanOrUndefined(body.hasSolar);
  const hasBattery = asBooleanOrUndefined(body.hasBattery);
  const hasEv = asBooleanOrUndefined(body.hasEv);

  return {
    profile: profile || undefined,
    profileDeclared: profileDeclared || undefined,
    primaryGoal: primaryGoal || undefined,
    tenantChangeSoon,
    managerMode: managerMode || undefined,
    portfolioSizeBand: portfolioSizeBand || undefined,
    billBand: billBand || undefined,
    billUploadWilling,
    allElectricNoGas,
    devices,
    symptoms,
    hasSolar: hasSolar !== undefined ? hasSolar : devices.includes('solar'),
    hasBattery: hasBattery !== undefined ? hasBattery : devices.includes('battery'),
    hasEv: hasEv !== undefined ? hasEv : devices.includes('ev'),
  };
}

function deriveAesKey(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function encryptLeadPayload(payload, secret) {
  const iv = crypto.randomBytes(12);
  const key = deriveAesKey(secret);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return LEAD_TOKEN_VERSION + '.' + iv.toString('base64url') + '.' + encrypted.toString('base64url') + '.' + tag.toString('base64url');
}

function buildLeadEmailEn(payload) {
  const name = payload.name, phone = payload.phone, email = payload.email, notes = payload.notes, summary = payload.summary || '(none)';
  return 'Hello,\n\nI\'ve just completed the Electrical Risk Snapshot on your website and would like to request an independent electrical assessment.\n\nMy details are below:\n\nName: ' + name + '\nPhone: ' + phone + '\nEmail: ' + email + '\n\nProperty type:\n• Investment property\n\nReason for enquiry:\n• I would like clearer visibility and independent advice before making future electrical decisions.\n\n' + (notes ? 'Additional notes:\n• ' + notes + '\n\n' : '') + 'Snapshot summary (for reference):\n' + summary + '\n\nPlease let me know the next steps.\n\nKind regards,\n' + name + '\n';
}

function buildQuickCallEmailEn(payload) {
  const name = payload.name, phone = payload.phone, email = payload.email, suburb = payload.suburb, dateReadable = payload.dateReadable || '(not set)', window = payload.window || '(not set)', notes = payload.notes, summary = payload.summary || '(none)';
  return 'Hello,\n\nI\'ve just completed the Electrical Risk Snapshot and would like to request a quick suitability call.\n\nMy details are below:\n\nName: ' + name + '\nPhone: ' + phone + '\nEmail: ' + email + '\n' + (suburb ? 'Property area: ' + suburb + '\n' : '') + '\nPreferred call time (Adelaide):\nDate: ' + dateReadable + '\nWindow: ' + window + '\n\n' + (notes ? 'Notes:\n' + notes + '\n\n' : '') + 'Snapshot summary (for reference):\n' + summary + '\n\nKind regards,\n' + name + '\n';
}

function buildQuickCallEmailZh(payload) {
  const { name, phone, email, address, slot, note, summary, utm, page } = payload;
  let body = '您好，BH Technology 团队：\n\n';
  body += '我刚完成【电路风险快照】，希望预约 15 分钟免费解读快照结果。\n\n';
  body += '【联系方式】\n';
  body += '姓名：' + (name || '') + '\n';
  body += '电话：' + (phone || '') + '\n';
  body += '邮箱：' + (email || '') + '\n';
  if (address) body += '地址：' + address + '\n';
  if (slot) body += '期望通话时间：' + slot + '\n';
  if (note) body += '备注：' + note + '\n';
  body += '\n【快照选择结果】\n';
  body += summary || '(无)';
  body += '\n\n【我的来源】\n';
  body += 'utm：' + (utm || '未标记') + '\n';
  body += '页面：' + (page || '') + '\n\n谢谢！\n';
  return body;
}

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

  const type = body.type === 'quickcall' ? 'quickcall' : 'lead';
  const lang = (body.lang || 'en').toLowerCase() === 'zh' ? 'zh' : 'en';
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  const email = (body.email || '').trim();

  if (!name || !phone || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing name, phone or email' }) };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email' }) };
  }

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Email service not configured' }) };
  }

  let text, subject;
  const subPrefix = lang === 'zh' ? '[电路风险快照] ' : '[Risk Snapshot] ';
  if (type === 'lead') {
    subject = subPrefix + 'Request for Independent Electrical Risk Assessment';
    text = buildLeadEmailEn({
      name,
      phone,
      email,
      notes: (body.notes || '').trim(),
      summary: body.summary || '',
    });
  } else if (lang === 'zh') {
    subject = subPrefix + '预约 15 分钟免费解读快照结果';
    text = buildQuickCallEmailZh({
      name,
      phone,
      email,
      address: (body.address || '').trim(),
      slot: (body.slot || '').trim(),
      note: (body.note || '').trim(),
      summary: body.summary || '',
      utm: body.utm || '',
      page: body.page || '',
    });
  } else {
    subject = subPrefix + 'Request a quick suitability call';
    text = buildQuickCallEmailEn({
      name,
      phone,
      email,
      suburb: (body.suburb || '').trim(),
      dateReadable: body.dateReadable || '',
      window: body.window || '',
      notes: (body.notes || '').trim(),
      summary: body.summary || '',
    });
  }

  // 生成 ServiceM8 签名链接（用于邮件正文 + 返回给前端）
  let servicem8 = null;
  let html = null;
  const snapshotIntake = deriveSnapshotIntake(body);
  if (SNAPSHOT_SIGNING_SECRET) {
    const address = type === 'lead' ? (body.address || '') : (body.address || body.suburb || '');
    const payload = {
      name,
      email,
      phone,
      address: (address || '').trim(),
      summary: (body.summary || '').trim(),
      notes: (type === 'lead' ? (body.notes || '') : (body.note || body.notes || '')).trim(),
      snapshot_intake: snapshotIntake,
      submitted_at: Date.now(),
    };
    const leadId = encryptLeadPayload(payload, SNAPSHOT_SIGNING_SECRET);
    const timestamp = String(Date.now());
    const sig = crypto.createHmac('sha256', SNAPSHOT_SIGNING_SECRET).update(leadId + timestamp).digest('hex');
    servicem8 = { lead_id: leadId, timestamp, sig };
    if (SITE_URL) {
      const base = SITE_URL.replace(/\/$/, '');
      const link = base + '/.netlify/functions/createServiceM8Job?lead_id=' + encodeURIComponent(leadId) + '&timestamp=' + encodeURIComponent(timestamp) + '&sig=' + encodeURIComponent(sig);
      const linkLine = lang === 'zh'
        ? '\n\n---\n创建 ServiceM8 工单（点击下方链接）：\n' + link
        : '\n\n---\nCreate ServiceM8 Job (click link below):\n' + link;
      text = text + linkLine;
      const btnText = lang === 'zh' ? '创建 ServiceM8 工单' : 'Create ServiceM8 Job';
      const textForHtml = text.replace(linkLine, '').trim();
      const safeHtml = textForHtml.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>\n');
      html = '<div style="font-family:sans-serif;line-height:1.5;">' + safeHtml + '</div><p style="margin-top:20px;"><a href="' + link + '" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">' + btnText + '</a></p>';
    }
  }

  // 发件人显示为「快照客户」，收件人一眼能看出是 Snapshot 预约/询盘；实际发信仍用已验证域名
  const fromDisplay = (lang === 'zh' ? '电路风险快照 - ' : 'Risk Snapshot - ') + name;
  const resend = new Resend(RESEND_API_KEY);
  try {
    const emailPayload = {
      from: fromDisplay + ' <' + FROM_EMAIL + '>',
      to: TO_EMAIL,
      replyTo: email,
      subject: subject,
      text: text,
    };
    if (html) emailPayload.html = html;
    const result = await resend.emails.send(emailPayload);
    const data = result.data;
    const error = result.error;
    if (error) {
      console.error('Resend error:', error);
      return { statusCode: 502, body: JSON.stringify({ error: error.message || 'Failed to send' }) };
    }

    const response = { ok: true, id: data && data.id };
    if (servicem8) response.servicem8 = servicem8;
    return { statusCode: 200, body: JSON.stringify(response) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};
