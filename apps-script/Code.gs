/**
 * Njoro wa Uba Scene Tracker: the Google robot.
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
 *   - call Google's own Drive address to turn its temporary copy of a script
 *     into plain text                       (script.external_request)
 * It has no access to Gmail, Calendar, Contacts or any other spreadsheet.
 * In Drive it only ever opens the log sheets and scripts folders below.
 *
 * Team sign-in: ONE master password, kept in Project Settings > Script Properties
 * as PASSCODE. It is never in this file or in the app. To change it, change it
 * there: every device is then signed out. A sign-in also ends after IDLE_MINUTES
 * without use, or after 12 hours. The activity log names the device (iPhone, Mac ...).
 *
 * Script Properties, all of them:
 *   PASSCODE       the master password (the only one to edit by hand)
 *   IDLE_MINUTES   optional: minutes without use before sign-out (default 30)
 *   POST_TX        post production: Episode 1 TX date
 *   POST_EP_<n>    post production: one line per episode that has anything filled in
 *   ACT_RING       the last few activity entries (backup of the Activity tab)
 *   SESS_GEN       goes up when someone taps "Sign everyone out"
 * Run cleanUp() from the editor to remove anything else (older versions left extras).
 *
 * Tabs in the Sheet:
 *   Reports    one row per shoot day (anyone with the app can read these)
 *   Scripts    written by the robot: one row per episode script found
 *   Repeats    reshoot / duplicate decisions for scenes logged twice
 *   Activity   who signed in and what they changed (written only while
 *              the Sheet is private, so names never sit in a public file)
 * Post production and accounts live in Script Properties, never in the Sheet.
 */

var SHEET_NAME = 'Reports';
var LOG_ROOT_ID = '1KQgFJwqSnT5e3fR0aS7sNptej30-5Bs9'; // log sheets folder
var SCRIPTS_ROOT_ID = '1keWRPeybj1YUOr8c6MtPNM-tHS-zmnjZ'; // episode scripts folder
var SCRIPTS_TAB = 'Scripts';
var REPEATS_TAB = 'Repeats';
var ACTIVITY_TAB = 'Activity';
var TZ = 'Africa/Nairobi';
var VERSION = 11;
// Drive > 02. NJORO WA UBA SN 25-28 - 2026 > N.W.U Cycle 7 | SCENE TRACKER (holds this Sheet).
var TRACKER_FOLDER_ID = '18qREQGQgviZBWPuh3e6BwEl8bBhYnRfY';
var EXPORTS_FOLDER_NAME = 'POST PRODUCTION EXPORTS';
var EPISODES = 52;
var IDLE_MINUTES_DEFAULT = 30;   // change with Script Property IDLE_MINUTES
var SESSION_MAX_HOURS = 12;      // even an active sign-in ends after this

/* ---------- entry points ---------- */

/** GET: version check, or (with ?read=1) everything the app shows to anyone. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.read) {
    try { return json_(readAll_()); }
    catch (err) { return json_({ ok: false, error: 'server', message: String(err && err.message || err) }); }
  }
  return json_({ ok: true, app: 'njoro-tracker', version: VERSION });
}

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  try { return json_(route_(body || {})); }
  catch (err) { return json_({ ok: false, error: 'server', message: String(err && err.message || err) }); }
}

function route_(b) {
  var a = String(b.action || '');
  // No sign-in needed for these.
  if (a === 'login') return login_(b);
  if (a === 'logout') { endSession_(b.token); return { ok: true }; }

  var me = session_(b.token, b.touch !== false);
  if (!me) return { ok: false, error: 'signed_out' };

  if (a === 'check' || a === 'touch') return { ok: true, user: { name: me.name }, idle: idleMinutes_() };
  if (a === 'post') return postAll_();
  if (a === 'activity') return readActivity_();
  if (a === 'exportSheet') return exportSheet_(b, me);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'busy' };
  try {
    var out = write_(a, b, me);
    if (out && out.ok) clearReadCache_();
    return out;
  } finally {
    lock.releaseLock();
  }
}

function write_(a, b, me) {
  var out;
  if (a === 'save') {
    out = save_(String(b.report || ''), String(b.log || '').trim(), Number(b.originalDay) || 0);
    if (out.ok) log_(me.name, out.replaced ? 'Updated a daily report' : 'Added a daily report', 'Day ' + out.day + (out.logFound ? ', log sheet attached' : ''));
    return withData_(out);
  }
  if (a === 'saveMany') {
    out = saveMany_(b.reports);
    if (out.results) {
      var okd = out.results.filter(function (r) { return r.ok; }).map(function (r) { return r.day; });
      if (okd.length) log_(me.name, 'Added several daily reports', 'Days ' + okd.join(', '));
    }
    return withData_(out);
  }
  if (a === 'remove') {
    out = remove_(Number(b.day));
    if (out.ok) log_(me.name, 'Removed a day', 'Day ' + out.day);
    return withData_(out);
  }
  if (a === 'drive' || a === 'scripts') {
    var logs = linkMissingLogs(), scripts = refreshScripts(25000);
    log_(me.name, 'Checked Drive', logs + ' log sheet' + (logs === 1 ? '' : 's') + ' attached, ' + scripts + ' scripts found');
    return withData_({ ok: true, logs: logs, scripts: scripts });
  }
  if (a === 'decide') {
    out = decide_(b, me);
    return withData_(out);
  }
  if (a === 'postSave') return postSave_(b, me);
  if (a === 'note') {
    var what = String(b.what || '').slice(0, 80);
    if (what === 'export') log_(me.name, 'Exported post production to Excel', '');
    return { ok: true };
  }
  if (a === 'signoutAll') {
    props_().setProperty('SESS_GEN', String((Number(props_().getProperty('SESS_GEN')) || 0) + 1));
    log_(me.name, 'Signed everyone out', 'Every device has to sign in again');
    return { ok: true };
  }
  return { ok: false, error: 'bad_request' };
}

/** Post production as a Google Sheet. The app builds the same formatted file it downloads
 *  as Excel and sends it here; Google turns it into a Google Sheet in the owner's Drive.
 *  Anyone with the link can view it (the link only goes to the person who exported).
 *  Only the newest export is kept: the previous one goes to the Drive bin. */
