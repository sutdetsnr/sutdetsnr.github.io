/**
 * Wi-Fi QR backend (Google Apps Script + Google Sheets)
 *
 * - GET  ?action=list           -> public list of networks (anyone can read; the QR code contains the password anyway)
 * - POST {action:'login', password}            -> { ok, token }  (token valid 6 hours)
 * - POST {action:'save',  token, network}      -> { ok, networks }
 * - POST {action:'delete',token, id}           -> { ok, networks }
 *
 * The admin password lives in Script Properties (ADMIN_PASSWORD), never in the web page.
 */

const SHEET_NAME = 'WiFi';
const HEADERS = ['id', 'ssid', 'password', 'security', 'hidden', 'title', 'updatedAt'];
const LIST_CACHE_KEY = 'wifi_list_v1';
const TOKEN_TTL = 6 * 60 * 60;          // seconds
const MAX_FAILS = 20;                    // failed logins allowed per 10 minutes
const SECURITY_TYPES = ['WPA', 'WEP', 'nopass'];

/** Run once from the editor: creates the sheet and checks the admin password is set. */
function setup() {
  const sheet = getSheet_();
  const pw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  Logger.log('Sheet ready: ' + sheet.getName());
  Logger.log(pw ? 'ADMIN_PASSWORD is set.' : 'ยังไม่ได้ตั้ง ADMIN_PASSWORD: ไปที่ Project Settings > Script properties');
}

// ---------- HTTP entry points ----------

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'list';
  if (action === 'list') return json_({ ok: true, networks: listNetworks_() });
  return json_({ ok: false, message: 'ไม่รู้จักคำสั่งนี้' });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, message: 'ข้อมูลไม่ถูกต้อง' });
  }
  try {
    switch (body.action) {
      case 'login':  return json_(login_(body.password));
      case 'save':   return json_(withAdmin_(body.token, () => saveNetwork_(body.network)));
      case 'delete': return json_(withAdmin_(body.token, () => deleteNetwork_(body.id)));
      case 'logout': CacheService.getScriptCache().remove('tok_' + String(body.token || '')); return json_({ ok: true });
      default:       return json_({ ok: false, message: 'ไม่รู้จักคำสั่งนี้' });
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่' });
  }
}

// ---------- auth ----------

function login_(password) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('login_fails') || 0);
  if (fails >= MAX_FAILS) {
    return { ok: false, message: 'ลองผิดหลายครั้งเกินไป กรุณารอ 10 นาที' };
  }
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!expected) return { ok: false, message: 'ผู้ดูแลยังไม่ได้ตั้งรหัสผ่านในระบบ' };

  if (typeof password !== 'string' || password !== expected) {
    cache.put('login_fails', String(fails + 1), 600);
    Utilities.sleep(800); // slow down guessing
    return { ok: false, message: 'รหัสผ่านไม่ถูกต้อง' };
  }
  const token = Utilities.getUuid();
  cache.put('tok_' + token, '1', TOKEN_TTL);
  return { ok: true, token: token };
}

function withAdmin_(token, fn) {
  if (typeof token !== 'string' || !token ||
      !CacheService.getScriptCache().get('tok_' + token)) {
    return { ok: false, auth: false, message: 'หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่' };
  }
  return fn();
}

// ---------- data ----------

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Plain-text format: keeps leading zeros in passwords and stops formulas from running
    sheet.getRange('A:G').setNumberFormat('@');
  }
  return sheet;
}

function listNetworks_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(LIST_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const values = getSheet_().getDataRange().getValues();
  const list = values.slice(1)
    .filter(r => r[0] !== '' && r[1] !== '')
    .map(r => ({
      id: String(r[0]),
      ssid: String(r[1]),
      password: String(r[2]),
      security: SECURITY_TYPES.indexOf(String(r[3])) >= 0 ? String(r[3]) : 'WPA',
      hidden: String(r[4]) === 'true',
      title: String(r[5])
    }));
  const str = JSON.stringify(list);
  if (str.length < 90000) cache.put(LIST_CACHE_KEY, str, 600);
  return list;
}

function validate_(n) {
  if (!n || typeof n !== 'object') return 'ข้อมูลไม่ถูกต้อง';
  const ssid = String(n.ssid || '');
  const pw = String(n.password || '');
  const sec = String(n.security || '');
  if (!ssid) return 'กรุณากรอกชื่อ Wi-Fi';
  if (ssid.length > 64) return 'ชื่อ Wi-Fi ยาวเกินไป';
  if (SECURITY_TYPES.indexOf(sec) < 0) return 'ประเภทความปลอดภัยไม่ถูกต้อง';
  if (sec !== 'nopass' && !pw) return 'กรุณากรอกรหัสผ่าน';
  if (sec === 'WPA' && (pw.length < 8 || pw.length > 63)) return 'รหัสผ่าน WPA ต้องมี 8–63 ตัวอักษร';
  if (String(n.title || '').length > 100) return 'หัวข้อยาวเกินไป';
  return '';
}

function saveNetwork_(n) {
  const err = validate_(n);
  if (err) return { ok: false, message: err };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, message: 'ระบบกำลังบันทึกข้อมูลอื่น กรุณาลองใหม่' };
  try {
    const sheet = getSheet_();
    const sec = String(n.security);
    const id = n.id ? String(n.id) : Utilities.getUuid().slice(0, 8);
    const row = [
      id,
      String(n.ssid),
      sec === 'nopass' ? '' : String(n.password),
      sec,
      n.hidden ? 'true' : 'false',
      String(n.title || ''),
      new Date().toISOString()
    ];
    const found = n.id ? sheet.getRange('A:A').createTextFinder(id).matchEntireCell(true).findNext() : null;
    const rowIndex = found && found.getRow() > 1 ? found.getRow() : sheet.getLastRow() + 1;
    const range = sheet.getRange(rowIndex, 1, 1, HEADERS.length);
    range.setNumberFormat('@');
    range.setValues([row]);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove(LIST_CACHE_KEY);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, networks: listNetworks_() };
}

function deleteNetwork_(id) {
  if (typeof id !== 'string' || !id) return { ok: false, message: 'ไม่พบรายการ' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, message: 'ระบบกำลังบันทึกข้อมูลอื่น กรุณาลองใหม่' };
  try {
    const sheet = getSheet_();
    const found = sheet.getRange('A:A').createTextFinder(id).matchEntireCell(true).findNext();
    if (!found || found.getRow() < 2) return { ok: false, message: 'ไม่พบรายการ' };
    sheet.deleteRow(found.getRow());
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove(LIST_CACHE_KEY);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, networks: listNetworks_() };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
