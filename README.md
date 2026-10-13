# Njoro wa Uba Scene Tracker

Installable phone app for the Njoro wa Uba shoot. It shows which scenes have been shot, on which day, where, and links each day's log sheet.

- **Data:** the Google Sheet "Njoro wa Uba Scene Tracker Data". Each row is one continuity report pasted exactly as sent. The app reads the sheet and parses the reports itself.
- **Offline:** the app and the last reports it loaded stay on the phone.
- **Hosting:** GitHub Pages from the `main` branch.

Reports pasted one line per row (a paste into a cell that was only selected) are stitched back together by the app. A report posted again for the same shoot day replaces the earlier one; lower rows win.

## Episode scripts

Put scripts in the scripts folder in Drive, with the episode in the name (`Ep 7`, `EP07`, `Episode 7`) or inside a folder named for the episode. Every 30 minutes the Apps Script writes a **Scripts** tab listing the newest script per episode, and the app shows a **Script** button on that episode. It also reads each script's scene headings (PDFs are turned into text through a temporary Google Doc that it deletes straight after) and writes the scene numbers to a **Scenes** column, which drives the shot / to shoot count. Each script version is read once. Set the folder in `SCRIPTS_ROOT_ID` (Code.gs) and `SCRIPTS_FOLDER` (app.js).

## Who can change what

- **Everyone:** sees Scenes (Season 1 to 4, 13 episodes each) and Daily reports. No edit controls.
- **Signed in (one admin password):** adds, updates and deletes daily reports, marks repeated scenes as Reshoot or Duplicate, runs Check Drive now, uses Post production (52 episodes, editor, sound, weekly TX dates, trailer, dropped scenes, Excel export with a crew summary) and sees Activity.
- The password is the Script Property PASSCODE. It can be changed in the app (Change admin password), which signs every other device out. Activity > Sign everyone out does the same without changing it.
- A sign-in ends after 30 minutes without use (Script Property IDLE_MINUTES) or after 12 hours. 20 wrong passwords in 15 minutes pause sign-in for 15 minutes.
- The name typed at sign-in is only a label in the activity log (Activity tab in the Sheet once the Sheet is private).
- The robot also serves the public read (`?read=1`), so the Sheet can be private.
- Log sheets attach automatically: on save, and every 30 minutes for days still missing one. Any PDF or image in the log sheets folder (any subfolder) named with the day and date (`Day 9 9.10.2026.pdf`), or the day alone if uploaded within 5 days of the shoot.
- A scene logged on two days is flagged at the top of the app until someone marks it Reshoot (both count) or Duplicate (only the first day counts). Decisions are in the Repeats tab.

The script can edit only this one spreadsheet and can only look at Drive (never change it). It has no Gmail access. Its only outside call is to Google Drive's own export address, to read the text of its temporary script copies. See `apps-script/appsscript.json`.

Setup steps: `apps-script/SETUP.md`.
