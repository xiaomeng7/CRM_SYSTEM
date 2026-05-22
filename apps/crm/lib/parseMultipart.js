/**
 * Minimal multipart/form-data parser (no extra dependencies).
 * Used for bank CSV upload only; does not persist files.
 */

function parseMultipartBuffer(buffer, contentType) {
  const ct = String(contentType || '');
  const m = ct.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!m) throw new Error('Missing multipart boundary');
  const boundary = m[1] || m[2];
  const delim = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(delim);
  if (start < 0) throw new Error('Invalid multipart body');

  while (start >= 0) {
    let headerStart = start + delim.length;
    if (buffer[headerStart] === 45 && buffer[headerStart + 1] === 45) break;
    if (buffer[headerStart] === 13 && buffer[headerStart + 1] === 10) headerStart += 2;
    else if (buffer[headerStart] === 10) headerStart += 1;

    const headerEnd = buffer.indexOf('\r\n\r\n', headerStart);
    if (headerEnd < 0) break;
    const headerText = buffer.slice(headerStart, headerEnd).toString('utf8');
    let bodyStart = headerEnd + 4;
    const next = buffer.indexOf(delim, bodyStart);
    if (next < 0) break;
    let bodyEnd = next;
    if (buffer[bodyEnd - 2] === 13 && buffer[bodyEnd - 1] === 10) bodyEnd -= 2;
    else if (buffer[bodyEnd - 1] === 10) bodyEnd -= 1;

    const nameMatch = headerText.match(/name="([^"]+)"/i);
    const filenameMatch = headerText.match(/filename="([^"]*)"/i);
    const name = nameMatch ? nameMatch[1] : null;
    parts.push({
      name,
      filename: filenameMatch ? filenameMatch[1] : null,
      body: buffer.slice(bodyStart, bodyEnd),
    });
    start = next;
  }
  return parts;
}

function fieldsFromParts(parts) {
  const fields = {};
  const files = {};
  for (const p of parts) {
    if (!p.name) continue;
    if (p.filename != null && p.filename !== '') {
      files[p.name] = { filename: p.filename, buffer: p.body };
    } else {
      fields[p.name] = p.body.toString('utf8');
    }
  }
  return { fields, files };
}

module.exports = {
  parseMultipartBuffer,
  fieldsFromParts,
};
