/**
 * Njoro wa Uba Scene Tracker: the part that writes.
 *
 * Lives inside the "Njoro wa Uba Scene Tracker Data" Google Sheet
 * (Extensions > Apps Script). It runs as the Sheet's owner, so it can write
 * to the Sheet and look through the log sheets folder. The app sends it the
 * continuity passcode with every change; anyone without the passcode is refused.
 *
 * The passcode is NOT in this file. Set it in Project Settings > Script
 * Properties as PASSCODE.
 */

var SHEET_NAME = 'Reports';
var LOG_ROOT_ID = '1KQgFJwqSnT5e3fR0aS7sNptej30-5Bs9'; // log sheets folder
var TZ = 'Africa/Nairobi';
var VERSION = 1;

/* ---------- entry points ---------- */

function doGet() {
  return json_({ ok: true, app: 'njoro-tracker', version: VERSION });
}

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'bad_request' }); }

  var gate = checkPasscode_(body.passcode);
  if (gate) return json_({ ok: false, error: gate });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'busy' });
  try {
    if (body.action === 'check') return json_({ ok: true });
    if (body.action === 'save') return json_(save_(String(body.report || ''), String(body.log || '').trim()));
    if (body.action === 'remove') return json_(remove_(Number(body.day)));
    return json_({ ok: false, error: 'bad_request' });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/** Run once from the editor: authorises the script and starts the
 *  every-30-minutes job that attaches log sheets uploaded after the report. */
function setup() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'linkMissingLogs';
  });
  if (!exists) ScriptApp.newTrigger('linkMissingLogs').timeBased().everyMinutes(30).create();
  sheet_(); DriveApp.getFolderById(LOG_ROOT_ID).getName();
  if (!PropertiesService.getScriptProperties().getProperty('PASSCODE')) {
    throw new Error('Setup ran, but no PASSCODE is set yet. Add it in Project Settings > Script Properties.');
  }
  return 'Ready';
}

/** Fills in the log sheet link for any day that does not have one yet. */
function linkMissingLogs() {
  var sh = sheet_(), rows = rows_(sh), found = 0;
  rows.forEach(function (r) {
    if (r.log || !r.day) return;
    var hit = findLog_(r.day, r.iso);
    if (hit) { sh.getRange(r.row, 3).setValue(hit.url); found++; }
  });
  return found;
}

/* ---------- actions ---------- */

function save_(report, log) {
  report = report.replace(/\r/g, '').trim();
  var info = parseHead_(report);
  if (!info.day) return { ok: false, error: 'no_day' };
  if (!/\d+\s*\/\s*\d+/.test(report)) return { ok: false, error: 'no_scenes' };
  if (log && !/^https:\/\/(drive|docs)\.google\.com\//.test(log)) return { ok: false, error: 'bad_link' };

  var sh = sheet_(), rows = rows_(sh), same = rows.filter(function (r) { return r.day === info.day; });
  var stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
  var logOut = log || (same.length ? same[same.length - 1].log : '');
  var logName = '';
  if (!logOut) { var hit = findLog_(info.day, info.iso); if (hit) { logOut = hit.url; logName = hit.name; } }

  var row;
  if (same.length) {
    row = same[same.length - 1].row;
    // Older duplicates of the same day go, bottom up so row numbers stay valid.
    same.slice(0, -1).map(function (r) { return r.row; }).sort(function (a, b) { return b - a; })
      .forEach(function (n) { sh.deleteRow(n); if (n < row) row--; });
  } else {
    row = Math.max(sh.getLastRow(), 1) + 1;
  }
  var range = sh.getRange(row, 1, 1, 3);
  range.setNumberFormat('@');
  range.setValues([[stamp, report, logOut]]);
  return { ok: true, day: info.day, replaced: same.length > 0, log: logOut, logName: logName, logFound: !!logOut };
}

function remove_(day) {
  if (!day) return { ok: false, error: 'bad_request' };
  var sh = sheet_(), rows = rows_(sh).filter(function (r) { return r.day === day; });
  if (!rows.length) return { ok: false, error: 'not_found' };
  rows.map(function (r) { return r.row; }).sort(function (a, b) { return b - a; })
    .forEach(function (n) { sh.deleteRow(n); });
  return { ok: true, day: day, removed: rows.length };
}

/* ---------- passcode ---------- */

function checkPasscode_(given) {
  var props = PropertiesService.getScriptProperties();
  var real = props.getProperty('PASSCODE');
  if (!real) return 'not_set_up';
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('fails') || 0);
  if (fails >= 10) return 'locked';               // 10 wrong tries locks uploads for 15 minutes
  if (!same_(String(given || ''), real)) {
    cache.put('fails', String(fails + 1), 900);
    return 'wrong_passcode';
  }
  return '';
}

