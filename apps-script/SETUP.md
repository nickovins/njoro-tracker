# Switching on report uploads (one time, about 5 minutes)

1. Open the Google Sheet "Njoro wa Uba Scene Tracker Data".
2. Extensions > Apps Script. Delete what is in the editor, paste all of `Code.gs`, click Save.
3. Project Settings (gear icon) > Script Properties > Add script property:
   Property `PASSCODE`, value: the passcode you give the continuity team. Save.
4. Back in the editor, choose `setup` in the function menu and click Run.
   Approve the Google permission screens (it needs your Sheet and Drive).
5. Deploy > New deployment > type Web app.
   Execute as: Me. Who has access: Anyone. Deploy.
6. Copy the Web app URL (ends in /exec) and send it to Claude, or put it in
   `SCRIPT_URL` at the top of `app.js`.
7. Lock the Sheet so only the app can change it: in the Sheet, Data > Protect
   sheets and ranges > Reports tab > Restrict who can edit > Only you.

To change the passcode later, edit it in Script Properties. Everyone signed in
with the old one is signed out the next time they try to save.
