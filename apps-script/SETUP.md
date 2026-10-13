# Installing the tracker update (Google robot version 6)

About 15 minutes, on a computer, signed in to the Google account that owns the
"Njoro wa Uba Scene Tracker Data" Sheet (nicholaskibathi@gmail.com).
Do the parts in order. Part A must be finished before Part B.

Sheet: https://docs.google.com/spreadsheets/d/13mpLW2iFSSqDja--dwxXEEz_jVpjOeDudyWYy0fvT3I/edit
App: https://nickovins.github.io/njoro-tracker/

The app itself (the website) is already updated. Until Part A is done it keeps
working as before, but sign-in, the activity log, Check Drive now and the
automatic log sheet and script attaching all need the new robot.

## Part A: update the Google robot

1. Open the Sheet. Click **Extensions > Apps Script**. The script editor opens in a new tab.
2. Click the gear on the left (**Project Settings**). Tick
   **Show "appsscript.json" manifest file in editor** (skip if already ticked).
3. Open https://raw.githubusercontent.com/nickovins/njoro-tracker/main/apps-script/appsscript.json
   Press Ctrl+A then Ctrl+C (Mac: Cmd+A, Cmd+C).
   In the editor click **appsscript.json** on the left, press Ctrl+A, then Ctrl+V.
4. Open https://raw.githubusercontent.com/nickovins/njoro-tracker/main/apps-script/Code.gs
   Copy everything the same way. In the editor click **Code.gs**, Ctrl+A, Ctrl+V.
5. Press **Ctrl+S** (Mac: Cmd+S). Check: there is no orange dot next to Code.gs, and
   line 38 reads `var VERSION = 6;`.
6. Gear (**Project Settings**) > scroll to **Script Properties** > **Edit script properties**.
   - `PASSCODE`: give it a **new** value that only you know. It is now the owner's
     master key, used only to create or reset an admin account. The team signs in
     with their own names and passwords, so they no longer need it. Write it down
     somewhere safe. Never send it to anyone, including Claude.
   - Optional: add `IDLE_MINUTES` with a number (5 to 720) to change the automatic
     sign-out time. Without it, people are signed out after 30 minutes of no use.
   - Click **Save script properties**.
7. Back in the editor (the `< >` icon). In the bar above the code, choose **setup** in
   the function list and click **Run**.
   - "Authorization required": **Review permissions**, pick your account.
   - "Google hasn't verified this app": **Advanced** > **Go to ... (unsafe)**. It is your own script.
   - Click **Allow**.
   - The Execution log at the bottom should say
     `Version 6 ready. Log sheets attached now: 1. Episode scripts found: 11.`
     (The 1 is Day 9's log sheet. The 11 are Episodes 1 to 9, 12 and 13.)
     It also says `NEXT STEP: make the Sheet private`. That is Part B.
   - If it stops with "add PASSCODE", redo step 6.
8. Click **Deploy > Manage deployments**.
   - In the list on the left, click the Web app whose **Deployment ID** starts with
     `AKfycbzts4XJrONLd9`. That is the one the app talks to.
   - Click the **pencil** (Edit). Open the **Version** dropdown and pick **New version**
     at the top. (Leaving it on the version already shown changes nothing. This is why
     the check below showed "version 1" last time.)
   - Click **Deploy**. Close the panel.
   - Do NOT use "New deployment". That makes a new web address the app does not know.
9. Check: open this link in your browser:
   https://script.google.com/macros/s/AKfycbzts4XJrONLd9LMRi_MgDsfK4_LqBLTRXAv7nuQpKHXOF88zw7x2-hbwTpZa8jZNFbk/exec?x=1
   It must say `"version":6`. If you check again, change the end to `?x=2`, `?x=3`.
   Do not go on to Part B until it says 6.

## Part B: make the Sheet private

10. Open the Sheet > **Share** (top right) > General access > change
    "Anyone with the link" to **Restricted** > **Done**.
    The app now reads everything through the robot, so nobody outside can open
    the Sheet, and the names in the Activity tab stay private.
11. Open the app and tap **Refresh**. The reports must still show. If they do not,
    set the Sheet back to "Anyone with the link" and tell Claude what you see.
12. Optional: run **setup** once more (step 7). The log now says
    `The Sheet is private. The Activity tab is on.` and an **Activity** tab appears
    in the Sheet. (It also appears by itself the first time someone signs in.)

## Part C: accounts

13. Open the app > **Sign in** > **Owner setup** (small link at the bottom).
    Type your name, a new password (6 or more characters) and the PASSCODE from step 6.
    You are now signed in as **Admin**.
14. Tap **Admin**. Under **Add someone**, add each person with a first password and
    choose Team or Admin. Give them their password in person, not in the WhatsApp group.
15. Each person signs in with their name and password, then taps their name (top right)
    > **Change password** to pick their own.

## Part D: every phone

16. Close the app fully and open it again (it updates itself). Old "continuity
    passcode" sign-ins end; everyone signs in with name and password.

## What happens by itself now

- Log sheets: a PDF (or photo) named like `Day 11 13.10.2026` anywhere inside the
  log sheets folder, including month and week folders, attaches to that day within
  30 minutes. `Day 11.pdf` with no date also works if uploaded within 5 days.
- Scripts: a file named like `EPISODE 14.pdf` in the Scripts folder makes Episode 14
  appear with its Script button and scene count within 30 minutes.
- Signed-in people can skip the wait with **Daily reports > Check Drive now**.
- Sign-out: after 30 minutes without taps or typing, and always after 12 hours.

## If something is off

- The check in step 9 shows a number below 6: the code was not saved (step 5), or
  the dropdown in step 8 was left on the old version. Redo steps 5 and 8.
- No deployment starts with `AKfycbzts4XJrONLd9`: you are in a different Apps Script
  project. Open https://script.google.com/home, open each project's Deploy > Manage
  deployments until you find it, and paste the code there. Or make a New deployment
  where you are (Execute as Me, Anyone) and send Claude the new /exec address.
- "That name and password do not match": names ignore capitals and extra spaces, but
  must otherwise match what the admin typed. An admin can reset the password.
- "Too many wrong tries": wait 15 minutes, or an admin resets the password.
- You forgot your own admin password: Owner setup again with the PASSCODE.