function exportSheet_(b, me) {
  var b64 = String(b.xlsx || '');
  if (!b64 || b64.length > 8000000) return { ok: false, error: 'bad_request' };
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'post.xlsx');
  var name = 'Njoro wa Uba Post Production (latest, ' + Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH.mm') + ')';
  var folder = exportsFolder_();
  var meta = { name: name, mimeType: MimeType.GOOGLE_SHEETS };
  if (folder) meta.parents = [folder];
  var file = Drive.Files.create(meta, blob);
  try { Drive.Permissions.create({ role: 'reader', type: 'anyone' }, file.id); } catch (e) { console.warn('Could not share the export: ' + e); }
  var p = props_(), old = p.getProperty('EXPORT_ID');
  if (old && old !== file.id) { try { Drive.Files.update({ trashed: true }, old); } catch (e) {} }
  p.setProperty('EXPORT_ID', file.id);
  log_(me.name, 'Exported post production to Google Sheets', name);
  return { ok: true, url: 'https://docs.google.com/spreadsheets/d/' + file.id + '/edit', name: name,
           folder: folder ? 'https://drive.google.com/drive/folders/' + folder : '' };
}

/** The POST PRODUCTION EXPORTS folder inside the Scene Tracker folder. The robot makes it
 *  itself (its Drive permission only lets it write into folders and files it made), keeps
 *  its id in Script Properties, and makes a new one if it was deleted. '' = Drive root. */
function exportsFolder_() {
  var p = props_(), id = p.getProperty('EXPORT_FOLDER');
  if (id) {
    try { var f = Drive.Files.get(id, { fields: 'id,trashed' }); if (f && !f.trashed) return id; } catch (e) {}
  }
  var meta = { name: EXPORTS_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }, made = null;
  try { made = Drive.Files.create(Object.assign({ parents: [TRACKER_FOLDER_ID] }, meta)); }
  catch (e) {
    console.warn('Could not make the exports folder inside the Scene Tracker folder (' + e + '). Making it in My Drive: drag it into N.W.U Cycle 7 | SCENE TRACKER.');
    try { made = Drive.Files.create(meta); } catch (e2) { console.warn('Could not make the exports folder: ' + e2); return ''; }
  }
  p.setProperty('EXPORT_FOLDER', made.id);
  return made.id;
}

/** Run once from the editor after pasting a new version. Safe to run again. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'linkMissingLogs') ScriptApp.deleteTrigger(t);
  });
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'everyHalfHour';
  });
  if (!exists) ScriptApp.newTrigger('everyHalfHour').timeBased().everyMinutes(30).create();
  sheet_(); DriveApp.getFolderById(LOG_ROOT_ID).getName();
  repeatsTab_();
  if (!PropertiesService.getScriptProperties().getProperty('PASSCODE')) {
    throw new Error('Setup stopped: add PASSCODE (the admin password) in Project Settings > Script Properties, then run setup again.');
  }
  cleanUp();                                  // removes lines older versions left in Script Properties
  var logs = linkMissingLogs(), scripts = refreshScripts(240000);
  var withScenes = tabRows_(SpreadsheetApp.getActive().getSheetByName(SCRIPTS_TAB), 5).filter(function (r) { return r[4]; }).length;
  console.log('Version ' + VERSION + ' ready. Log sheets attached now: ' + logs + '. Episode scripts found: ' + scripts + ', scene numbers read for ' + withScenes + '.');
  var ef = exportsFolder_();
  console.log(ef ? 'Post production exports go to https://drive.google.com/drive/folders/' + ef : 'Exports folder could not be made; exports go to My Drive.');
  CacheService.getScriptCache().remove('PRIVATE');
  if (sheetPrivate_()) { activityTab_(); console.log('The Sheet is private. The Activity tab is on.'); }
  else console.log('NEXT STEP: make the Sheet private (Share > General access > Restricted). Until then the Activity tab stays off.');
  clearReadCache_();
  return 'Ready';
}

/** Runs by itself every 30 minutes. */
function everyHalfHour() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return;           // a save is running; try again in 30 minutes
  try { linkMissingLogs(); refreshScripts(180000); clearReadCache_(); }
  finally { lock.releaseLock(); }
}

