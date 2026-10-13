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
 * It has no access to Gmail, Calendar, Contacts or any other spreadsheet.
 * In Drive it only ever opens the log sheets and scripts folders below.
 *
 * Sign-in is by name and password. Passwords are stored only as salted
 * hashes in Script Properties. A sign-in ends after IDLE_MINUTES without use.
 * PASSCODE (Script Properties) is the owner's master key: it is only used
 * to create or reset an admin account. Never share it with the team.
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
var VERSION = 6;
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
  if (a === 'bootstrap') return bootstrap_(b);
  if (a === 'logout') { endSession_(b.token); return { ok: true }; }

  var me = session_(b.token, b.touch !== false);
  if (!me) return { ok: false, error: 'signed_out' };

  if (a === 'check' || a === 'touch') return { ok: true, user: pubUser_(me), idle: idleMinutes_() };
  if (a === 'post') return postAll_();
  if (a === 'activity') return me.role === 'admin' ? readActivity_() : { ok: false, error: 'not_allowed' };
  if (a === 'users') return me.role === 'admin' ? listUsers_() : { ok: false, error: 'not_allowed' };

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
  if (a === 'password') return changePassword_(b, me);
  if (me.role !== 'admin' && /^user/.test(a)) return { ok: false, error: 'not_allowed' };
  if (a === 'userAdd') return userAdd_(b, me);
  if (a === 'userReset') return userReset_(b, me);
  if (a === 'userRemove') return userRemove_(b, me);
  if (a === 'userRole') return userRole_(b, me);
  return { ok: false, error: 'bad_request' };
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
    throw new Error('Setup stopped: add PASSCODE in Project Settings > Script Properties, then run setup again.');
  }
  var logs = linkMissingLogs(), scripts = refreshScripts(240000);
  console.log('Version ' + VERSION + ' ready. Log sheets attached now: ' + logs + '. Episode scripts found: ' + scripts + '.');
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
    scripts: tabRows_(ss.getSheetByName(SCRIPTS_TAB), 5),
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

/* ---------- accounts and sign-in ---------- */

