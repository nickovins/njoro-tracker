/**
 * Njoro wa Uba Scene Tracker: the part that writes.
 *
 * Lives inside the "Njoro wa Uba Scene Tracker Data" Google Sheet
 * (Extensions > Apps Script) and runs as the Sheet's owner.
 *
 * What it is allowed to do (fixed in appsscript.json, Google enforces it):
 *   - edit THIS spreadsheet only            (spreadsheets.currentonly)
 *   - look at Drive files, never change them (drive.readonly)
 *   - make and delete its OWN temporary files  (drive.file): to read the
 *     scene list in a script PDF, it turns a copy into text, reads it,
 *     and deletes the copy. It cannot touch any file it did not create.
 *   - run itself every 30 minutes           (script.scriptapp)
 * It has no access to Gmail, Calendar, Contacts or any other spreadsheet.
 * In Drive it only ever opens the log sheets and scripts folders below.
 *
 * Every change needs the continuity passcode, stored in Project Settings >
 * Script Properties as PASSCODE. It is never in this file or in the app.
 */

var SHEET_NAME = 'Reports';
var LOG_ROOT_ID = '1KQgFJwqSnT5e3fR0aS7sNptej30-5Bs9'; // log sheets folder
var SCRIPTS_ROOT_ID = '1keWRPeybj1YUOr8c6MtPNM-tHS-zmnjZ'; // episode scripts folder
var SCRIPTS_TAB = 'Scripts';
var TZ = 'Africa/Nairobi';
var VERSION = 5;
var EPISODES = 52;

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

  // Reading post production needs the passcode but no lock.
  if (body.action === 'post') return json_(postAll_());

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'busy' });
  try {
    if (body.action === 'check') return json_({ ok: true });
    if (body.action === 'save') return json_(withRows_(save_(String(body.report || ''), String(body.log || '').trim(), Number(body.originalDay) || 0)));
    if (body.action === 'saveMany') return json_(withRows_(saveMany_(body.reports)));
    if (body.action === 'remove') return json_(withRows_(remove_(Number(body.day))));
    if (body.action === 'scripts') return json_({ ok: true, count: refreshScripts() });
    if (body.action === 'postSave') return json_(postSave_(body));
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
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'linkMissingLogs') ScriptApp.deleteTrigger(t);
  });
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'everyHalfHour';
  });
  if (!exists) ScriptApp.newTrigger('everyHalfHour').timeBased().everyMinutes(30).create();
  sheet_(); DriveApp.getFolderById(LOG_ROOT_ID).getName();
  refreshScripts();
  if (!PropertiesService.getScriptProperties().getProperty('PASSCODE')) {
    throw new Error('Setup ran, but no PASSCODE is set yet. Add it in Project Settings > Script Properties.');
  }
  return 'Ready';
}

/** Runs by itself every 30 minutes. */
function everyHalfHour() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return;           // a save is running; try again in 30 minutes
  try { linkMissingLogs(); refreshScripts(); }
  finally { lock.releaseLock(); }
}

/** Fills in the log sheet link for any day that does not have one yet. */
function linkMissingLogs() {
  var sh = sheet_(), rows = rows_(sh), found = 0;
  rows.forEach(function (r) {
    if (r.log || !r.day) return;
    var hit = findLog_(r.day, r.iso);
    if (!hit) return;
    // Only write if that row still holds the same day and still has no link.
    var now = sh.getRange(r.row, 2, 1, 2).getDisplayValues()[0];
    if (parseHead_(now[0]).day !== r.day || String(now[1] || '').trim()) return;
    sh.getRange(r.row, 3).setValue(hit.url); found++;
  });
  return found;
}

/* ---------- actions ---------- */

function save_(report, log, originalDay) {
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
  // An edit that changed the shoot day number: the old day's row goes.
  var moved = 0;
  if (originalDay && originalDay !== info.day) {
    rows_(sh).filter(function (r) { return r.day === originalDay; })
      .map(function (r) { return r.row; }).sort(function (a, b) { return b - a; })
      .forEach(function (n) { sh.deleteRow(n); moved++; });
  }
  return { ok: true, day: info.day, replaced: same.length > 0 || moved > 0, log: logOut, logName: logName, logFound: !!logOut };
}

