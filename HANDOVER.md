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

## Robot v12 / app v27 (19.10.2026): estab rules v2
- The live Scripts tab (robot v11 on the real Drive text export) showed the export puts the scene number on its own line above the heading, so v1 took the heading line as body and missed drive-by estabs with O.S. dialogue (e.g. 2/12), and picked up "Blue Rev." page headers as notes.
- sceneHeads_ now ends a heading at the end of the line holding INT./EXT.; sceneNotes_ (NOTES_V = 2) drops page junk line by line, splits action from dialogue (speaker-only lines like "SAMANTHA (O.S.)" or inline "NAME text"), and calls a scene Estab when the action says Estab, or has a drive-by/various/transition cue in <= 25 words (dialogue after it does not matter), or is a short exterior arrival with only O.S. voices, or a silent exterior <= 18 words. Notes carry "_v":2; rows with older notes are read again by refreshScripts.
- App ignores robot notes without _v >= 2 and uses SCENE_NOTES (regenerated with v2 rules from the hand-read scripts; adds 12/1). Estab and Flashback lines say "Counted as shot".

## Robot v11 / app v26 (16.10.2026): Drive folders
- Drive > 02. NJORO WA UBA SN 25-28 - 2026 (1N2MiJDIMEUC9n7C3BuJZSECg6DgYSgPO) > N.W.U Cycle 7 | SCENE TRACKER (18qREQGQgviZBWPuh3e6BwEl8bBhYnRfY): the data Sheet was moved here (same id, nothing else changes), plus "READ ME: Scene Tracker links" (Google Doc). LOG SHEETS and SCRIPTS sit next to it in the same parent.
- Robot v11 exportsFolder_(): makes POST PRODUCTION EXPORTS inside TRACKER_FOLDER_ID itself (drive.file only allows writing into folders the robot made), keeps EXPORT_FOLDER, remakes it if trashed, falls back to My Drive with a log line if Drive refuses the parent. Export Sheets go in it, named "Njoro wa Uba Post Production (latest, dd.MM.yyyy HH.mm)"; the previous export is trashed. setup() makes the folder and logs its address.

## App v25 (16.10.2026)
- Activity groups are an accordion: opening one day, week or month folds the others; tapping the open one folds it.
- Excel / Google Sheet "All episodes": one merged, coloured Season cell per season (rotated); filter starts at column B.
- Install links (SETUP.md and raw Code.gs) shown in the export dialog when the robot is older than 10, and as a "Google script update" card on the Activity tab.

## App v24 (16.10.2026, afternoon)
- Open episode = every script scene in order (episodeRows): takes as before, "Not shot yet" lines for missing scenes, "Part shot: only 7B logged" lines, Estab / Flashback lines ("Not logged ..."). Labels (Estab, Flashback, Part shot, Reshoot...) at the end of the line. No script note text shown anywhere (Nick asked).
- Flashbacks count as shot (estabIn covers Estab and Flashback, so both are left out of "to shoot").
- Scenes filter: the Show menu value on screen now drives the list (a restored menu could leave the list filtered: "Nothing in Season 1 matches this filter" with All scenes showing), plus a Show all scenes link in that empty message. After sign-in the app returns to Post production or Activity if that was the tab chosen before.
- Post production: no season buttons; the chosen season is open (table + crew), the other three are folded lines (dates, Editors n/13, Sound n/13, On air). Tapping one opens it and folds the rest.
- Activity: every day / week / month group folds; newest open by default (ui.actOpen).

