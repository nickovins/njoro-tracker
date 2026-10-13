# Handover: Njoro wa Uba Scene Tracker

Full handover doc for Nick: https://claude.ai/code/artifact/fe5468f1-15f3-4790-a545-5232e6801f0b

## Links
- App: https://nickovins.github.io/njoro-tracker/
- Data sheet: https://docs.google.com/spreadsheets/d/13mpLW2iFSSqDja--dwxXEEz_jVpjOeDudyWYy0fvT3I/edit
- Robot web app: https://script.google.com/macros/s/AKfycbzts4XJrONLd9LMRi_MgDsfK4_LqBLTRXAv7nuQpKHXOF88zw7x2-hbwTpZa8jZNFbk/exec
- Log sheets folder: https://drive.google.com/drive/folders/1KQgFJwqSnT5e3fR0aS7sNptej30-5Bs9
- Scripts folder: https://drive.google.com/drive/folders/1keWRPeybj1YUOr8c6MtPNM-tHS-zmnjZ

## State on 13.10.2026 (afternoon)
- Nick ran setup on robot v6 at 12:39: Scripts tab and Repeats tab made, Day 9 log linked, but every script failed "Conversion ... to text/markdown failed" (DriveApp getAs cannot turn a Google Doc into text). Fixed in v7: export via UrlFetchApp to drive/v3/files/{id}/export?mimeType=text/plain with ScriptApp.getOAuthToken() (new scope script.external_request). The Node mock now throws on getAs like real Google.
- v7: accounts removed at Nick's request. One admin password = Script Property PASSCODE. Name at sign-in is only an activity label. SESS_GEN bump on password change or "Sign everyone out". setup() deletes the old USERS property.
- Export (Excel): Summary (per editor and sound person: episodes, aired, still to air, episode numbers, first/last TX; episodes with nobody), Editors, Sound (each episode with TX date, day, status, totals), All episodes, Dropped scenes. Cells like "Wanjiru & Kamau" count for both.
- Waiting on Nick: paste v7, run setup (re-authorise), New version deploy, then make the Sheet Restricted. Steps: apps-script/SETUP.md.
- Scripts in Drive: Episodes 1 to 9, 12, 13. Repeat waiting: 7/16 (Day 7 and Day 10).

## Post production (added 10.10.2026)
- Tab only shows after sign-in (one admin password since v7).
- Stored in Script Properties (POST_TX, POST_EP_<n> JSON: editor, sound, trailer, dropped[{sc,why,note}]). Not in the Sheet, which is public to anyone with the link.
- Robot actions: post (read, no lock) and postSave (one field, or dropAdd/dropRemove, merged server side so two editors do not undo each other).
- TX dates are worked out in the app: Episode 1 = POST_TX; Episode n = Episode n-1 + 7 + shift(n). shift is stored per episode in days (Skip a week = +7), so a move carries every later episode and survives a change to Episode 1 TX. Desktop: click the date. Phone: Move pill.
- Install steps for Nick: apps-script/SETUP.md.
- Excel export: vendor/xlsx.full.min.js (SheetJS 0.18.5, Apache 2.0), loaded only when Export is tapped. Sheets: Post production, Dropped scenes, About.
- Season picker is shared with Scenes (ui.season, localStorage njw-season).

## Architecture
- Reads: robot GET ?read=1 (reports, scripts, repeats; 30 s cache in CacheService). Falls back to gviz JSONP from the Sheet while the robot is older than 6.
- Writes: POST text/plain JSON with a session token. Actions: login (PASSCODE), logout, touch, check, save, saveMany, remove, drive, decide, post, postSave, note, password, signoutAll, activity. Writes return `data` (same as the read) so the saving phone updates at once.
- Sessions: CacheService S_<token> {n,g,c,a}; idle limit IDLE_MINUTES (default 30), max 12 h; touch:false for background polls; g must equal SESS_GEN.
- Activity: ACT_RING in Script Properties (last ~8 KB) always; Activity tab only when the Sheet is PRIVATE (checked every 10 min).
- Robot every 30 min: links missing log sheets, rewrites the Scripts tab (Episode | Script | Link | Updated | Scenes). Scene numbers come from converting each script PDF to a temporary Google Doc (drive.file + advanced Drive v3), cached per file version in Script Properties.
- Scopes: spreadsheets.currentonly, drive.readonly, drive.file, script.scriptapp, script.external_request (Drive export only). No Gmail.

## Rules
- Bump sw.js VERSION and index.html ?v= on each release (now njw-v15 / v=15).
- Commit as Nick Kibathi <nicholaskibathi@gmail.com>. Test with Playwright at 390 px and 1280 px.
- Never ask for or store the passcode or anyone's password. Plain language, no em/en dashes, honest pushback.