/** Several daily reports pasted at once. Each is saved like a single one. */
function saveMany_(reports) {
  if (!Array.isArray(reports) || !reports.length || reports.length > 60) return { ok: false, error: 'bad_request' };
  var results = reports.map(function (r) {
    var out = save_(String(r || ''), '', 0);
    if (!out.ok) out.day = parseHead_(String(r || '')).day || 0;
    return out;
  });
  return { ok: results.some(function (r) { return r.ok; }), error: results.some(function (r) { return r.ok; }) ? undefined : results[0].error, results: results };
}

/** Sends the whole Reports tab back with every change, so the phone that made
 *  the change shows it at once instead of waiting for the next refresh. */
function withRows_(res) {
  if (res && res.ok) {
    var sh = sheet_(), last = sh.getLastRow();
    res.rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, 3).getDisplayValues();
  }
  return res;
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
  var real = PropertiesService.getScriptProperties().getProperty('PASSCODE');
  if (!real) return 'not_set_up';
  if (same_(String(given || ''), real)) return '';
  // A wrong guess waits 3 seconds before it is answered. That makes guessing a
  // long passcode hopeless, without ever locking out the people who know it.
  Utilities.sleep(3000);
  return 'wrong_passcode';
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
    var line = line0.replace(/[*_~]/g, '').replace(/[\u231B\u23F3]/g, '').replace(/\s+/g, ' ').trim().replace(/^[^A-Za-z0-9]+(?=[A-Za-z])/, ''), m;
    if (!out.day && (m = /^shoot\s*day\s*[:\-]?\s*(\d+)/i.exec(line))) out.day = Number(m[1]);
    if (!out.iso && (m = /^date\s*[:\-]\s*(.+)$/i.exec(line))) out.iso = inferIso_(m[1]);
  });
  return out;
}

