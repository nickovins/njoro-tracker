# Njoro wa Uba Scene Tracker

Installable phone app for the Njoro wa Uba shoot. It shows which scenes have been shot, on which day, where, and links each day's log sheet.

- **Data:** the Google Sheet "Njoro wa Uba Scene Tracker Data". Each row is one continuity report pasted exactly as sent. The app reads the sheet and parses the reports itself.
- **Offline:** the app and the last reports it loaded stay on the phone.
- **Hosting:** GitHub Pages from the `main` branch.

Reports pasted one line per row (a paste into a cell that was only selected) are stitched back together by the app. A report posted again for the same shoot day replaces the earlier one; lower rows win.

## Episode scripts

Put scripts in the scripts folder in Drive, with the episode in the name (`Ep 7`, `EP07`, `Episode 7`) or inside a folder named for the episode. Every 30 minutes the Apps Script writes a **Scripts** tab listing the newest script per episode, and the app shows a **Script** button on that episode. It also reads each script's scene headings (PDFs are turned into text through a temporary Google Doc that it deletes straight after) and writes the scene numbers to a **Scenes** column, which drives the shot / to shoot count. Each script version is read once. Set the folder in `SCRIPTS_ROOT_ID` (Code.gs) and `SCRIPTS_FOLDER` (app.js).

## Who can change what

- **Everyone:** sees Scenes (Season 1 to 4, 13 episodes each) and Daily reports. No edit controls and no Drive links: the Scripts and Log sheets buttons, script links and log sheet links show only after signing in.
- **Team, view only (signed in with their own password, `PASS_<NAME>`):** also sees the Scripts and Log sheets buttons, script and log sheet links, and their own page, **Signed in as <name>**, with their animal badge: the next episode on air (date and editor), their own episodes with TX dates, and the producer's notes on them (which they mark read). Nothing about anyone else's episodes, sound, trailers or dropped scenes. Changes nothing.
- **Producer / director (`PROD_<NAME>`, like `PROD_GRACE`):** everything the admin sees except Activity, read only (all of Post production, Download Excel). The only changes: notes and scene updates (a missing or newly added scene) to any episode's editor; deletes only her own. Editors tick scene updates done.
- **Admin (signed in with the master password):** writes producer notes per episode (Post production > Notes), sees who read them and when each person last opened the app (Activity > Team), and adds, updates and deletes daily reports, marks repeated scenes as Reshoot, Duplicate or Continued, runs Check Drive now, uses Post production (52 episodes, editor, sound, weekly TX dates, trailer, dropped scenes, a formatted Excel export with a crew summary) and sees Activity.
- The master password is the Script Property PASSCODE. Each person can also have their own view-only password: a Script Property `PASS_<NAME>` (like `PASS_GEORGE`, at least 8 characters). Changing or deleting a password signs out the devices that used it. Activity > Sign everyone out signs out every device.
- A sign-in ends after 30 minutes without use (Script Property IDLE_MINUTES) or after 12 hours. Wrong passwords: 20 in 15 minutes pause sign-in for new devices; a device that signed in before has its own limit (10), so a stranger cannot lock the team out. The activity log names the person and device (for example "George (iPhone, Safari)").
- The robot also serves the public read (`?read=1`), without Drive links, so the Sheet can be private. A signed-in device gets the links through its sign-in.
- Remove day keeps a copy in the Sheet's **Deleted** tab; Activity > Recently deleted puts it back.
- Export > Open in Google Sheets is not shared by link. It opens for the people the POST PRODUCTION EXPORTS folder is shared with.
- Log sheets attach automatically: on save, and every 30 minutes for days still missing one. Any PDF or image in the log sheets folder (any subfolder) named with the day and date (`Day 9 9.10.2026.pdf`), or the day alone if uploaded within 5 days of the shoot.
- A scene logged on two days is flagged at the top of the app until someone marks it Reshoot (both count) or Duplicate (only the first day counts). Decisions are in the Repeats tab.
- Script Properties: PASSCODE, PASS_<NAME> (optional), IDLE_MINUTES (optional), POST_TX, POST_EP_<n>, ACT_RING, SESS_GEN, DEV_KEYS, EXPORT_ID, EXPORT_FOLDER, VO_FIX. `cleanUp()` removes anything else.

The script can edit only this one spreadsheet and can only look at Drive (never change it). It has no Gmail access. Its only outside call is to Google Drive's own export address, to read the text of its temporary script copies. See `apps-script/appsscript.json`.

Setup steps: `apps-script/SETUP.md`.