## Robot v10 / app v23 (16.10.2026)
- Scenes: no "X of Y shot" on episode rows (only "N to shoot" / "N part" pills, "All shot" when done) and no season totals line (Nick asked for both to go).
- Estab and Flashback: robot sceneNotes_() splits each script into scenes (sceneHeads_ keeps where each heading starts) and writes a Notes column (F) in the Scripts tab: {"4":"E|Various activities","2":"F|Cess telling..."}. Estab = says Estab, or a drive-by/various/time-lapse/transition cue in <= 25 words, or a silent exterior in <= 18 words. Flashback = FLASH in the heading or first line. Checked against a by-hand reading of all 12 scripts (Eps 1 to 10, 12, 13): same answers. App fallback SCENE_NOTES holds that reading until robot v10 is installed.
- Estab scenes are left out of "to shoot" and listed inside the open episode ("Estabs in the script, not counted as to shoot") with their note and whether they were logged. Flashbacks are listed with their note and get a Flashback label on chips, scene lines and search answers.
- Post production has its own deep blue (#1C4E80) for the tab, its tables and the export choices. A "Season N crew" card under the post table lists editors and sound with episode counts and numbers for the season.
- Activity: Group by Day / Week (Mon to Sun) / Month, each group with counts (changes, sign-ins, failed). Choice remembered (njw-actgroup).
- Export: dialog with Open in Google Sheets (robot exportSheet: xlsx from the app converted to a Google Sheet in Nick's Drive, anyone with the link can view, only the newest kept, older one trashed; EXPORT_ID property) and Download Excel. Excel: "Crew by season" sheet replaces the two per-person sheets: per role a Name x Season matrix (count and episode numbers), Not assigned row, Episodes covered row.
- EP10 added to SCRIPT_SEED and SCENE_COUNT (16 scenes; scenes 8 and 9 look like two versions of the same beat, both counted).

## App v22 (14.10.2026)
- Not in script: scene numbers outside the episode's script list are flagged in the paste preview (single and several days) and tagged "Not in script" on the scene line. Saved as written.
- Part shot: if only lettered parts of a scene are logged (7/7B) and no plain number, Completed or Continued, the scene counts as part shot (amber pill, hatched bar segment, "Part shot, check the rest was shot" chips). Not counted as shot.
- Season totals under the season heading in Scenes: shot of total, part shot, to shoot (episodes with a script only).
- Log sheets due by the end of the day after the shoot (logDue). Missing ones: red banner on Daily reports, "No log sheet" tag on the row, "Missing" in the detail.
- App only, no robot change.

## Robot v9 / app v19 (13.10.2026, 14:50)
- Repeats get a third choice, Continued (same scene finished on another day, e.g. 7/16 phone-call VO on Day 10). Counts on both days, tag "Continued". Robot v9 accepts it; unknown choices now return bad_request instead of silently undoing. With an older robot the app explains and offers Edit report (adding "continued" to the scene line gives the same result via the parser; tag Completed now displays as "Continued").

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
- Excel export: vendor/exceljs.min.js (ExcelJS 4.4.0, MIT), loaded only when Export is tapped. buildPostWorkbook() lays out formatted tables in the app colours (Arial, title bands, bordered banded rows, coloured status labels, totals, frozen headers, filters, print setup). Sheets: Summary (tiles plus crew tables), All episodes, Editors, Sound, Dropped scenes.
- Continued is not listed in the repeated scenes box (not even under decided); it shows as a tag on the scene line in its episode, with an Undo for the team.
- Continued on a robot older than version 9: the app writes "continued" into that day's report (reportWithContinued) instead of a decision, so the flag clears on any version.
- Post production: the airing episode row is dark-edged; the next to air gets a full lime row highlight (tr.pe.nextup), also on phones.
- Season picker is shared with Scenes (ui.season, localStorage njw-season).

- VOs (app v28, robot v13): the robot lists every NAME (V.O.) per scene in the Notes JSON as "vo" (notes _v 3). The app keeps VO_SEED for robots older than 13. Show "VOs to record" lists the pending ones per episode; episode rows get an "N VO" pill and scene lines a "VO Name" tag. A VO counts as recorded when a report line for that scene carries "VO" (e.g. "Joy VO - 1/1") or sits under a "VOs recorded" heading; with two VO names in one scene the line must name the person. VO-only takes never count the scene as shot and are left out of the scene list. App v29: each scene's VOs sit on a line just under it (tr.vosub, arrow, red chip until recorded, green with a tick after); the episode pill is red and reads "N pending VOs"; an episode with every scene shot gets a green row (tr.grp.allshot) and a ticked "All shot". App v30: lettered parts (7/7A, 7/7B) count the whole scene as shot (no more "part shot"); no progress bar under episodes; completed episodes use the old bar lime #9FC63B; pending VOs are amber #F2CF7A (red stays for scenes not shot). VOs never hold back "All shot": picture first, audio later.

## Architecture
- Reads: robot GET ?read=1 (reports, scripts, repeats; 30 s cache in CacheService). Falls back to gviz JSONP from the Sheet while the robot is older than 6.
- Writes: POST text/plain JSON with a session token. Actions: login (PASSCODE), logout, touch, check, save, saveMany, remove, drive, decide, post, postSave, note, signoutAll, activity. Writes return `data` (same as the read) so the saving phone updates at once.
- Sessions: CacheService S_<token> {n,g,c,a}; idle limit IDLE_MINUTES (default 30), max 12 h; touch:false for background polls; g must equal SESS_GEN.
- Activity: ACT_RING in Script Properties (last ~8 KB) always; Activity tab only when the Sheet is PRIVATE (checked every 10 min).
- Robot every 30 min: links missing log sheets, rewrites the Scripts tab (Episode | Script | Link | Updated | Scenes). Scene numbers come from converting each script PDF to a temporary Google Doc (drive.file + advanced Drive v3), cached per file version in Script Properties.
- Scopes: spreadsheets.currentonly, drive.readonly, drive.file, script.scriptapp, script.external_request (Drive export only). No Gmail.

## Rules
- Bump sw.js VERSION and index.html ?v= on each release (now njw-v30 / v=30).
- Commit as Nick Kibathi <nicholaskibathi@gmail.com>. Test with Playwright at 390 px and 1280 px.
- Never ask for or store the passcode or anyone's password. Plain language, no em/en dashes, honest pushback.