function props_() { return PropertiesService.getScriptProperties(); }
function idleMinutes_() { var n = Number(props_().getProperty('IDLE_MINUTES')); return n >= 5 && n <= 720 ? n : IDLE_MINUTES_DEFAULT; }
function nameKey_(n) { return String(n || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function cleanName_(n) { return String(n || '').replace(/[\u0000-\u001F<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40); }
function users_() { try { return JSON.parse(props_().getProperty('USERS') || '{}'); } catch (e) { return {}; } }
function saveUsers_(u) { props_().setProperty('USERS', JSON.stringify(u)); }
function pubUser_(u) { return { name: u.name, role: u.role }; }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }

function hex_(bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function hash_(pw, salt) {
  var v = salt + ':' + pw;
  for (var i = 0; i < 300; i++) v = hex_(Utilities.computeHmacSha256Signature(v, salt));
  return v;
}
function newSalt_() { return Utilities.getUuid().replace(/-/g, ''); }

function weakPassword_(pw) { return String(pw || '').length < 6; }

function login_(b) {
  var key = nameKey_(b.name), pw = String(b.password || ''), users = users_(), cache = CacheService.getScriptCache();
  if (!Object.keys(users).length) return { ok: false, error: 'no_users' };
  var fails = Number(cache.get('F_' + key)) || 0;
  if (fails >= 8) { log_(cleanName_(b.name) || '(blank)', 'Sign-in blocked', 'Too many wrong passwords. Try again in 15 minutes.'); return { ok: false, error: 'locked' }; }
  var u = users[key];
  if (!u || !same_(hash_(pw, u.salt), u.hash)) {
    cache.put('F_' + key, String(fails + 1), 900);
    Utilities.sleep(2000);                     // makes guessing slow
    log_(cleanName_(b.name) || '(blank)', 'Failed sign-in', u ? 'Wrong password' : 'No account with this name');
    return { ok: false, error: 'wrong_login' };
  }
  cache.remove('F_' + key);
  u.last = now_(); users[key] = u; saveUsers_(users);
  log_(u.name, 'Signed in', '');
  return startSession_(key, u);
}

/** Owner only: makes (or resets) an admin account using the master PASSCODE. */
function bootstrap_(b) {
  var gate = checkPasscode_(b.passcode);
  if (gate) { log_(cleanName_(b.name) || '(blank)', 'Failed owner setup', 'Wrong setup passcode'); return { ok: false, error: gate }; }
  var name = cleanName_(b.name), key = nameKey_(name), pw = String(b.password || '');
  if (name.length < 2) return { ok: false, error: 'bad_name' };
  if (weakPassword_(pw)) return { ok: false, error: 'weak_password' };
  var users = users_(), u = users[key] || { name: name, gen: 0, added: now_() };
  u.name = name; u.role = 'admin'; u.salt = newSalt_(); u.hash = hash_(pw, u.salt); u.gen = (u.gen || 0) + 1; u.last = now_();
  users[key] = u; saveUsers_(users);
  log_(name, 'Owner setup', 'Admin account set with the setup passcode');
  return startSession_(key, u);
}

function startSession_(key, u) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var s = { k: key, g: u.gen || 0, c: Date.now(), a: Date.now() };
  CacheService.getScriptCache().put('S_' + token, JSON.stringify(s), idleMinutes_() * 60);
  return { ok: true, token: token, user: pubUser_(u), idle: idleMinutes_() };
}

/** The signed-in user, or null. touch=false checks without counting as use. */
function session_(token, touch) {
  if (!token || !/^[a-f0-9]{64}$/.test(String(token))) return null;
  var cache = CacheService.getScriptCache(), raw = cache.get('S_' + token);
  if (!raw) return null;
  var s; try { s = JSON.parse(raw); } catch (e) { return null; }
  var idle = idleMinutes_() * 60000, now = Date.now();
  if (now - s.a > idle || now - s.c > SESSION_MAX_HOURS * 3600000) { cache.remove('S_' + token); return null; }
  var u = users_()[s.k];
  if (!u || (u.gen || 0) !== s.g) { cache.remove('S_' + token); return null; }   // removed, or password reset
  if (touch) { s.a = now; cache.put('S_' + token, JSON.stringify(s), idleMinutes_() * 60); }
  return { key: s.k, name: u.name, role: u.role };
}

function endSession_(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(String(token))) return;
  var cache = CacheService.getScriptCache(), raw = cache.get('S_' + token);
  if (!raw) return;
  cache.remove('S_' + token);
  try { var u = users_()[JSON.parse(raw).k]; if (u) log_(u.name, 'Signed out', ''); } catch (e) {}
}

function listUsers_() {
  var users = users_();
  return { ok: true, idle: idleMinutes_(), users: Object.keys(users).sort().map(function (k) {
    var u = users[k]; return { name: u.name, role: u.role, last: u.last || '', added: u.added || '' };
  }) };
}

function userAdd_(b, me) {
  var name = cleanName_(b.name), key = nameKey_(name), pw = String(b.password || ''), role = b.role === 'admin' ? 'admin' : 'member';
  if (name.length < 2) return { ok: false, error: 'bad_name' };
  if (weakPassword_(pw)) return { ok: false, error: 'weak_password' };
  var users = users_();
  if (users[key]) return { ok: false, error: 'name_taken' };
  if (Object.keys(users).length >= 60) return { ok: false, error: 'bad_request' };
  var salt = newSalt_();
  users[key] = { name: name, role: role, salt: salt, hash: hash_(pw, salt), gen: 1, added: now_(), last: '' };
  saveUsers_(users);
  log_(me.name, 'Added a team member', name + (role === 'admin' ? ' (admin)' : ''));
  return listUsers_();
}

function userReset_(b, me) {
  var key = nameKey_(b.name), pw = String(b.password || ''), users = users_(), u = users[key];
  if (!u) return { ok: false, error: 'not_found' };
  if (weakPassword_(pw)) return { ok: false, error: 'weak_password' };
  u.salt = newSalt_(); u.hash = hash_(pw, u.salt); u.gen = (u.gen || 0) + 1;
  saveUsers_(users);
  log_(me.name, 'Reset a password', u.name);
  return listUsers_();
}

function admins_(users) { return Object.keys(users).filter(function (k) { return users[k].role === 'admin'; }); }

function userRemove_(b, me) {
  var key = nameKey_(b.name), users = users_(), u = users[key];
  if (!u) return { ok: false, error: 'not_found' };
  if (key === me.key) return { ok: false, error: 'not_self' };
  if (u.role === 'admin' && admins_(users).length < 2) return { ok: false, error: 'last_admin' };
  delete users[key]; saveUsers_(users);
  log_(me.name, 'Removed a team member', u.name);
  return listUsers_();
}

function userRole_(b, me) {
  var key = nameKey_(b.name), users = users_(), u = users[key], role = b.role === 'admin' ? 'admin' : 'member';
  if (!u) return { ok: false, error: 'not_found' };
  if (key === me.key && role !== 'admin') return { ok: false, error: 'not_self' };
  if (u.role === 'admin' && role !== 'admin' && admins_(users).length < 2) return { ok: false, error: 'last_admin' };
  u.role = role; saveUsers_(users);
  log_(me.name, 'Changed a role', u.name + ' is now ' + (role === 'admin' ? 'an admin' : 'a team member'));
  return listUsers_();
}

function changePassword_(b, me) {
  var users = users_(), u = users[me.key];
  if (!u || !same_(hash_(String(b.current || ''), u.salt), u.hash)) { Utilities.sleep(1500); return { ok: false, error: 'wrong_current' }; }
  if (weakPassword_(b.password)) return { ok: false, error: 'weak_password' };
  u.salt = newSalt_(); u.hash = hash_(String(b.password), u.salt); u.gen = (u.gen || 0) + 1;
  saveUsers_(users);
  log_(u.name, 'Changed own password', '');
  return startSession_(me.key, u);              // the old sign-in ends; this one carries on
}

/* ---------- master passcode (owner setup only) ---------- */

function checkPasscode_(given) {
  var real = props_().getProperty('PASSCODE');
  if (!real) return 'not_set_up';
  if (same_(String(given || ''), real)) return '';
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
  var decision = b.decision === 'Reshoot' || b.decision === 'Duplicate' ? b.decision : '';
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
  var started = Date.now();
  var rows = Object.keys(best).map(Number).sort(function (a, b) { return a - b; }).map(function (ep) {
    var b = best[ep];
    var scenes = b.file ? scenesOf_(b.file, Date.now() - started < budgetMs) : '';
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
  var props = props_();
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
 *  "12A EXT. ROAD - NIGHT 12A", "4 FLASHBACK - ...", "7 INTERCUT - ...", "17 I/E DOOR 17",
 *  and typo'd headings that still carry the number at both ends: "2 NT. CAR - DAY 2". */
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
  // Any short CAPITALS line with the same number at both ends and a time of day.
  var loose = /(?:^|\n)\s*(\d{1,3}[A-Z]?)\s+([A-Z][^\na-z]{3,90}?)\s+(\d{1,3}[A-Z]?)\s*(?=\n|$)/g;
  while ((m = loose.exec(t))) if (m[1] === m[3] && /(DAY|NIGHT|EVENING|MORNING|AFTERNOON|CONTINUOUS|LATER|DAWN|DUSK)/.test(m[2])) add(m[1]);
  return out.sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10) || (a < b ? -1 : a > b ? 1 : 0); });
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
