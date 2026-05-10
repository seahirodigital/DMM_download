param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$logPath = Join-Path $root 'start-error.log'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  'Node.js が見つかりません。Node.js をインストールしてから start.bat を再実行してください。' | Set-Content -LiteralPath $logPath -Encoding UTF8
  Write-Host 'Node.js が見つかりません。Node.js をインストールしてから start.bat を再実行してください。' -ForegroundColor Red
  exit 1
}

$hostName = '127.0.0.1'
$port = 4312
$configPath = Join-Path $root 'config\app-config.json'

if (Test-Path -LiteralPath $configPath) {
  try {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ($config.app.host) {
      $hostName = [string]$config.app.host
    }
    if ($config.app.port) {
      $port = [int]$config.app.port
    }
  } catch {
    Write-Host "config/app-config.json を読み込めませんでした。http://127.0.0.1:4312/ で起動します。" -ForegroundColor Yellow
  }
}

$browserHost = $hostName
if ($browserHost -eq '0.0.0.0' -or $browserHost -eq '::') {
  $browserHost = '127.0.0.1'
}

$url = "http://${browserHost}:$port/"

function Test-DashboardReady {
  param([string]$TargetUrl)

  try {
    Invoke-WebRequest -UseBasicParsing -Uri $TargetUrl -TimeoutSec 1 | Out-Null
    return $true
  } catch {
    return $false
  }
}

Write-Host "動画視聴: $url"

if (Test-DashboardReady -TargetUrl $url) {
  Write-Host 'サーバーはすでに起動しています。'
} else {
  Write-Host 'ローカルサーバーを起動しています...'
  Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', "title DMM Ranking Studio Server && cd /d `"$root`" && node --use-system-ca server.js")

  $ready = $false
  for ($i = 0; $i -lt 30; $i += 1) {
    Start-Sleep -Seconds 1
    if (Test-DashboardReady -TargetUrl $url) {
      $ready = $true
      break
    }
  }

  if ($ready) {
    Write-Host 'サーバーの準備ができました。'
  } else {
    Write-Host 'サーバーはまだ起動中です。先にブラウザを開きます。' -ForegroundColor Yellow
  }
}

if (-not $NoBrowser) {
  try {
    Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', 'start', '""', $url) -WindowStyle Hidden
  } catch {
    Write-Host "ブラウザを自動で開けませんでした。手動で開いてください: $url" -ForegroundColor Yellow
  }
}

Write-Host '完了しました。'
