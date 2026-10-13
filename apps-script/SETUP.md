# Installing the tracker update (Google robot version 7)

About 10 minutes, on a computer, signed in to the Google account that owns the
"Njoro wa Uba Scene Tracker Data" Sheet (nicholaskibathi@gmail.com).
Do the parts in order. Part A must be finished before Part B.

Sheet: https://docs.google.com/spreadsheets/d/13mpLW2iFSSqDja--dwxXEEz_jVpjOeDudyWYy0fvT3I/edit
App: https://nickovins.github.io/njoro-tracker/

What version 7 changes: one admin password instead of separate accounts, scene
numbers are read out of the scripts properly, and the Excel export has a crew
summary. The app (the website) is already updated.

## Part A: update the Google robot

1. Open the Sheet. Click **Extensions > Apps Script**. The script editor opens in a new tab.
2. Gear on the left (**Project Settings**): make sure
   **Show "appsscript.json" manifest file in editor** is ticked.
3. Open https://raw.githubusercontent.com/nickovins/njoro-tracker/main/apps-script/appsscript.json
   Press Ctrl+A then Ctrl+C (Mac: Cmd+A, Cmd+C).
   In the editor click **appsscript.json**, press Ctrl+A, then Ctrl+V.
   (This file changed: it adds one permission, see step 7.)
4. Open https://raw.githubusercontent.com/nickovins/njoro-tracker/main/apps-script/Code.gs
   Copy everything the same way. In the editor click **Code.gs**, Ctrl+A, Ctrl+V.
5. Press **Ctrl+S** (Mac: Cmd+S). Check: no orange dot next to the file names, and
   line 40 reads `var VERSION = 7;` (press Ctrl+F and search VERSION if unsure).
6. Gear (**Project Settings**) > **Script Properties**.
   `PASSCODE` is now **the admin password** everyone signs in with. Keep the one you
   set, or change it here. Anyone you give it to can make changes, so share it only
   with the people who need it. Click **Save script properties**.
7. Back in the editor (the `< >` icon), choose **setup** in the function list, click **Run**.
   Google asks for permission again because of the new line in appsscript.json:
   - **Review permissions**, pick your account, **Advanced** > **Go to ... (unsafe)**.
   - The list now also says **Connect to an external service**. That is only used to
     ask Google Drive for the text of its own temporary copy of each script.
   - Click **Allow**.
   - The Execution log should end with
     `Version 7 ready. Log sheets attached now: 0. Episode scripts found: 11, scene numbers read for 11.`
     (0 log sheets is right: Day 9 was attached on your last run.) It takes about a minute.
   - If a line says `Could not read EPISODE ...`, copy the whole log and send it to Claude.
8. Click **Deploy > Manage deployments**.
   - Click the Web app whose **Deployment ID** starts with `AKfycbzts4XJrONLd9`.
   - Click the **pencil**, open the **Version** dropdown, pick **New version** at the top.
   - Click **Deploy**. (Never "New deployment": that makes a new web address.)
9. Check: open this link:
   https://script.google.com/macros/s/AKfycbzts4XJrONLd9LMRi_MgDsfK4_LqBLTRXAv7nuQpKHXOF88zw7x2-hbwTpZa8jZNFbk/exec?x=7
   It must say `"version":7`. If you check again, change the end to `?x=8`, `?x=9`.

## Part B: make the Sheet private (skip if already done)

10. Open the Sheet > **Share** > General access > **Restricted** > **Done**.
11. Open the app and tap **Refresh**. The reports must still show. If they do not,
    set the Sheet back to "Anyone with the link" and tell Claude.
12. Optional: run **setup** again. The log then says `The Sheet is private. The Activity tab is on.`

## Part C: signing in

13. On each phone or laptop, close the app fully and open it again.
14. Tap **Sign in**. Type the admin password (step 6). Typing a name is optional: it
    only shows who did what in **Activity**.
15. To change the password for everyone: tap your name (top right) > **Change admin password**.
    Every other device is signed out and needs the new password.
16. **Activity > Sign everyone out** ends every sign-in at once, for example after a
    phone is lost.

## What happens by itself

- Sign-out after 30 minutes without taps or typing, and always after 12 hours.
  Change the 30 with a Script Property `IDLE_MINUTES` (5 to 720).
- 20 wrong passwords within 15 minutes pause all sign-ins for 15 minutes.
- Log sheets: a PDF or photo named like `Day 11 13.10.2026` anywhere inside the log
  sheets folder attaches to that day within 30 minutes.
- Scripts: a file named like `EPISODE 14.pdf` in the Scripts folder makes Episode 14
  appear with its Script button and scene count within 30 minutes.
- **Daily reports > Check Drive now** does both straight away.

## If something is off

- Step 9 shows a number below 7: the code was not saved (step 5), or the dropdown in
  step 8 was left on the old version. Redo steps 5 and 8.
- No deployment starts with `AKfycbzts4XJrONLd9`: you are in a different Apps Script
  project. Open https://script.google.com/home and find the project that has it.
- "That password is not right": check capitals and spaces against PASSCODE in step 6.
- "Sign-in is paused": wait 15 minutes. Then check Activity for who was trying.
- Forgot the password: read or change PASSCODE in step 6.
