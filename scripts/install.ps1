[CmdletBinding()]
param(
  [string]$Workspace = '',
  [switch]$SkipStart
)

$ErrorActionPreference = 'Stop'
$pluginRoot = Split-Path -Parent $PSScriptRoot
$dshWebUrl = 'http://127.0.0.1:3080'

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Test-Command([string]$Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Assert-NodeVersion {
  if (-not (Test-Command 'node')) {
    throw 'Node.js is not installed. Install Node.js 22.22.2+, 24.15.0+, or 26+, then run this installer again.'
  }
  $raw = (& node -p 'process.versions.node').Trim()
  $parts = $raw.Split('.')
  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  $patch = [int]$parts[2]
  $supported = ($major -ge 26) -or
    ($major -eq 24 -and (($minor -gt 15) -or ($minor -eq 15 -and $patch -ge 0))) -or
    ($major -eq 22 -and (($minor -gt 22) -or ($minor -eq 22 -and $patch -ge 2)))
  if (-not $supported) {
    throw "Unsupported Node.js $raw. Install Node.js 22.22.2+, 24.15.0+, or 26+."
  }
  Write-Host "Node.js $raw"
}

function Test-DshWeb {
  try {
    $rpcId = [guid]::NewGuid().ToString()
    $body = @{
      type = 'client-request'
      rpcId = $rpcId
      method = 'session.list'
      payload = @{ limit = 1 }
    } | ConvertTo-Json -Depth 5
    $response = Invoke-RestMethod -Method Post -Uri "$dshWebUrl/api/session.list" -ContentType 'application/json' -Body $body -TimeoutSec 3
    return $response.rpcId -eq $rpcId -and $response.result.ok -eq $true
  } catch {
    return $false
  }
}

function Set-ConfigValue([string[]]$Lines, [string]$Name, [string]$Value) {
  $prefix = "$Name="
  $updated = $false
  $result = foreach ($line in $Lines) {
    if ($line.StartsWith($prefix, [StringComparison]::Ordinal)) {
      $updated = $true
      "$prefix$Value"
    } else {
      $line
    }
  }
  if (-not $updated) { $result += "$prefix$Value" }
  return @($result)
}

Write-Host 'DSH Qwen Voice - Windows installer' -ForegroundColor Green
Write-Host "Target: DeepSeek Harness Web at $dshWebUrl"

Write-Step 'Checking prerequisites'
Assert-NodeVersion
if (-not (Test-Command 'npm.cmd')) {
  throw 'npm.cmd was not found next to Node.js.'
}
if (-not (Test-Command 'pnpm.cmd')) {
  Write-Host 'pnpm is missing; installing pnpm 11 globally with npm...'
  & npm.cmd install --global pnpm@11
  if ($LASTEXITCODE -ne 0) { throw 'Unable to install pnpm 11.' }
}
Write-Host "pnpm $((& pnpm.cmd --version).Trim())"

if (-not (Test-DshWeb)) {
  throw "DeepSeek Harness Web is not running at $dshWebUrl. Start it, confirm the page opens, then rerun scripts\install.cmd."
}
Write-Host 'DeepSeek Harness Web is reachable.'

Write-Step 'Installing dependencies and registering the plugins'
Push-Location $pluginRoot
try {
  & pnpm.cmd install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }
  & pnpm.cmd setup
  if ($LASTEXITCODE -ne 0) { throw 'pnpm setup failed.' }
} finally {
  Pop-Location
}

Write-Step 'Configuring DashScope realtime voice'
$configDir = Join-Path $env:USERPROFILE '.config\qwaudio'
$configPath = Join-Path $configDir 'config.env'
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
$lines = if (Test-Path -LiteralPath $configPath) {
  @(Get-Content -LiteralPath $configPath -Encoding UTF8)
} else {
  @()
}

$hasKey = $lines | Where-Object { $_ -match '^DASHSCOPE_API_KEY=\S+' -and $_ -notmatch '=sk-your-' }
if (-not $hasKey) {
  $secureKey = Read-Host 'Enter your DashScope API Key (input is hidden)' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  try {
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  if ([string]::IsNullOrWhiteSpace($apiKey)) { throw 'DashScope API Key cannot be empty.' }
  $lines = Set-ConfigValue $lines 'DASHSCOPE_API_KEY' $apiKey.Trim()
} else {
  Write-Host 'Existing DashScope API Key kept unchanged.'
}
$lines = Set-ConfigValue $lines 'QWEN_AUDIO_REALTIME_PROVIDER' 'dashscope'
$lines = Set-ConfigValue $lines 'QWEN_AUDIO_REALTIME_MODEL' 'qwen-audio-3.0-realtime-plus'
Set-Content -LiteralPath $configPath -Value $lines -Encoding UTF8
Write-Host "Saved local voice configuration to $configPath"

Write-Step 'Installation complete'
Write-Host 'Refresh http://127.0.0.1:3080, open a DSH session, and click "Set as coordinator session" once.'
if ($SkipStart) {
  Write-Host 'Start later with: pnpm start'
  exit 0
}

if ($Workspace) { $env:ACP_WORKSPACE = $Workspace }
Push-Location $pluginRoot
try {
  Write-Host 'Starting the voice runtime. Press Ctrl+C to stop.' -ForegroundColor Green
  & pnpm.cmd start
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
