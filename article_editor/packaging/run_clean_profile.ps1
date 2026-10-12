# 새 PC 첫 실행 시험용: 이 PC 의 실제 데이터·열쇠와 분리된 빈 프로필로 EXE 를 실행한다.
#   사용: .\run_clean_profile.ps1 -Exe ..\dist\ipc\AINewsroom\AINewsroom.exe [-Profile C:\temp\ainews-clean] [-Http]
# 끝나면(앱을 닫은 뒤) scan_plaintext.py 로 평문 잔여물을 검사한다.
param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [string]$Profile = (Join-Path $env:TEMP 'ainews-clean-profile'),
    [switch]$Http
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Profile | Out-Null
$env:AI_NEWSROOM_APPDATA = Join-Path $Profile 'appdata'
$env:AI_NEWSROOM_DOCUMENTS = Join-Path $Profile 'documents'
$env:AI_NEWSROOM_VAULT = Join-Path $Profile 'vault\vault.db'
$env:AI_NEWSROOM_KEY_SERVICE = 'AI Newsroom (clean-profile test)'  # 실제 기기 키와 다른 자격 증명 항목
$env:AI_NEWSROOM_SKIP_DOTENV = '1'
$env:MODELS_DIR = Join-Path $Profile 'models'
$env:DESKTOP_STORAGE_DIR = Join-Path $Profile 'webview'
if ($Http) { $env:AI_NEWSROOM_TRANSPORT = 'http' }
Write-Host "프로필: $Profile"
Write-Host "앱을 닫으면 끝납니다. 기사에 'ZZ-MARKER-1' 같은 표식 문장을 쓰고 저장한 뒤 닫고, 다시 실행해 열리는지 확인하세요."
Start-Process -FilePath $Exe -Wait
Write-Host "다음: python scan_plaintext.py `"$Profile`" ZZ-MARKER-1"
