[CmdletBinding()]
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'BaiYunfeiPortal'),
  [string]$AdminUsername = 'admin',
  [string]$AdminPassword = 'admin123',
  [ValidateRange(1, 65535)]
  [int]$Port = 4173,
  [switch]$ForceConfig
)

$ErrorActionPreference = 'Stop'
$sourceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$targetRoot = [System.IO.Path]::GetFullPath($InstallDir)

try {
  $nodeVersionText = (& node --version).TrimStart('v')
  $nodeVersion = [version]$nodeVersionText
} catch {
  throw '未检测到 Node.js。请先安装 Node.js 22.16 或更高版本。'
}
if ($nodeVersion -lt [version]'22.16.0') {
  throw "当前 Node.js 版本为 $nodeVersionText，需要 22.16 或更高版本。"
}
if ($AdminPassword.Length -lt 8) {
  throw '管理员密码至少需要 8 位。'
}

New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
if ($sourceRoot -ne $targetRoot) {
  foreach ($item in @('dist', 'scripts', 'config', 'bin', 'node_modules', 'package.json', '.env.example', 'INSTALL.md', 'THIRD_PARTY_NOTICES.md')) {
    $source = Join-Path $sourceRoot $item
    if (-not (Test-Path -LiteralPath $source)) {
      throw "安装包缺少必要内容：$item"
    }
    Copy-Item -LiteralPath $source -Destination $targetRoot -Recurse -Force
  }
}

New-Item -ItemType Directory -Path (Join-Path $targetRoot 'data') -Force | Out-Null
$envPath = Join-Path $targetRoot '.env.local'
if ($ForceConfig -or -not (Test-Path -LiteralPath $envPath)) {
  $encryptionKey = -join (1..4 | ForEach-Object { [guid]::NewGuid().ToString('N') })
  @(
    "CASE_ADMIN_USERNAME=$AdminUsername"
    "CASE_ADMIN_PASSWORD=$AdminPassword"
    'CASE_ADMIN_HOST=127.0.0.1'
    "CASE_ADMIN_PORT=$Port"
    'CASE_DATA_DIR=data'
    'CASE_BACKUP_LIMIT=10'
    'CASE_SESSION_HOURS=8'
    "PORTAL_ENCRYPTION_KEY=$encryptionKey"
  ) | Set-Content -LiteralPath $envPath -Encoding utf8
}

$launcher = Join-Path $targetRoot 'bin\start-windows.cmd'
Write-Host ''
Write-Host '白云飞个人门户安装完成。' -ForegroundColor Green
Write-Host "安装目录：$targetRoot"
Write-Host "知识与 AI 管理：http://127.0.0.1:$Port/admin/knowledge"
Write-Host "启动命令：$launcher"
Write-Host '首次登录后建议根据部署范围调整管理员密码。'
