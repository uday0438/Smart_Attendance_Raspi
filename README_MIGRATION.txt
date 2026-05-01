ClassLens Raspberry Pi Migration Guide
======================================

I have prepared everything you need to move this project to your Raspberry Pi (10.22.178.171).

WHAT'S IN THE BUNDLE:
--------------------
- app.py: The optimized backend + frontend server.
- dist/: The built dashboard interface.
- requirements.txt: Python dependencies.
- attendance.db: Your current database.
- dataset/: Your registered student images.

OPTION 1: AUTOMATIC (Recommended)
--------------------------------
1. Open PowerShell on this computer.
2. Type: .\migrate.ps1
3. Enter your Raspberry Pi password when asked.

OPTION 2: MANUAL
----------------
1. Copy 'ClassLens_Pi_Migration.zip' to a USB drive or use WinSCP.
2. Move it to the Raspberry Pi.
3. Extract it: unzip ClassLens_Pi_Migration.zip -d attendence-main

POST-MIGRATION SETUP:
--------------------
Once the files are on the Pi:
1. Open the terminal on the Pi.
2. Go to the folder: cd ~/attendence-main
3. Install dependencies: pip install -r requirements.txt
4. Run the app: python3 app.py