function inferIso_(t) {
  var m, y, mo, d, now = new Date();
  function guessYear(mo, d) { var yy = now.getFullYear(); if (new Date(yy, mo - 1, d) - now > 60 * 864e5) yy--; return yy; }
  if ((m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/.exec(t))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
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

/* ---------- episode scripts ---------- */

/** Episode number in a file or folder name: "Ep 7", "EP07", "Episode 7", "E7". */
function episodeOf_(name) {
  var m = /(?:^|[^a-z0-9])(?:ep(?:isode)?|e)\s*[-_.#:]?\s*0*(\d{1,3})(?!\d)/i.exec(String(name));
  return m ? Number(m[1]) : 0;
}

/** Writes the Scripts tab: one row per episode with the newest script found. */
function refreshScripts() {
  if (!SCRIPTS_ROOT_ID || /PASTE/.test(SCRIPTS_ROOT_ID)) return 0;
  var best = {}, queue = [{ folder: DriveApp.getFolderById(SCRIPTS_ROOT_ID), depth: 0, ep: 0 }];
  /* Best match per episode: a file with the episode in its own name, then the
     episode's own folder, then any other file inside that folder. Newest wins a tie. */
  function consider(ep, item) {
    if (!ep) return;
    var cur = best[ep];
    if (!cur || item.rank > cur.rank || (item.rank === cur.rank && item.updated > cur.updated)) best[ep] = item;
  }
  while (queue.length) {
    var q = queue.shift(), files = q.folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (f.isTrashed()) continue;
      var own = episodeOf_(f.getName());
      consider(own || q.ep, { name: f.getName(), url: f.getUrl(), updated: f.getLastUpdated(), rank: own ? 3 : 1, file: f });
    }
    if (q.depth < 3) {
      var subs = q.folder.getFolders();
      while (subs.hasNext()) {
        var sub = subs.next();
        if (sub.isTrashed()) continue;
        var ep = episodeOf_(sub.getName()) || q.ep;
        consider(ep, { name: sub.getName(), url: sub.getUrl(), updated: sub.getLastUpdated(), rank: 2 });
        queue.push({ folder: sub, depth: q.depth + 1, ep: ep });
      }
    }
  }
  var ss = SpreadsheetApp.getActive(), tab = ss.getSheetByName(SCRIPTS_TAB) || ss.insertSheet(SCRIPTS_TAB);
  var started = Date.now();
  var rows = Object.keys(best).map(Number).sort(function (a, b) { return a - b; }).map(function (ep) {
    var b = best[ep];
    // Reading a new script takes a few seconds; stop starting new ones after 3 minutes.
    var scenes = b.file ? scenesOf_(b.file, Date.now() - started < 180000) : '';
    return [String(ep), b.name, b.url, Utilities.formatDate(b.updated, TZ, 'yyyy-MM-dd HH:mm'), scenes];
  });
  tab.clearContents();
  var out = [['Episode', 'Script', 'Link', 'Updated', 'Scenes']].concat(rows);
  var range = tab.getRange(1, 1, out.length, 5);
  range.setNumberFormat('@');
  range.setValues(out);
  return rows.length;
}

/* ---------- scene numbers in a script ---------- */

/** Scene numbers in a script file, like "1,2,3,4A". Remembered per file version,
 *  so each script is only read once (and again when it is replaced or edited). */
function scenesOf_(file, mayRead) {
  var props = PropertiesService.getScriptProperties();
  var key = 'SC_' + file.getId() + '_' + file.getLastUpdated().getTime();
  var known = props.getProperty(key);
  if (known != null) return known;
  if (!mayRead) return '';
  var text = scriptText_(file);
  if (text == null) return '';                 // could not read it; try again in 30 minutes
  var list = sceneNumbers_(text).join(',');
  // Forget older versions of this file, then remember this one.
  Object.keys(props.getProperties()).forEach(function (k) {
    if (k.indexOf('SC_' + file.getId() + '_') === 0) props.deleteProperty(k);
  });
  props.setProperty(key, list);
  return list;
}

/** The words in a script. A Google Doc is read directly. A PDF is uploaded as a
 *  temporary Google Doc (Google turns it into text), read, then deleted. */
function scriptText_(file) {
  var mime = file.getMimeType();
  try {
    if (mime === MimeType.GOOGLE_DOCS) return file.getAs('text/markdown').getDataAsString();
    if (mime !== MimeType.PDF) return null;
    var tmp = Drive.Files.create({ name: 'njoro-tracker temp (safe to delete)', mimeType: MimeType.GOOGLE_DOCS }, file.getBlob());
    try { return DriveApp.getFileById(tmp.id).getAs('text/markdown').getDataAsString(); }
    finally {
      try { Drive.Files.remove(tmp.id); } catch (e) { DriveApp.getFileById(tmp.id).setTrashed(true); }
    }
  } catch (err) {
    console.warn('Could not read ' + file.getName() + ': ' + err);
    return null;
  }
}

/** Scene numbers from scene headings: "1 INT. CAB - DAY 1", "INT. CAB - DAY 1 1",
 *  "12A EXT. ROAD - NIGHT 12A", "4 FLASHBACK - ...", "7 INTERCUT - ...", "17 I/E DOOR 17". */
var HEAD_ = '(?:INT\\.?\\/EXT|EXT\\.?\\/INT|INT|EXT|I\\/E|INTERCUT|FLASHBACK|FLASH)\\b';
function sceneNumbers_(text) {
  var t = String(text).replace(/\\(?=[^\s])/g, '').replace(/[*_#>`]/g, ' ').replace(/[\u00A0\t]/g, ' ');
  var seen = {}, out = [];
  function add(n) { n = n.toUpperCase().replace(/^0+(?=\d)/, ''); if (!seen[n] && parseInt(n, 10) <= 300) { seen[n] = 1; out.push(n); } }
  // Number in front of the heading.
  var front = new RegExp('(?:^|\\n|[.!?"\u201D)]\\s)\\s*(\\d{1,3}[A-Z]?)\\s+' + HEAD_, 'g'), m;
  while ((m = front.exec(t))) add(m[1]);
  // Number only after the heading, written twice: "INT. CAB - EVENING 1 1".
  var back = new RegExp('(?:^|\\n)\\s*' + HEAD_ + '[^\\n]*?\\s(\\d{1,3}[A-Z]?)\\s+(\\d{1,3}[A-Z]?)\\s*(?=\\n|$)', 'g');
  while ((m = back.exec(t))) if (m[1] === m[2]) add(m[1]);
  // Number tucked just after INT./EXT. and repeated at the end: "INT. 1 LIVING ROOM - NIGHT 1".
  var inside = new RegExp('(?:^|\\n)\\s*' + HEAD_ + '\\.?\\s+(\\d{1,3}[A-Z]?)\\s[^\\n]*\\s(\\d{1,3}[A-Z]?)\\s*(?=\\n|$)', 'g');
  while ((m = inside.exec(t))) if (m[1] === m[2]) add(m[1]);
  return out.sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10) || (a < b ? -1 : a > b ? 1 : 0); });
}

/* ---------- post production ---------- */

/** Post production lives in Script Properties, NOT in the Sheet, because the
 *  Sheet can be read by anyone with its link. Only the passcode opens it.
 *    POST_TX       date Episode 1 goes on air, like 2026-11-07 (blank until known)
 *    POST_EP_<n>   {"editor","sound","trailer","shift","dropped":[{"sc","why","note"}]}
 *  Every other episode's TX date is worked out in the app: one week after the
 *  episode before, plus "shift" days when that episode was moved (a skipped week = 7). */
var DROP_WHY_ = ['Length', 'Performance', 'Other'];

function postAll_() {
  var props = PropertiesService.getScriptProperties().getProperties(), eps = {};
  Object.keys(props).forEach(function (k) {
    var m = /^POST_EP_(\d+)$/.exec(k);
    if (!m) return;
    try { eps[m[1]] = JSON.parse(props[k]); } catch (e) {}
  });
  return { ok: true, tx: props.POST_TX || '', eps: eps };
}

function clip_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, n); }

