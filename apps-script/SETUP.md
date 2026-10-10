# Installing the Google robot (version 5)

Do this on a computer, signed in to the Google account that owns the
"Njoro wa Uba Scene Tracker Data" Sheet. About 10 minutes the first time,
3 minutes for later updates (steps 4, 5 and 9 only).

Sheet: https://docs.google.com/spreadsheets/d/13mpLW2iFSSqDja--dwxXEEz_jVpjOeDudyWYy0fvT3I/edit

## First time only

1. Open the Sheet > **Share** > General access: **Anyone with the link**, role **Viewer**. Done.
   (The app reads daily reports through this link. Post production is NOT in the Sheet.)
2. In the Sheet: **Extensions > Apps Script**. The script editor opens in a new tab.
3. Click the gear (**Project Settings**) on the left. Tick
   **Show "appsscript.json" manifest file in editor**.

## Every update

4. Open https://raw.githubusercontent.com/nickovins/njoro-tracker/main/apps-script/appsscript.json
   Select all (Ctrl+A / Cmd+A), copy. In the editor click `appsscript.json`, select all, paste over it.
5. Open https://raw.githubusercontent.com/nickovins/njoro-tracker/main/apps-script/Code.gs
   Select all, copy. In the editor click `Code.gs`, select all, paste over it.
   Press Ctrl+S / Cmd+S. Check line 26 reads `var VERSION = 5;`.

## First time only

6. Gear (**Project Settings**) > scroll to **Script Properties** > **Add script property**.
   Property `PASSCODE`, value: the passcode your team will type. **Save script properties**.
   Pick something long (three words is good). Share it with the team in person or by
   WhatsApp. Never send it to Claude. Changing it here later signs everyone out.
7. Back in the editor (the `<>` icon). In the bar above the code, pick **setup** in the
   function list and click **Run**.
   - "Authorization required" > **Review permissions** > pick your account.
   - "Google hasn't verified this app" > **Advanced** > **Go to ... (unsafe)**. It is your own script.
   - The list should only say: this spreadsheet, see your Drive files, see/edit/delete only the
     files this app makes, and run when you are not present. Click **Allow**.
   - Bottom panel shows **Execution completed**. If it says no PASSCODE is set, redo step 6.
8. Only if you have never deployed: **Deploy > New deployment** > gear > **Web app**.
   Execute as **Me**, Who has access **Anyone**. **Deploy**. Send Claude the Web app URL
   (ends in /exec), because the app needs it. Then skip step 9.

## Every update

9. **Deploy > Manage deployments** > select the existing Web app > pencil (Edit) >
   Version: **New version** > **Deploy**.
   Do NOT use "New deployment" here: that makes a new web address and the app would
   keep talking to the old code.
10. Check: open the Web app URL in a browser. It should show
    `{"ok":true,"app":"njoro-tracker","version":5}`.
    https://script.google.com/macros/s/AKfycbzts4XJrONLd9LMRi_MgDsfK4_LqBLTRXAv7nuQpKHXOF88zw7x2-hbwTpZa8jZNFbk/exec

## On each phone or laptop

11. Open the tracker app and tap **Refresh**. If it looks unchanged, close the app fully and
    open it again (it updates itself on the next open).
12. **Team sign-in** > type the passcode. The **Post production** tab appears next to
    Daily reports.

## If something is off

- Post production says it "needs the latest Google robot": step 9 was missed, or
  "New deployment" was used instead. Redo step 9.
- Sign-in says "Uploads are not set up": PASSCODE missing (step 6).
- "That passcode is not right": check spaces and capitals in Script Properties.