/* ---------- reading (public: the same things the app always showed) ---------- */

function readAll_() {
  var cached = getChunks_('READ');
  if (cached) return JSON.parse(cached);
  var ss = SpreadsheetApp.getActive();
  var out = {
    ok: true, version: VERSION,
    reports: tabRows_(sheet_(), 3),
    scripts: tabRows_(ss.getSheetByName(SCRIPTS_TAB), 6),
    repeats: tabRows_(ss.getSheetByName(REPEATS_TAB), 3),   // scene, day, decision: who decided stays in the Activity log
    at: Date.now()
  };
  putChunks_('READ', JSON.stringify(out), 30);
  return out;
}

function tabRows_(sh, cols) {
  if (!sh) return [];
  var last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, cols).getDisplayValues();
}

/** Every change sends back fresh data, so the phone that made it shows it at once. */
function withData_(res) {
  if (res && res.ok) { clearReadCache_(); res.data = readAll_(); }
  return res;
}

function putChunks_(key, text, secs) {
  try {
    var c = CacheService.getScriptCache(), map = {}, n = 0;
    for (var i = 0; i < text.length; i += 90000) map[key + '_' + (n++)] = text.slice(i, i + 90000);
    map[key + '_N'] = String(n);
    c.putAll(map, secs);
  } catch (e) {}
}
function getChunks_(key) {
  try {
    var c = CacheService.getScriptCache(), n = Number(c.get(key + '_N'));
    if (!n) return null;
    var keys = []; for (var i = 0; i < n; i++) keys.push(key + '_' + i);
    var got = c.getAll(keys), parts = [];
    for (var j = 0; j < n; j++) { if (got[keys[j]] == null) return null; parts.push(got[keys[j]]); }
    return parts.join('');
  } catch (e) { return null; }
}
function clearReadCache_() { try { CacheService.getScriptCache().remove('READ_N'); } catch (e) {} }

/* ---------- sign-in: one admin password ---------- */

function props_() { return PropertiesService.getScriptProperties(); }
function idleMinutes_() { var n = Number(props_().getProperty('IDLE_MINUTES')); return n >= 5 && n <= 720 ? n : IDLE_MINUTES_DEFAULT; }
function cleanName_(n) { return String(n || '').replace(/[\u0000-\u001F<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
/** Changes when someone taps "Sign everyone out" or the master password is changed
 *  in Script Properties. A sign-in made before the change stops working. */
function gen_() {
  var pw = props_().getProperty('PASSCODE') || '';
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'njw:' + pw).slice(0, 6)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  return (Number(props_().getProperty('SESS_GEN')) || 0) + ':' + d;
}

/** A short, harmless description of the device, for the activity log: "iPhone, Safari". */
function deviceLabel_(d) {
  var t = cleanName_(d).replace(/[^A-Za-z0-9 ,.()]/g, '').slice(0, 40);
  return t ? 'Team (' + t + ')' : 'Team';
}

function login_(b) {
  var who = deviceLabel_(b.device), cache = CacheService.getScriptCache();
  if (!props_().getProperty('PASSCODE')) return { ok: false, error: 'no_passcode' };
  // Many wrong passwords in 15 minutes, from anywhere: pause all sign-ins for a while.
  var fails = Number(cache.get('LOGIN_FAILS')) || 0;
  if (fails >= 20) { return { ok: false, error: 'locked' }; }
  if (!same_(String(b.password || ''), props_().getProperty('PASSCODE'))) {
    cache.put('LOGIN_FAILS', String(fails + 1), 900);
    Utilities.sleep(3000);                     // makes guessing slow
    log_(who, 'Failed sign-in', 'Wrong password');
    return { ok: false, error: 'wrong_login' };
  }
  log_(who, 'Signed in', '');
  return startSession_(who);
}

function startSession_(who) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var s = { n: who, g: gen_(), c: Date.now(), a: Date.now() };
  CacheService.getScriptCache().put('S_' + token, JSON.stringify(s), idleMinutes_() * 60);
  return { ok: true, token: token, user: { name: who }, idle: idleMinutes_() };
}

/** The signed-in device, or null. touch=false checks without counting as use. */
function session_(token, touch) {
  if (!token || !/^[a-f0-9]{64}$/.test(String(token))) return null;
  var cache = CacheService.getScriptCache(), raw = cache.get('S_' + token);
  if (!raw) return null;
  var s; try { s = JSON.parse(raw); } catch (e) { return null; }
  var now = Date.now();
  if (now - s.a > idleMinutes_() * 60000 || now - s.c > SESSION_MAX_HOURS * 3600000 || s.g !== gen_()) { cache.remove('S_' + token); return null; }
  if (touch) { s.a = now; cache.put('S_' + token, JSON.stringify(s), idleMinutes_() * 60); }
  return { name: s.n };
}

function endSession_(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(String(token))) return;
  var cache = CacheService.getScriptCache(), raw = cache.get('S_' + token);
  if (!raw) return;
  cache.remove('S_' + token);
  try { log_(JSON.parse(raw).n, 'Signed out', ''); } catch (e) {}
}