/** One change at a time, merged into what is already saved, so two people
 *  editing different boxes never undo each other. */
function postSave_(b) {
  var props = PropertiesService.getScriptProperties();
  if (b.tx !== undefined) {
    var tx = clip_(b.tx, 10);
    if (tx && !/^\d{4}-\d{2}-\d{2}$/.test(tx)) return { ok: false, error: 'bad_request' };
    if (tx) props.setProperty('POST_TX', tx); else props.deleteProperty('POST_TX');
  }
  var ep = Number(b.ep);
  if (ep) {
    if (!(ep >= 1 && ep <= EPISODES && ep === Math.floor(ep))) return { ok: false, error: 'bad_request' };
    var key = 'POST_EP_' + ep, cur;
    try { cur = JSON.parse(props.getProperty(key) || '{}'); } catch (e) { cur = {}; }
    var set = b.set || {};
    if (set.editor !== undefined) cur.editor = clip_(set.editor, 80);
    if (set.sound !== undefined) cur.sound = clip_(set.sound, 80);
    // A moved TX: days later (or earlier) than one week after the episode before.
    // Stored as a gap, not a date, so changing Episode 1's TX carries every break along.
    if (set.shift !== undefined) {
      var sh = Number(set.shift) || 0;
      if (ep === 1 || sh !== Math.floor(sh) || sh <= -7 || sh > 365) return { ok: false, error: 'bad_move' };
      if (sh) cur.shift = sh; else delete cur.shift;
    }
    if (set.trailer !== undefined) {
      var t = clip_(set.trailer, 500);
      if (t && !/^https:\/\/[^\s"'<>]+$/.test(t)) return { ok: false, error: 'bad_link_any' };
      cur.trailer = t;
    }
    var list = Array.isArray(cur.dropped) ? cur.dropped : [];
    if (set.dropAdd) {
      var sc = clip_(set.dropAdd.sc, 5).toUpperCase().replace(/^0+(?=\d)/, '');
      if (!/^\d{1,3}[A-Z]?$/.test(sc)) return { ok: false, error: 'bad_scene' };
      var why = DROP_WHY_.indexOf(set.dropAdd.why) >= 0 ? set.dropAdd.why : 'Other';
      list = list.filter(function (d) { return d.sc !== sc; });
      list.push({ sc: sc, why: why, note: clip_(set.dropAdd.note, 200) });
      if (list.length > 80) return { ok: false, error: 'bad_request' };
    }
    if (set.dropRemove !== undefined) {
      var gone = clip_(set.dropRemove, 5).toUpperCase();
      list = list.filter(function (d) { return d.sc !== gone; });
    }
    cur.dropped = list;
    if (!cur.editor && !cur.sound && !cur.trailer && !cur.shift && !list.length) props.deleteProperty(key);
    else props.setProperty(key, JSON.stringify(cur));
  }
  return postAll_();
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
