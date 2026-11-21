// ===== ตั้งค่า: วาง URL ของ Web App (Apps Script) ที่ได้จากการ Deploy ไว้ตรงนี้ =====
const WIFI_API_URL = '';
// ==============================================================================

const WifiQR = (() => {
  // Escape special characters per the Wi-Fi QR spec: \ ; , : "
  const esc = s => String(s).replace(/([\\;,:"])/g, '\\$1');

  function payload(n) {
    let s = `WIFI:T:${n.security};S:${esc(n.ssid)};`;
    if (n.security !== 'nopass') s += `P:${esc(n.password)};`;
    if (n.hidden) s += 'H:true;';
    return s + ';';
  }

  function wrapText(ctx, text, maxW) {
    const lines = []; let line = '';
    for (const ch of String(text)) {
      if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; }
      else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }

  // Draw a printable card (title + QR + Wi-Fi name / password) onto a canvas
  function drawCard(canvas, n, opts = {}) {
    const showPw = opts.showPassword !== false;
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const qr = qrcode(0, 'M');
    qr.addData(payload(n), 'Byte');
    qr.make();

    const W = 720, pad = 60, font = "'Sarabun', sans-serif";
    canvas.width = W;
    const ctx = canvas.getContext('2d');
    const count = qr.getModuleCount(), qrSize = W - pad * 2, cell = qrSize / (count + 8);

    ctx.font = `700 40px ${font}`;
    const titleLines = n.title ? wrapText(ctx, n.title, W - pad * 2) : [];
    ctx.font = `600 32px ${font}`;
    const info = [['ชื่อ Wi-Fi', n.ssid]];
    if (n.security !== 'nopass' && showPw) info.push(['รหัสผ่าน', n.password]);
    const infoLines = info.map(([k, v]) => [k, wrapText(ctx, v, W - pad * 2 - 200)]);
    const infoH = infoLines.reduce((h, [, l]) => h + l.length * 44 + 8, 0);
    const H = Math.ceil(pad + titleLines.length * 52 + (titleLines.length ? 10 : 0) + qrSize + 20 + infoH + pad - 20);
    canvas.height = H;

    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#111'; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    let y = pad - 10;
    ctx.font = `700 40px ${font}`;
    for (const l of titleLines) { ctx.fillText(l, W / 2, y); y += 52; }
    if (titleLines.length) y += 10;

    const ox = pad + cell * 4, oy = y + cell * 4;   // 4-module quiet zone
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++)
      if (qr.isDark(r, c)) ctx.fillRect(Math.floor(ox + c * cell), Math.floor(oy + r * cell), Math.ceil(cell), Math.ceil(cell));
    y += qrSize + 20;

    ctx.textAlign = 'left';
    for (const [k, lines] of infoLines) {
      ctx.font = `400 30px ${font}`; ctx.fillStyle = '#555';
      ctx.fillText(k, pad, y + 2);
      ctx.font = `600 32px ${font}`; ctx.fillStyle = '#111';
      for (const l of lines) { ctx.fillText(l, pad + 200, y); y += 44; }
      y += 8;
    }
  }

  function download(canvas, ssid) {
    const a = document.createElement('a');
    a.download = `wifi-${String(ssid).replace(/[^\w฀-๿-]+/g, '_')}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  function validate(n) {
    if (!n.ssid) return 'กรุณากรอกชื่อ Wi-Fi';
    if (n.security !== 'nopass' && !n.password) return 'กรุณากรอกรหัสผ่าน';
    if (n.security === 'WPA' && (n.password.length < 8 || n.password.length > 63))
      return 'รหัสผ่าน WPA ต้องมี 8–63 ตัวอักษร';
    return '';
  }

  // ---- API ----
  async function list() {
    const res = await fetch(`${WIFI_API_URL}?action=list`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // text/plain avoids a CORS preflight, which Apps Script cannot answer
  async function post(body) {
    const res = await fetch(WIFI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // Canvas text needs the web font loaded first
  const fontsReady = () => Promise.all(['400 30px Sarabun', '600 32px Sarabun', '700 40px Sarabun']
    .map(f => document.fonts.load(f, 'กขWiFi'))).catch(() => {});

  return { fontsReady, payload, drawCard, download, validate, list, post, configured: () => !!WIFI_API_URL };
})();
