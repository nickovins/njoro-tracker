# Installing the tracker update (Google robot version 9)

About 10 minutes, on a computer, signed in to the Google account that owns the
"Njoro wa Uba Scene Tracker Data" Sheet (nicholaskibathi@gmail.com).

Sheet: https://docs.google.com/spreadsheets/d/13mpLW2iFSSqDja--dwxXEEz_jVpjOeDudyWYy0fvT3I/edit
App: https://nickovins.github.io/njoro-tracker/

What changed: version 9 adds the Continued choice for repeated scenes (the same scene finished on another day). Version 8: Team sign-in is one master password (no names, no
second password). Changing that password in Google signs every device out.
Script Properties are cleaned up. The app (the website) is already updated and keeps its usual layout.

## Part A: update the Google robot

1. Open the Sheet. Click **Extensions > Apps Script**.
2. Open https://raw.githubusercontent.com/nickovins/njoro-tracker/main/apps-script/Code.gs
   Press Ctrl+A then Ctrl+C (Mac: Cmd+A, Cmd+C).
   In the editor click **Code.gs**, press Ctrl+A, then Ctrl+V. Press **Ctrl+S**.
   Check: press Ctrl+F, search `VERSION`, it says `var VERSION = 9;`.
   (appsscript.json did not change since version 7. If you skipped version 7,
   also paste https://raw.githubusercontent.com/nickovins/njoro-tracker/main/apps-script/appsscript.json
   into **appsscript.json**.)
3. Choose **cleanUp** in the function list at the top and click **Run**.
   The log says how many unused lines it removed and lists what is left (step 6 explains them).
4. Choose **setup** and click **Run**. If Google asks for permission, allow it as before.
   The log should end with `Version 9 ready. ... scene numbers read for 11.`
5. **Deploy > Manage deployments** > the Web app whose ID starts with `AKfycbzts4XJrONLd9`
   > **pencil** > Version: **New version** > **Deploy**.
   Check https://script.google.com/macros/s/AKfycbzts4XJrONLd9LMRi_MgDsfK4_LqBLTRXAv7nuQpKHXOF88zw7x2-hbwTpZa8jZNFbk/exec?x=9
   says `"version":9`.

## Part B: Script Properties

6. Gear (**Project Settings**) > **Script Properties**. After cleanUp you will see only these:

   | Property | What it is | Touch it? |
   |---|---|---|
   | `PASSCODE` | The **master password** for Team sign-in | Yes: this is where you change it |
   | `IDLE_MINUTES` | Optional. Minutes without use before sign-out (default 30) | Optional |
   | `POST_TX` | Post production: Episode 1 TX date | No |
   | `POST_EP_1`, `POST_EP_2` ... | Post production: one line per episode with anything filled in (editor, sound, trailer, dropped scenes, moved TX) | **No: deleting one deletes that episode's post data** |
   | `ACT_RING` | The last few activity entries (backup of the Activity tab) | No |
   | `SESS_GEN` | Counts "Sign everyone out" | No |

   The `POST_EP_` lines grow as the post team fills in episodes (up to 52). That is
   normal: they are the post production data. Export to Excel from the app keeps a backup.

7. To delete a line by hand (only for something not in the table above):
   **Edit script properties** > the bin icon at the end of that line > **Save script properties**.
   Running **cleanUp** (step 3) does the same for every unused line at once.

8. To change the master password: **Edit script properties** > change the value of
   `PASSCODE` > **Save script properties**. Every signed-in device is signed out at
   once and needs the new password. Tell the team in person.

## Part C: make the Sheet private (skip if done)

9. Sheet > **Share** > General access > **Restricted** > **Done**. Then open the app and
   tap **Refresh**: the reports must still show.

## Part D: phones

10. Close the app fully and open it again. Tap **Sign in**, type the master password.

## What the robot can and cannot do in Google

Google shows these permissions when you allow it:

- **See, edit, create and delete only the specific Google Drive files you use with this
  app** (drive.file). In the code this is used for exactly one thing: making a
  temporary Google Doc copy of a script PDF so its scene numbers can be read, then
  deleting that copy. It cannot change or delete any file it did not make.
- **See and download all your Google Drive files** (drive.readonly). Needed to look
  inside the log sheets and scripts folders, which other people own. Read only.
- **View and manage spreadsheets that this application has been installed in**
  (spreadsheets.currentonly): only this Sheet. It cannot open any other spreadsheet.
- **Allow this application to run when you are not present** (script.scriptapp): the
  30-minute check.
- **Connect to an external service** (script.external_request): only to ask Google
  Drive for the text of its own temporary copy.

It has no access to Gmail, Calendar, Contacts or Docs.

## If something is off

- The version check shows a lower number: the code was not saved (step 2), or the
  dropdown in step 5 was left on the old version.
- "That password is not right": compare with `PASSCODE` (capitals and spaces count).
- "Sign-in is paused": 20 wrong passwords in 15 minutes. Wait 15 minutes, then check
  Activity.
- A setup line says `Could not read EPISODE ...`: copy the whole log and send it to Claude.
