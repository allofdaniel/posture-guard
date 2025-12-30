# GitHub Actions Self-Hosted Runner 설치 스크립트
# 관리자 권한으로 실행하세요

$RunnerDir = "C:\actions-runner"
$RepoUrl = "https://github.com/allofdaniel/posture-guard"

# 디렉토리 생성
if (-not (Test-Path $RunnerDir)) {
    New-Item -ItemType Directory -Path $RunnerDir -Force
}

Set-Location $RunnerDir

# 최신 runner 다운로드
$LatestRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/actions/runner/releases/latest"
$Asset = $LatestRelease.assets | Where-Object { $_.name -like "*win-x64*" -and $_.name -like "*.zip" }
$DownloadUrl = $Asset.browser_download_url
$ZipFile = Join-Path $RunnerDir "actions-runner.zip"

Write-Host "Downloading runner from $DownloadUrl..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipFile

Write-Host "Extracting..."
Expand-Archive -Path $ZipFile -DestinationPath $RunnerDir -Force
Remove-Item $ZipFile

# 토큰 가져오기 (gh cli 필요)
Write-Host "Getting registration token..."
$Token = gh api repos/allofdaniel/posture-guard/actions/runners/registration-token -X POST --jq '.token'

Write-Host "Configuring runner..."
& "$RunnerDir\config.cmd" --url $RepoUrl --token $Token --name "local-pc-runner" --labels "self-hosted,windows,android" --work "_work" --runasservice

Write-Host ""
Write-Host "Runner installed! To start manually, run:"
Write-Host "  cd $RunnerDir"
Write-Host "  .\run.cmd"
Write-Host ""
Write-Host "Or start the service:"
Write-Host "  Start-Service actions.runner.*"