/** Run from the editor: removes Script Properties the robot no longer uses and
 *  prints what is left. Never touches PASSCODE, IDLE_MINUTES or post production. */
function cleanUp() {
  var p = props_(), all = p.getProperties(), keep = /^(PASSCODE|IDLE_MINUTES|POST_TX|POST_EP_\d+|ACT_RING|SESS_GEN|EXPORT_ID|EXPORT_FOLDER)$/, gone = [];
  Object.keys(all).forEach(function (k) { if (!keep.test(k)) { p.deleteProperty(k); gone.push(k); } });
  var left = Object.keys(p.getProperties()).sort();
  console.log('Removed ' + gone.length + ' unused line' + (gone.length === 1 ? '' : 's') + (gone.length ? ': ' + gone.join(', ') : '') + '.');
  console.log('Left (' + left.length + '): ' + left.join(', ') + '. PASSCODE is the master password. POST_ lines are your post production data: do not delete them.');
  return gone.length;
}

function same_(a, b) {
  var x = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a);
  var y = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b);
  var diff = 0;
  for (var i = 0; i < x.length; i++) diff |= (x[i] ^ y[i]);
  return diff === 0;
}

/* ---------- activity log ---------- */

/** Is the Sheet private (no "anyone with the link")? Checked at most every 10 minutes. */
function sheetPrivate_() {
  var c = CacheService.getScriptCache(), v = c.get('PRIVATE');
  if (v) return v === '1';
  var priv = false;
  try { priv = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getSharingAccess() === DriveApp.Access.PRIVATE; } catch (e) {}
  c.put('PRIVATE', priv ? '1' : '0', 600);
  return priv;
}

function activityTab_() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(ACTIVITY_TAB);
  if (!sh) {
    sh = ss.insertSheet(ACTIVITY_TAB);
    sh.getRange(1, 1, 1, 4).setValues([['When', 'Who', 'What', 'Details']]);
    sh.setFrozenRows(1);
    try { sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 140); sh.setColumnWidth(3, 230); sh.setColumnWidth(4, 420); } catch (e) {}
  }
  return sh;
}

/** Newest first. Also kept in a short list in Script Properties, so nothing is
 *  lost while the Sheet is still shared by link. */
function log_(who, what, details) {
  var row = [now_(), cleanName_(who), String(what).slice(0, 80), String(details || '').slice(0, 300)];
  try {
    var p = props_(), ring = [];
    try { ring = JSON.parse(p.getProperty('ACT_RING') || '[]'); } catch (e) {}
    ring.unshift(row);
    while (ring.length && JSON.stringify(ring).length > 8500) ring.pop();
    p.setProperty('ACT_RING', JSON.stringify(ring));
  } catch (e) {}
  try {
    if (!sheetPrivate_()) return;
    var sh = activityTab_();
    sh.insertRowsAfter(1, 1);
    var r = sh.getRange(2, 1, 1, 4); r.setNumberFormat('@'); r.setValues([row]);
    var last = sh.getLastRow();
    if (last > 3001) sh.deleteRows(3002, last - 3001);
  } catch (e) { console.warn('Activity log: ' + e); }
}

function readActivity_() {
  var priv = sheetPrivate_(), rows;
  if (priv) {
    var sh = SpreadsheetApp.getActive().getSheetByName(ACTIVITY_TAB);
    var last = sh ? sh.getLastRow() : 0;
    rows = last < 2 ? [] : sh.getRange(2, 1, Math.min(300, last - 1), 4).getDisplayValues();
    if (!rows.length) { try { rows = JSON.parse(props_().getProperty('ACT_RING') || '[]'); } catch (e) { rows = []; } }
  } else {
    try { rows = JSON.parse(props_().getProperty('ACT_RING') || '[]'); } catch (e) { rows = []; }
  }
  return { ok: true, private: priv, rows: rows };
}

/* ---------- repeated scenes: reshoot or duplicate ---------- */

