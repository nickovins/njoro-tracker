# Handover: Njoro wa Uba Scene Tracker

Full handover doc for Nick: https://claude.ai/code/artifact/fe5468f1-15f3-4790-a545-5232e6801f0b

## Links
- App: https://nickovins.github.io/njoro-tracker/
- Data sheet: https://docs.google.com/spreadsheets/d/13mpLW2iFSSqDja--dwxXEEz_jVpjOeDudyWYy0fvT3I/edit
- Robot web app: https://script.google.com/macros/s/AKfycbzts4XJrONLd9LMRi_MgDsfK4_LqBLTRXAv7nuQpKHXOF88zw7x2-hbwTpZa8jZNFbk/exec
- Log sheets folder: https://drive.google.com/drive/folders/1KQgFJwqSnT5e3fR0aS7sNptej30-5Bs9
- Scripts folder: https://drive.google.com/drive/folders/1keWRPeybj1YUOr8c6MtPNM-tHS-zmnjZ

## State on 13.10.2026
- Live robot is still VERSION 1 (Nick's check on 10.10 showed version 1). Everything automatic (log sheets, scripts tab, sign-in) waits on it. App v14 handles that: reads the public Sheet when the robot is old, and says "update the robot" on sign-in.
- Robot VERSION 6 written: name + password accounts, 30 min idle sign-out, Activity tab, Repeats tab, public read (?read=1), Check Drive now, forgiving log/scene matching. Tested in a Node mock of Google (unit.js) and Playwright e2e (e2e.js, 390 and 1280 px) with the real reports and Drive names.
- Logged: Days 1 to 10. Day 9 log sheet ("Day 9 9.10.2026.pdf", October/Week 2) not linked in the Sheet yet; LOG_SEED in app.js shows it until the robot writes it.
- Scripts in Drive: Episodes 1 to 9, 12, 13 (no 10, 11). SCRIPT_SEED and SCENE_COUNT (12:25, 13:24) cover them until the Scripts tab exists. Episode 13 has a typo heading "2 NT." which sceneNumbers_ now catches.
- 7/16 (Day 7 and Day 10) is the first repeat waiting for a Reshoot/Duplicate decision.
- Sheet is still "anyone with the link"; SETUP.md Part B makes it Restricted after the robot is on 6.

## Post production (added 10.10.2026)
- Tab only shows after sign-in (name + password since v6).
- Stored in Script Properties (POST_TX, POST_EP_<n> JSON: editor, sound, trailer, dropped[{sc,why,note}]). Not in the Sheet, which is public to anyone with the link.
- Robot actions: post (read, no lock) and postSave (one field, or dropAdd/dropRemove, merged server side so two editors do not undo each other).
- TX dates are worked out in the app: Episode 1 = POST_TX; Episode n = Episode n-1 + 7 + shift(n). shift is stored per episode in days (Skip a week = +7), so a move carries every later episode and survives a change to Episode 1 TX. Desktop: click the date. Phone: Move pill.
- Install steps for Nick: apps-script/SETUP.md.
- Excel export: vendor/xlsx.full.min.js (SheetJS 0.18.5, Apache 2.0), loaded only when Export is tapped. Sheets: Post production, Dropped scenes, About.
- Season picker is shared with Scenes (ui.season, localStorage njw-season).

## Architecture
- Reads: robot GET ?read=1 (reports, scripts, repeats; 30 s cache in CacheService). Falls back to gviz JSONP from the Sheet while the robot is older than 6.
- Writes: POST text/plain JSON with a session token. Actions: login, bootstrap (PASSCODE), logout, touch, check, save, saveMany, remove, drive, decide, post, postSave, note, password, users/userAdd/userReset/userRemove/userRole (admin), activity (admin). Writes return `data` (same as the read) so the saving phone updates at once.
- Sessions: CacheService S_<token> {k,g,c,a}; idle limit IDLE_MINUTES (default 30), max 12 h; touch:false for background polls. USERS in Script Properties (salted HMAC-SHA256 x300). gen bump on reset ends old sessions.
- Activity: ACT_RING in Script Properties (last ~8 KB) always; Activity tab only when the Sheet is PRIVATE (checked every 10 min).
- Robot every 30 min: links missing log sheets, rewrites the Scripts tab (Episode | Script | Link | Updated | Scenes). Scene numbers come from converting each script PDF to a temporary Google Doc (drive.file + advanced Drive v3), cached per file version in Script Properties.
- Scopes: spreadsheets.currentonly, drive.readonly, drive.file, script.scriptapp. No Gmail.

## Rules
- Bump sw.js VERSION and index.html ?v= on each release (now njw-v14 / v=14).
- Commit as Nick Kibathi <nicholaskibathi@gmail.com>. Test with Playwright at 390 px and 1280 px.
- Never ask for or store the passcode or anyone's password. Plain language, no em/en dashes, honest pushback.
