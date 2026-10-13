# Handover: Njoro wa Uba Scene Tracker

Full handover doc for Nick: https://claude.ai/code/artifact/fe5468f1-15f3-4790-a545-5232e6801f0b

## Links
- App: https://nickovins.github.io/njoro-tracker/
- Data sheet: https://docs.google.com/spreadsheets/d/13mpLW2iFSSqDja--dwxXEEz_jVpjOeDudyWYy0fvT3I/edit
- Robot web app: https://script.google.com/macros/s/AKfycbzts4XJrONLd9LMRi_MgDsfK4_LqBLTRXAv7nuQpKHXOF88zw7x2-hbwTpZa8jZNFbk/exec
- Log sheets folder: https://drive.google.com/drive/folders/1KQgFJwqSnT5e3fR0aS7sNptej30-5Bs9
- Scripts folder: https://drive.google.com/drive/folders/1keWRPeybj1YUOr8c6MtPNM-tHS-zmnjZ

## State on 13.10.2026 (evening): v8 / app v16
- Team sign-in = one master password (PASSCODE). No names, no in-app password change. gen_() = SESS_GEN + 6-byte digest of PASSCODE, so editing PASSCODE in Script Properties ends every session. Activity "Who" = "Team (<device>)" from the app's user agent.
- Script Properties tidy: scene-number cache moved from SC_* properties into the Scripts tab ("Updated" now has seconds; 'none' = read, no headings). cleanUp() deletes everything except PASSCODE, IDLE_MINUTES, POST_TX, POST_EP_n, ACT_RING, SESS_GEN; setup() runs it.
- Bug fixed: Sign everyone out did nothing (SESS_GEN was set from the string gen).
- UI: Nick tried the simplified v16 layout and asked to go back. App v17 = the v15 layout (logo plate, green stats bar, two search boxes, segmented views, header Daily reports menu) with v8 behaviour (master password sign-in, no password change in app, Activity times as DD.MM HH:MM).
- Nick's v7 status unknown; v8 steps in apps-script/SETUP.md (cleanUp, setup, New version deploy).

## App v18 (13.10.2026, 14:40)
- Post fields save while typing (1.2 s after the last key), on leaving the box, and on closing the app (fetch keepalive). Every unsaved value sits in localStorage njw-pending until Google confirms it; shown amber; resent after reload, sign-in or coming back online; "Save now" link. No redraw while a post box has focus (post.deferRender). Root cause of Nick's lost entries: a background redraw while typing reset the browser's change tracking, so leaving the box never saved.
- On air: airingEp() = last episode whose TX has come, until the next TX. Highlighted row, "On air" chip (also in Scenes), "On air / Airs next" bar that jumps to it.
- Phones: post episodes are one-line cards (editor, sound, dropped, trailer); only post.openEp shows its boxes. Opens on the episode on air or next.
- Repeats: Edit report buttons for both days.

## Post production (added 10.10.2026)
- Tab only shows after sign-in (one master password since v8).
- Stored in Script Properties (POST_TX, POST_EP_<n> JSON: editor, sound, trailer, dropped[{sc,why,note}]). Not in the Sheet, which is public to anyone with the link.
- Robot actions: post (read, no lock) and postSave (one field, or dropAdd/dropRemove, merged server side so two editors do not undo each other).
- TX dates are worked out in the app: Episode 1 = POST_TX; Episode n = Episode n-1 + 7 + shift(n). shift is stored per episode in days (Skip a week = +7), so a move carries every later episode and survives a change to Episode 1 TX. Desktop: click the date. Phone: Move pill.
- Install steps for Nick: apps-script/SETUP.md.
- Excel export: vendor/xlsx.full.min.js (SheetJS 0.18.5, Apache 2.0), loaded only when Export is tapped. Sheets: Post production, Dropped scenes, About.
- Season picker is shared with Scenes (ui.season, localStorage njw-season).

## Architecture
- Reads: robot GET ?read=1 (reports, scripts, repeats; 30 s cache in CacheService). Falls back to gviz JSONP from the Sheet while the robot is older than 6.
- Writes: POST text/plain JSON with a session token. Actions: login (PASSCODE), logout, touch, check, save, saveMany, remove, drive, decide, post, postSave, note, signoutAll, activity. Writes return `data` (same as the read) so the saving phone updates at once.
- Sessions: CacheService S_<token> {n,g,c,a}; idle limit IDLE_MINUTES (default 30), max 12 h; touch:false for background polls; g must equal SESS_GEN.
- Activity: ACT_RING in Script Properties (last ~8 KB) always; Activity tab only when the Sheet is PRIVATE (checked every 10 min).
- Robot every 30 min: links missing log sheets, rewrites the Scripts tab (Episode | Script | Link | Updated | Scenes). Scene numbers come from converting each script PDF to a temporary Google Doc (drive.file + advanced Drive v3), cached per file version in Script Properties.
- Scopes: spreadsheets.currentonly, drive.readonly, drive.file, script.scriptapp, script.external_request (Drive export only). No Gmail.

## Rules
- Bump sw.js VERSION and index.html ?v= on each release (now njw-v18 / v=18).
- Commit as Nick Kibathi <nicholaskibathi@gmail.com>. Test with Playwright at 390 px and 1280 px.
- Never ask for or store the passcode or anyone's password. Plain language, no em/en dashes, honest pushback.