function repeatsTab_() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(REPEATS_TAB);
  if (!sh) {
    sh = ss.insertSheet(REPEATS_TAB);
    sh.getRange(1, 1, 1, 5).setValues([['Scene', 'Day', 'Decision', 'By', 'When']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function decide_(b, me) {
  var m = /^(\d{1,3})\s*\/\s*(\d{1,3}[A-Za-z]?)$/.exec(String(b.scene || '').trim()), day = Number(b.day);
  if (!m || !(day >= 1 && day <= 999)) return { ok: false, error: 'bad_request' };
  var scene = Number(m[1]) + '/' + m[2].toUpperCase().replace(/^0+(?=\d)/, '');
  // Reshoot: shot again on purpose. Duplicate: logged twice by mistake.
  // Continued: the same scene finished on another day (for example a phone-call voice over).
  var decision = ['Reshoot', 'Duplicate', 'Continued'].indexOf(b.decision) >= 0 ? b.decision : '';
  if (b.decision && !decision) return { ok: false, error: 'bad_request' };
  var sh = repeatsTab_(), rows = tabRows_(sh, 2), found = 0;
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][0] === scene && Number(rows[i][1]) === day) { sh.deleteRow(i + 2); found++; }
  }
  if (decision) {
    var r = sh.getRange(sh.getLastRow() + 1, 1, 1, 5);
    r.setNumberFormat('@');
    r.setValues([[scene, String(day), decision, me.name, now_()]]);
  }
  log_(me.name, decision ? 'Marked a repeated scene' : 'Undid a repeat decision', scene + ' on Day ' + day + (decision ? ': ' + decision : ''));
  return { ok: true };
}

/* ---------- daily reports ---------- */

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
  var any = results.some(function (r) { return r.ok; });
  return { ok: any, error: any ? undefined : results[0].error, results: results };
}

function remove_(day) {
  if (!day) return { ok: false, error: 'bad_request' };
  var sh = sheet_(), rows = rows_(sh).filter(function (r) { return r.day === day; });
  if (!rows.length) return { ok: false, error: 'not_found' };
  rows.map(function (r) { return r.row; }).sort(function (a, b) { return b - a; })
    .forEach(function (n) { sh.deleteRow(n); });
  return { ok: true, day: day, removed: rows.length };
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

/** 2 = name has the shoot day AND the date ("Day 9 9.10.2026.pdf", "DAY 9 - 09-10-26").
 *  1 = name starts with the shoot day but has no date ("Day 9.pdf"). 0 = no match. */
function logMatch_(name, day, iso) {
  var dayRe = new RegExp('^\\W*day\\W*0*' + day + '(?!\\d)', 'i');
  if (!dayRe.test(name)) return 0;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return 1;
  var dateRe = new RegExp('(^|\\D)0?' + Number(m[3]) + '\\s*[./_ -]\\s*0?' + Number(m[2]) + '\\s*[./_ -]\\s*(?:' + m[1] + '|' + m[1].slice(2) + ')(?!\\d)');
  if (dateRe.test(name)) return 2;
  return /\d{1,2}\s*[./_-]\s*\d{1,2}\s*[./_-]\s*\d{2,4}/.test(name) ? 0 : 1;   // a different date: not this day
}

var LOG_TYPES_ = /^(application\/pdf|image\/|application\/vnd\.google-apps\.(document|spreadsheet))/;

/** Searches the log sheets folder and every folder inside it (month / week folders).
 *  A file with the day and date wins. A file with only "Day N" counts when it was
 *  uploaded within 5 days of the shoot. */
function findLog_(day, iso) {
  if (!day) return null;
  var shoot = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''), t0 = shoot ? new Date(+shoot[1], +shoot[2] - 1, +shoot[3]).getTime() : 0;
  var best = null, queue = [{ folder: DriveApp.getFolderById(LOG_ROOT_ID), depth: 0 }];
  while (queue.length) {
    var item = queue.shift(), files = item.folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (f.isTrashed() || !LOG_TYPES_.test(f.getMimeType())) continue;
      var score = logMatch_(f.getName(), day, iso);
      if (score === 1) {
        var age = t0 ? f.getDateCreated().getTime() - t0 : -1;
        if (!(age > -864e5 && age < 5 * 864e5)) score = 0;
      }
      if (!score) continue;
      if (!best || score > best.score || (score === best.score && f.getDateCreated() > best.created))
        best = { url: 'https://drive.google.com/file/d/' + f.getId() + '/view', name: f.getName(), created: f.getDateCreated(), score: score };
    }
    if (item.depth < 4) {
      var subs = item.folder.getFolders();
      while (subs.hasNext()) { var s = subs.next(); if (!s.isTrashed()) queue.push({ folder: s, depth: item.depth + 1 }); }
    }
  }
  return best;
}

/* ---------- episode scripts ---------- */

