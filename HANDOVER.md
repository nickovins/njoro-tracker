# Handover: Njoro wa Uba Scene Tracker

Full handover doc for Nick: https://claude.ai/code/artifact/fe5468f1-15f3-4790-a545-5232e6801f0b

## Links
- App: https://nickovins.github.io/njoro-tracker/
- Data sheet: https://docs.google.com/spreadsheets/d/13mpLW2iFSSqDja--dwxXEEz_jVpjOeDudyWYy0fvT3I/edit
- Robot web app: https://script.google.com/macros/s/AKfycbzts4XJrONLd9LMRi_MgDsfK4_LqBLTRXAv7nuQpKHXOF88zw7x2-hbwTpZa8jZNFbk/exec
- Log sheets folder: https://drive.google.com/drive/folders/1KQgFJwqSnT5e3fR0aS7sNptej30-5Bs9
- Scripts folder: https://drive.google.com/drive/folders/1keWRPeybj1YUOr8c6MtPNM-tHS-zmnjZ

## State on 10.10.2026
- App live with: per-episode shot / to-shoot progress, Daily reports menu (add one, add several, update, delete), 30 s auto refresh, instant update after a save, Script buttons for Episodes 1 to 9, "Created by Nicholas Kibathi" footer.
- Robot (apps-script/Code.gs, VERSION 5) is written and tested against mocks only. Nick has NOT yet pasted it, set PASSCODE, run setup or redeployed as a New version. Until then sign-in returns not_set_up and the Scripts tab does not exist.
- Logged: Days 1 to 8 (30.09 to 08.10.2026).

## Post production (added 10.10.2026)
- Tab only shows after sign-in. Same passcode as continuity.
- Stored in Script Properties (POST_TX, POST_EP_<n> JSON: editor, sound, trailer, dropped[{sc,why,note}]). Not in the Sheet, which is public to anyone with the link.
- Robot actions: post (read, no lock) and postSave (one field, or dropAdd/dropRemove, merged server side so two editors do not undo each other).
- TX dates are worked out in the app: Episode n = Episode 1 TX + 7 x (n - 1). No per-episode override yet.
- Needs robot VERSION 5. With an older robot the tab says so instead of failing.

## Architecture
- Reads: gviz JSONP from the Sheet (tabs Reports and Scripts). Writes: POST text/plain JSON to the robot (actions check, save, saveMany, remove; responses carry `rows` so the saving phone updates at once).
- Robot every 30 min: links missing log sheets (PDF named "Day N D.M.YYYY"), rewrites the Scripts tab (Episode | Script | Link | Updated | Scenes). Scene numbers come from converting each script PDF to a temporary Google Doc (drive.file + advanced Drive v3), cached per file version in Script Properties.
- Fallbacks in app.js: SCRIPT_SEED (Ep 1 to 9 links), SCENE_COUNT (1:19 2:32 3:19 4:16 5:25 6:19 7:19 8:23 9:26).
- Scopes: spreadsheets.currentonly, drive.readonly, drive.file, script.scriptapp. No Gmail.

## Rules
- Bump sw.js VERSION and index.html ?v= on each release (now njw-v12 / v=12).
- Commit as Nick Kibathi <nicholaskibathi@gmail.com>. Test with Playwright at 390 px and 1280 px.
- Never ask for or store the passcode. Plain language, no em/en dashes, honest pushback.
