# ClassLens Raspberry Pi Migration Script
$IP = "10.22.178.171"
$USER = "uday"
$ZIP = "ClassLens_Pi_Migration.zip"

Write-Host ">>> Starting migration to Raspberry Pi ($IP)..." -ForegroundColor Cyan

# 1. Send the file
Write-Host ">>> Sending $ZIP to Raspberry Pi..."
scp $ZIP "${USER}@${IP}:~/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "!!! Failed to send file. Ensure Raspberry Pi is ON and SSH is enabled." -ForegroundColor Red
    exit
}

# 2. Extract on Pi
Write-Host ">>> Extracting files on Raspberry Pi..."
ssh "${USER}@${IP}" "mkdir -p ~/attendence-main && unzip -o ~/$ZIP -d ~/attendence-main && rm ~/$ZIP"

Write-Host ">>> Migration COMPLETE!" -ForegroundColor Green
Write-Host ">>> You can now run the project on your Pi using:"
Write-Host "    1. cd ~/attendence-main"
Write-Host "    2. python3 app.py"