/** Episode number in a file or folder name: "Ep 7", "EP07", "Episode 7", "EPISODE 9-6", "E7". */
function episodeOf_(name) {
  var m = /(?:^|[^a-z0-9])(?:ep(?:isode)?|e)\s*[-_.#:]?\s*0*(\d{1,3})(?!\d)/i.exec(String(name));
  return m ? Number(m[1]) : 0;
}

/** Writes the Scripts tab: one row per episode with the newest script found.
 *  budgetMs: how long it may spend reading scene numbers out of new scripts. */
function refreshScripts(budgetMs) {
  if (!SCRIPTS_ROOT_ID || /PASTE/.test(SCRIPTS_ROOT_ID)) return 0;
  budgetMs = Number(budgetMs) || 180000;
  var best = {}, queue = [{ folder: DriveApp.getFolderById(SCRIPTS_ROOT_ID), depth: 0, ep: 0 }];
  /* Best match per episode: a file with the episode in its own name, then the
     episode's own folder, then any other file inside that folder. Newest wins a tie. */
  function consider(ep, item) {
    if (!ep || ep > 999) return;
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
  /* Scene numbers already read are kept in the tab itself: same file, same "Updated" time,
     no need to read it again. A replaced or edited script is read again. */
  var known = {};
  tabRows_(tab, 6).forEach(function (r) { if (r[4] && r[5]) known[r[2] + '|' + r[3]] = { scenes: r[4], notes: r[5] }; });
  var started = Date.now();
  var rows = Object.keys(best).map(Number).sort(function (a, b) { return a - b; }).map(function (ep) {
    var b = best[ep], when = Utilities.formatDate(b.updated, TZ, 'yyyy-MM-dd HH:mm:ss');
    var got = known[b.url + '|' + when] || (b.file && Date.now() - started < budgetMs ? scenesOf_(b.file) : { scenes: '', notes: '' });
    return [String(ep), b.name, b.url, when, got.scenes, got.notes];
  });
  tab.clearContents();
  var out = [['Episode', 'Script', 'Link', 'Updated', 'Scenes', 'Notes']].concat(rows);
  var range = tab.getRange(1, 1, out.length, 6);
  range.setNumberFormat('@');
  range.setValues(out);
  return rows.length;
}

/* ---------- scene numbers in a script ---------- */

/** Scene numbers in a script file, like "1,2,3,4A". '' if it could not be read
 *  (tried again on the next run), 'none' if it was read but has no scene headings. */
function scenesOf_(file) {
  var text = scriptText_(file);
  if (text == null) return { scenes: '', notes: '' };
  return { scenes: sceneNumbers_(text).join(',') || 'none',   // 'none': read fine, no scene headings found; not read again
           notes: JSON.stringify(sceneNotes_(text)) };
}

/** The words in a script. A PDF is first copied as a temporary Google Doc (Google
 *  turns it into text), then that copy is exported as plain text and deleted.
 *  A script that is already a Google Doc is exported directly. */
function scriptText_(file) {
  var mime = file.getMimeType();
  try {
    if (mime === MimeType.GOOGLE_DOCS) return exportText_(file.getId());
    if (mime !== MimeType.PDF) return null;
    var tmp = Drive.Files.create({ name: 'njoro-tracker temp (safe to delete)', mimeType: MimeType.GOOGLE_DOCS }, file.getBlob());
    try { return exportText_(tmp.id); }
    finally {
      try { Drive.Files.remove(tmp.id); } catch (e) { try { DriveApp.getFileById(tmp.id).setTrashed(true); } catch (e2) {} }
    }
  } catch (err) {
    console.warn('Could not read ' + file.getName() + ': ' + err);
    return null;
  }
}

/** Google Doc to plain text, through Drive's own export address. */
function exportText_(id) {
  var res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '/export?mimeType=text%2Fplain', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Drive export answered ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  return res.getContentText();
}

/** Scene numbers from scene headings: "1 INT. CAB - DAY 1", "INT. CAB - DAY 1 1",
 *  "12A EXT. ROAD - NIGHT 12A", "4 FLASHBACK - ...", "7 INTERCUT - ...", "17 I/E DOOR 17",
 *  and typo'd headings that still carry the number at both ends: "2 NT. CAR - DAY 2". */
var HEAD_ = '(?:INT\\.?\\/EXT|EXT\\.?\\/INT|INT|EXT|I\\/E|INTERCUT|FLASHBACK|FLASH)\\b';
function cleanScript_(text) {
  return String(text).replace(/\r/g, '').replace(/\\(?=[^\s])/g, '').replace(/[*_#>`]/g, ' ').replace(/[\u00A0\t]/g, ' ');
}
function sceneNumbers_(text) {
  var seen = {}, out = [];
  sceneHeads_(cleanScript_(text)).forEach(function (h) { if (!seen[h.n]) { seen[h.n] = 1; out.push(h.n); } });
  return out.sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10) || (a < b ? -1 : a > b ? 1 : 0); });
}
/** Every scene heading in the text with where it starts and ends, in reading order. */
function sceneHeads_(t) {
  var heads = [];
  function add(n, m, front) {
    n = n.toUpperCase().replace(/^0+(?=\d)/, '');
    if (parseInt(n, 10) > 300) return;
    // Where the heading line starts: at its number when the number comes first, else at the first letter.
    var start = m.index + (front ? m[0].search(/\d/) : m[0].search(/\S/));
    var lineEnd = t.indexOf('\n', start);
    heads.push({ n: n, at: start, end: lineEnd < 0 ? t.length : lineEnd, line: t.slice(start, lineEnd < 0 ? t.length : lineEnd).trim() });
  }
  // Number in front of the heading.
  var front = new RegExp('(?:^|\\n|[.!?"\u201D)]\\s)\\s*(\\d{1,3}[A-Z]?)\\s+' + HEAD_, 'g'), m;
  while ((m = front.exec(t))) add(m[1], m, true);
  // Number only after the heading, written twice: "INT. CAB - EVENING 1 1".
  var back = new RegExp('(?:^|\\n)\\s*' + HEAD_ + '[^\\n]*?\\s(\\d{1,3}[A-Z]?)\\s+(\\d{1,3}[A-Z]?)\\s*(?=\\n|$)', 'g');
  while ((m = back.exec(t))) if (m[1] === m[2]) add(m[1], m);
  // Number tucked just after INT./EXT. and repeated at the end: "INT. 1 LIVING ROOM - NIGHT 1".
  var inside = new RegExp('(?:^|\\n)\\s*' + HEAD_ + '\\.?\\s+(\\d{1,3}[A-Z]?)\\s[^\\n]*\\s(\\d{1,3}[A-Z]?)\\s*(?=\\n|$)', 'g');
  while ((m = inside.exec(t))) if (m[1] === m[2]) add(m[1], m);
  // Any short CAPITALS line with the same number at both ends and a time of day.
  var loose = /(?:^|\n)\s*(\d{1,3}[A-Z]?)\s+([A-Z][^\na-z]{3,90}?)\s+(\d{1,3}[A-Z]?)\s*(?=\n|$)/g;
  while ((m = loose.exec(t))) if (m[1] === m[3] && /(DAY|NIGHT|EVENING|MORNING|AFTERNOON|CONTINUOUS|LATER|DAWN|DUSK)/.test(m[2])) add(m[1], m, true);
  // One entry per scene, the first place it appears, in reading order.
  heads.sort(function (a, b) { return a.at - b.at; });
  var seen = {}, out = [];
  heads.forEach(function (h) { if (!seen[h.n]) { seen[h.n] = 1; out.push(h); } });
  return out;
}

/** Establishing shots and flashbacks, from what each scene says.
 *  Estab: the scene says "Estab", or it is an exterior (or VARIOUS) with only a line or two
 *  of action and nobody speaking, like "Various activities, time lapse" or "The cab moves
 *  through the city." Flashback: the heading or the first line says FLASHBACK.
 *  Returns {"4":"E|Various activities - we transition from night to morning", "2":"F|Cess telling ..."}. */
function sceneNotes_(text) {
  var t = cleanScript_(text), heads = sceneHeads_(t), out = {};
  heads.forEach(function (h, i) {
    var body = t.slice(h.end, i + 1 < heads.length ? heads[i + 1].at : t.length)
      .replace(/^\s*\d{1,3}\.\s*$/gm, ' ')                 // page numbers
      .replace(/\((?:MORE|CONTINUED|CONT'D|CONT\u2019D)\)|\bCONTINUED:?/gi, ' ')
      .replace(/\b(?:END OF EPISODE|NJORO WA UBA TITLE SEQUENCE|CUT TO:?|INTERCUT WITH:?|NEW DAY|LATER|BACK TO(?: [A-Z]+)?)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
    var head = h.line.replace(/^\d{1,3}[A-Z]?\s+/, '').replace(/\s+\d{1,3}[A-Z]?(?:\s+\d{1,3}[A-Z]?)?\s*$/, '').trim();
    var words = body ? body.split(' ').length : 0;
    var spoken = /\((?:V\.?\s?O|O\.?\s?S|O\.?\s?C)\.?\)/i.test(body) || /[!?"\u201C\u201D]/.test(body);
    // The note is the action only: it stops where somebody starts talking ("AMARA What do...", "HENRY (O.S.) ...").
    var action = body.replace(/(?:\s|[.!?])[A-Z][A-Z'\u2019]{2,}(?:\s[A-Z][A-Z'\u2019]{2,})?\s*(?:\((?:O\.?\s?S|V\.?\s?O|O\.?\s?C)[^)]*\)|(?=\s[A-Z][a-z'\u2019]))[\s\S]*$/, function (m) { return /^[.!?]/.test(m) ? m.charAt(0) : ''; }).trim() || body;
    var note = action.length > 90 ? action.slice(0, 87).replace(/\s+\S*$/, '') + '\u2026' : action;
    if (/FLASH/i.test(head) || /^FLASH(?:BACK)?\b/i.test(body)) { out[h.n] = 'F|' + (note || head); return; }
    var ext = /^(?:EXT|I\/E)\b/i.test(head) || /\bVARIOUS\b/i.test(head);
    var cue = /\b(?:estab|various|time ?lapse|transition|wipes (?:the )?frame|whips past|drives past|glides|moves through|in motion|sunrise|sunset|day turns|night turns|doorbell)/i.test(body) || (!spoken && /\b(?:comes? to a stop|pulls up)/i.test(body));
    if (/\bestab/i.test(head) || /^estab/i.test(body) || (cue && words <= 25) || (ext && !spoken && words <= 18)) out[h.n] = 'E|' + (/^estab\.?$/i.test(body) || !body ? head : note);
  });
  return out;
}

/* ---------- post production ---------- */

/** Post production lives in Script Properties, NOT in the Sheet.
 *    POST_TX       date Episode 1 goes on air, like 2026-11-07 (blank until known)
 *    POST_EP_<n>   {"editor","sound","trailer","shift","dropped":[{"sc","why","note"}]}
 *  Every other episode's TX date is worked out in the app: one week after the
 *  episode before, plus "shift" days when that episode was moved (a skipped week = 7). */
var DROP_WHY_ = ['Length', 'Performance', 'Other'];

function postAll_() {
  var props = props_().getProperties(), eps = {};
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
function postSave_(b, me) {
  var props = props_(), who = me ? me.name : '';
  if (b.tx !== undefined) {
    var tx = clip_(b.tx, 10);
    if (tx && !/^\d{4}-\d{2}-\d{2}$/.test(tx)) return { ok: false, error: 'bad_request' };
    if (tx) props.setProperty('POST_TX', tx); else props.deleteProperty('POST_TX');
    log_(who, 'Set Episode 1 TX', tx || 'cleared');
  }
  var ep = Number(b.ep);
  if (ep) {
    if (!(ep >= 1 && ep <= EPISODES && ep === Math.floor(ep))) return { ok: false, error: 'bad_request' };
    var key = 'POST_EP_' + ep, cur, notes = [];
    try { cur = JSON.parse(props.getProperty(key) || '{}'); } catch (e) { cur = {}; }
    var set = b.set || {};
    if (set.editor !== undefined) { cur.editor = clip_(set.editor, 80); notes.push('editor: ' + (cur.editor || 'cleared')); }
    if (set.sound !== undefined) { cur.sound = clip_(set.sound, 80); notes.push('sound: ' + (cur.sound || 'cleared')); }
    // A moved TX: days later (or earlier) than one week after the episode before.
    // Stored as a gap, not a date, so changing Episode 1's TX carries every break along.
    if (set.shift !== undefined) {
      var sh = Number(set.shift) || 0;
      if (ep === 1 || sh !== Math.floor(sh) || sh <= -7 || sh > 365) return { ok: false, error: 'bad_move' };
      if (sh) cur.shift = sh; else delete cur.shift;
      notes.push(sh ? 'TX moved ' + (sh > 0 ? '+' : '') + sh + ' days' : 'TX back to normal');
    }
    if (set.trailer !== undefined) {
      var t = clip_(set.trailer, 500);
      if (t && !/^https:\/\/[^\s"'<>]+$/.test(t)) return { ok: false, error: 'bad_link_any' };
      cur.trailer = t; notes.push('trailer ' + (t ? 'link set' : 'cleared'));
    }
    var list = Array.isArray(cur.dropped) ? cur.dropped : [];
    if (set.dropAdd) {
      var sc = clip_(set.dropAdd.sc, 5).toUpperCase().replace(/^0+(?=\d)/, '');
      if (!/^\d{1,3}[A-Z]?$/.test(sc)) return { ok: false, error: 'bad_scene' };
      var why = DROP_WHY_.indexOf(set.dropAdd.why) >= 0 ? set.dropAdd.why : 'Other';
      list = list.filter(function (d) { return d.sc !== sc; });
      list.push({ sc: sc, why: why, note: clip_(set.dropAdd.note, 200) });
      if (list.length > 80) return { ok: false, error: 'bad_request' };
      notes.push('dropped ' + ep + '/' + sc + ' (' + why + ')');
    }
    if (set.dropRemove !== undefined) {
      var gone = clip_(set.dropRemove, 5).toUpperCase();
      list = list.filter(function (d) { return d.sc !== gone; });
      notes.push('un-dropped ' + ep + '/' + gone);
    }
    cur.dropped = list;
    if (!cur.editor && !cur.sound && !cur.trailer && !cur.shift && !list.length) props.deleteProperty(key);
    else props.setProperty(key, JSON.stringify(cur));
    if (notes.length) log_(who, 'Post production', 'Episode ' + ep + ' ' + notes.join(', '));
  }
  return postAll_();
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
