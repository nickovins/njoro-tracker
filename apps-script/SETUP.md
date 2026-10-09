# Switching on report uploads

The Sheet now lives in the owner's own Drive (not the shared log sheets folder),
so only the owner can edit it or its script.

1. Sheet > Share > General access: **Anyone with the link**, role **Viewer**.
   (The app reads the reports through this link.)
2. Sheet > Extensions > Apps Script.
3. Project Settings (gear) > tick **Show "appsscript.json" manifest file in editor**.
4. Editor > `appsscript.json`: replace everything with this folder's `appsscript.json`. Save.
5. Editor > `Code.gs`: replace everything with this folder's `Code.gs`. Save.
6. Project Settings > Script Properties > Add: `PASSCODE` = the continuity passcode. Save.
7. Editor: choose `setup`, Run. On the warning "Google hasn't verified this app":
   Advanced > Go to project (unsafe). It is your own script. Check the list says
   only: this spreadsheet, see Drive files, "see, edit, create and delete only the
   specific Google Drive files you use with this app" (its own temporary copies of
   scripts, used to count scenes), run when you are not present. Allow.
8. Deploy > New deployment > Web app. Execute as **Me**, access **Anyone**. Deploy.
9. Send the Web app URL (ends /exec) to Claude. Never send the passcode.
