# Njoro wa Uba Scene Tracker

Installable phone app for the Njoro wa Uba shoot. It shows which scenes have been shot, on which day, where, and links each day's log sheet.

- **Data:** the Google Sheet "Njoro wa Uba Scene Tracker Data". Each row is one continuity report pasted exactly as sent. The app reads the sheet and parses the reports itself.
- **Offline:** the app and the last reports it loaded stay on the phone.
- **Hosting:** GitHub Pages from the `main` branch.

Reports pasted one line per row (a paste into a cell that was only selected) are stitched back together by the app. A report posted again for the same shoot day replaces the earlier one; lower rows win.

## Episode scripts

Put scripts in the scripts folder in Drive, with the episode in the name (`Ep 7`, `EP07`, `Episode 7`) or inside a folder named for the episode. Every 30 minutes the Apps Script writes a **Scripts** tab listing the newest script per episode, and the app shows a **Script** button on that episode. It also reads each script's scene headings (PDFs are turned into text through a temporary Google Doc that it deletes straight after) and writes the scene numbers to a **Scenes** column, which drives the shot / to shoot count. Each script version is read once. Set the folder in `SCRIPTS_ROOT_ID` (Code.gs) and `SCRIPTS_FOLDER` (app.js).

## Who can change what

- **Everyone else:** read only. The app has no edit controls for them, and the Sheet is view-only.
- **Continuity team:** sign in once per phone with the continuity passcode (footer link). That turns on the **Add daily report** pop-up, plus Edit report and Remove day on each day. Anyone with the passcode can add, edit or remove any day.
- **Post production:** the same passcode opens a Post production tab. 52 episodes in 4 seasons of 13, with editor, sound, TX date, trailer link and dropped scenes per episode, all edited in place. Set the Episode 1 TX date once and every other episode is one week after the one before. This data is kept in the Google robot's Script Properties, not in the Sheet, because the Sheet can be read by anyone with its link.
- The passcode is checked by the Apps Script in `apps-script/Code.gs`, which runs as the Sheet's owner. It is never in the app's code. Each wrong try waits 3 seconds before it is answered, so guessing is too slow to work.
- Log sheets are attached automatically: on save, and every 30 minutes for days that are still missing one. The PDF must be in the log sheets folder (any subfolder) and named with the day and date, like `Day 9 9.10.2026.pdf`.

The script can edit only this one spreadsheet and can only look at Drive (never change it). It has no Gmail access. See `apps-script/appsscript.json`.

Setup steps: `apps-script/SETUP.md`.