function same_(a, b) {
  var x = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a);
  var y = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b);
  var diff = 0;
  for (var i = 0; i < x.length; i++) diff |= (x[i] ^ y[i]);
  return diff === 0;
}

/* ---------- sheet ---------- */

function sheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('No tab called ' + SHEET_NAME);
  return sh;
}

function rows_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 3).getDisplayValues().map(function (v, i) {
    var info = parseHead_(v[1] || '');
    return { row: i + 2, day: info.day, iso: info.iso, log: String(v[2] || '').trim() };
  });
}

/* ---------- reading a report ---------- */

var MONTHS_ = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function parseHead_(raw) {
  var out = { day: 0, iso: '' };
  String(raw).split('\n').forEach(function (line0) {
    var line = line0.replace(/[*_~]/g, '').replace(/\s+/g, ' ').trim(), m;
    if (!out.day && (m = /^shoot\s*day\s*[:\-]?\s*(\d+)/i.exec(line))) out.day = Number(m[1]);
    if (!out.iso && (m = /^date\s*[:\-]\s*(.+)$/i.exec(line))) out.iso = inferIso_(m[1]);
  });
  return out;
}

function inferIso_(t) {
  var m, y, mo, d, now = new Date();
  function guessYear(mo, d) { var yy = now.getFullYear(); if (new Date(yy, mo - 1, d) - now > 60 * 864e5) yy--; return yy; }
  if ((m = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/.exec(t))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else if ((m = /(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+(\d{4}))?/i.exec(t))) {
    d = +m[1]; mo = MONTHS_.indexOf(m[2].toLowerCase()) + 1; y = m[3] ? +m[3] : guessYear(mo, d);
  } else if ((m = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i.exec(t))) {
    d = +m[2]; mo = MONTHS_.indexOf(m[1].toLowerCase()) + 1; y = m[3] ? +m[3] : guessYear(mo, d);
  } else return '';
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return '';
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
}

/* ---------- finding the log sheet ---------- */

/** A PDF in the log sheets folder (or any folder inside it) whose name has
 *  BOTH the shoot day and the date, like "Day 8 8.10.2026.pdf". */
function logMatch_(name, day, iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return false;
  var dayRe = new RegExp('^\\s*day\\s*0*' + day + '(?!\\d)', 'i');
  var dateRe = new RegExp('(^|\\D)0?' + Number(m[3]) + '\\s*[./-]\\s*0?' + Number(m[2]) + '\\s*[./-]\\s*(?:' + m[1] + '|' + m[1].slice(2) + ')(?!\\d)');
  return dayRe.test(name) && dateRe.test(name);
}

function findLog_(day, iso) {
  if (!day || !iso) return null;
  var best = null, queue = [{ folder: DriveApp.getFolderById(LOG_ROOT_ID), depth: 0 }];
  while (queue.length) {
    var item = queue.shift(), files = item.folder.getFilesByType(MimeType.PDF);
    while (files.hasNext()) {
      var f = files.next();
      if (f.isTrashed() || !logMatch_(f.getName(), day, iso)) continue;
      if (!best || f.getDateCreated() > best.created) best = { url: 'https://drive.google.com/file/d/' + f.getId() + '/view', name: f.getName(), created: f.getDateCreated() };
    }
    if (item.depth < 4) {
      var subs = item.folder.getFolders();
      while (subs.hasNext()) queue.push({ folder: subs.next(), depth: item.depth + 1 });
    }
  }
  return best;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
