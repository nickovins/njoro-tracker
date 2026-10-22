# Installing the tracker update (Google robot version 16)

About 15 minutes, on a computer, signed in to the Google account that owns the
"Njoro wa Uba Scene Tracker Data" Sheet (nicholaskibathi@gmail.com).

Sheet: https://docs.google.com/spreadsheets/d/13mpLW2iFSSqDja--dwxXEEz_jVpjOeDudyWYy0fvT3I/edit
App: https://nickovins.github.io/njoro-tracker/

What changed in version 16 (security):
- The public read no longer sends Drive links. Script links, log sheet links and the Scripts /
  Log sheets buttons show only on a signed-in device.
- Optional personal passwords (`PASS_GEORGE` ...), so the activity log names the person and one
  person's access can be taken away without changing the master password.
- A stranger guessing passwords can no longer lock the team out: a device that signed in before
  has its own limit.
- Export > Open in Google Sheets is no longer shared with "anyone with the link".
- Remove day keeps a copy in a new **Deleted** tab; Activity > Recently deleted puts it back.
- Reports over 20,000 characters are refused, and errors no longer show Google's internal messages.

The app (the website) is already updated and still works with version 15, but until you install
version 16 the robot still hands the Drive links to anyone who asks it directly.

## Part A: update the Google robot

1. Open the Sheet. Click **Extensions > Apps Script**.
2. Open https://raw.githubusercontent.com/nickovins/njoro-tracker/main/apps-script/Code.gs
   Press Ctrl+A then Ctrl+C (Mac: Cmd+A, Cmd+C).
   In the editor click **Code.gs**, press Ctrl+A, then Ctrl+V. Press **Ctrl+S**.
   Check: press Ctrl+F, search `VERSION`, it says `var VERSION = 16;`.
   (appsscript.json did not change since version 7. If you skipped version 7,
   also paste https://raw.githubusercontent.com/nickovins/njoro-tracker/main/apps-script/appsscript.json
   into **appsscript.json**.)
3. Choose **cleanUp** in the function list at the top and click **Run**.
   The log says how many unused lines it removed and lists what is left (step 6 explains them).
4. Choose **setup** and click **Run**. If Google asks for permission, allow it as before.
   The log shows `Version 16 ready. ... scene numbers read for 12.` and then the address of the POST PRODUCTION EXPORTS folder.
5. **Deploy > Manage deployments** > the Web app whose ID starts with `AKfycbzts4XJrONLd9`
   > **pencil** > Version: **New version** > **Deploy**.
   Check https://script.google.com/macros/s/AKfycbzts4XJrONLd9LMRi_MgDsfK4_LqBLTRXAv7nuQpKHXOF88zw7x2-hbwTpZa8jZNFbk/exec?x=16
   says `"version":16`.

## Part B: Script Properties

6. Gear (**Project Settings**) > **Script Properties**. After cleanUp you will see only these:

   | Property | What it is | Touch it? |
   |---|---|---|
   | `PASSCODE` | The **master password** for Team sign-in | Yes: this is where you change it |
   | `PASS_GEORGE`, `PASS_MARY_W` ... | Optional. One person's own password (at least 8 characters) | Yes: add one per person, delete it to take their access away |
   | `IDLE_MINUTES` | Optional. Minutes without use before sign-out (default 30) | Optional |
   | `POST_TX` | Post production: Episode 1 TX date | No |
   | `POST_EP_1`, `POST_EP_2` ... | Post production: one line per episode with anything filled in (editor, sound, trailer, dropped scenes, moved TX) | **No: deleting one deletes that episode's post data** |
   | `ACT_RING` | The last few activity entries (backup of the Activity tab) | No |
   | `SESS_GEN` | Counts "Sign everyone out" | No |
   | `DEV_KEYS` | Devices that signed in before (only a short code each), so wrong guesses from strangers cannot lock them out | No |
   | `EXPORT_ID`, `EXPORT_FOLDER` | The newest Google Sheets export and its folder | No |
   | `VO_FIX` | The team's own VO corrections | No |

   The `POST_EP_` lines grow as the post team fills in episodes (up to 52). That is
   normal: they are the post production data. Export to Excel from the app keeps a backup.

7. To delete a line by hand (only for something not in the table above):
   **Edit script properties** > the bin icon at the end of that line > **Save script properties**.
   Running **cleanUp** (step 3) does the same for every unused line at once.

8. To change the master password: **Edit script properties** > change the value of
   `PASSCODE` > **Save script properties**. Every device signed in with it is signed out at
   once and needs the new password. Tell the team in person. Use a passphrase of 4 or more
   random words (like `mango ladder quiet river`): it is the only thing between the internet
   and Delete a day.

8b. Personal passwords (recommended): **Edit script properties** > **Add script property** >
   Property `PASS_GEORGE`, Value: George's own password (8+ characters) > **Save**.
   George signs in with it; the activity log then says "George (iPhone, Safari)". When
   someone leaves the team, delete their line: their devices are signed out at once.
   Then stop sharing the master password and keep it for yourself.

## Part C: make the Sheet and the Drive folders private (do this even if done before)

9. Sheet > **Share** > General access > **Restricted** > **Done**. Then open the app and
   tap **Refresh**: the reports must still show.
9b. In Drive, do the same for **SCRIPTS** and **N.W.U Cycle 7 | LOG SHEETS**: right-click >
   **Share** > General access > **Restricted**. Add the crew who need them by email (Viewer).
   Old script and log sheet links were public in earlier versions of the app, so this is
   what actually keeps unreleased scripts private.
9c. Share **POST PRODUCTION EXPORTS** (inside N.W.U Cycle 7 | SCENE TRACKER) with the post team
   by email (Viewer). Exports made from the app open only for them. Older exports that were
   shared by link: right-click > Share > General access > Restricted.

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
- "Sign-in is paused": too many wrong passwords in 15 minutes (20 for new devices, 10 for a
  device that signed in before). Wait 15 minutes, then check Activity for "Failed sign-in".
- A setup line says `Could not read EPISODE ...`: copy the whole log and send it to Claude.


## Where everything lives in Drive

Drive > **02. NJORO WA UBA SN 25-28 - 2026**
- **N.W.U Cycle 7 | SCENE TRACKER**
  - Njoro wa Uba Scene Tracker Data (the Sheet, with the Google robot inside: Extensions > Apps Script)
  - POST PRODUCTION EXPORTS (made by the robot; the newest export only)
  - READ ME: Scene Tracker links
- **N.W.U Cycle 7 | LOG SHEETS** (log sheet PDFs, named like `Day 9 9.10.2026.pdf`)
- **SCRIPTS** (episode scripts, named like `EPISODE 10.pdf`)

Moving or renaming these folders or the Sheet does not break the app: it finds them by their
Drive id, not their name. Deleting them does. Do not change the Sheet's sharing back to
"Anyone with the link": the app reads through the robot.
