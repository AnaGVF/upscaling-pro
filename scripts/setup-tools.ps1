param(
  [switch]$Force,
  [switch]$SkipRealEsrgan,
  [switch]$SkipFfmpeg
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RootDir = Resolve-Path (Join-Path $PSScriptRoot '..')
$ToolsDir = Join-Path $RootDir 'tools'
$DownloadsDir = Join-Path $ToolsDir '_downloads'
$RealEsrganDir = Join-Path $ToolsDir 'realesrgan-ncnn-vulkan'
$FfmpegDir = Join-Path $ToolsDir 'ffmpeg'
$DotEnvPath = Join-Path $RootDir '.env'
$DotEnvExamplePath = Join-Path $RootDir '.env.example'

New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
New-Item -ItemType Directory -Force -Path $DownloadsDir | Out-Null

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message"
}

function Remove-LocalDirectory($PathToRemove) {
  if (-not (Test-Path $PathToRemove)) {
    return
  }

  $resolvedTarget = [System.IO.Path]::GetFullPath($PathToRemove)
  $resolvedTools = [System.IO.Path]::GetFullPath($ToolsDir)

  if (-not $resolvedTarget.StartsWith($resolvedTools, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a path outside tools/: $resolvedTarget"
  }

  Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
}

function Download-File($Url, $Destination) {
  Write-Host "Downloading $Url"
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination
}

function Set-DotEnvValue($PathToEnv, $Key, $Value) {
  if (Test-Path $PathToEnv) {
    $lines = @(Get-Content $PathToEnv)
  } elseif (Test-Path $DotEnvExamplePath) {
    $lines = @(Get-Content $DotEnvExamplePath)
  } else {
    $lines = @()
  }

  $nextLine = "$Key=$Value"
  $found = $false
  $updated = foreach ($line in $lines) {
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=") {
      $found = $true
      $nextLine
    } else {
      $line
    }
  }

  if (-not $found) {
    $updated += $nextLine
  }

  Set-Content -Path $PathToEnv -Value $updated
}

function Install-RealEsrgan {
  $exePath = Join-Path $RealEsrganDir 'realesrgan-ncnn-vulkan.exe'
  $modelsPath = Join-Path $RealEsrganDir 'models'

  if ((Test-Path $exePath) -and (Test-Path $modelsPath) -and (-not $Force)) {
    Write-Step "Real-ESRGAN already exists"
    Write-Host $exePath
    return
  }

  Write-Step "Installing Real-ESRGAN NCNN Vulkan into tools/"
  $zipUrl = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip'
  $zipPath = Join-Path $DownloadsDir 'realesrgan-ncnn-vulkan-20220424-windows.zip'
  $extractDir = Join-Path $ToolsDir '_extract-realesrgan'

  if ((-not (Test-Path $zipPath)) -or $Force) {
    Download-File $zipUrl $zipPath
  }

  Remove-LocalDirectory $extractDir
  New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

  $exe = Get-ChildItem -Path $extractDir -Recurse -Filter 'realesrgan-ncnn-vulkan.exe' |
    Select-Object -First 1

  if (-not $exe) {
    throw 'Downloaded Real-ESRGAN archive did not contain realesrgan-ncnn-vulkan.exe.'
  }

  Remove-LocalDirectory $RealEsrganDir
  New-Item -ItemType Directory -Force -Path $RealEsrganDir | Out-Null
  Copy-Item -Path (Join-Path $exe.Directory.FullName '*') -Destination $RealEsrganDir -Recurse -Force
  Remove-LocalDirectory $extractDir

  if (-not (Test-Path (Join-Path $modelsPath 'realesrgan-x4plus.param'))) {
    throw "Real-ESRGAN installed, but the required model file is missing: $(Join-Path $modelsPath 'realesrgan-x4plus.param')"
  }

  Write-Host "Installed $exePath"
}

function Install-Ffmpeg {
  $ffmpegExe = Join-Path $FfmpegDir 'bin\ffmpeg.exe'
  $ffprobeExe = Join-Path $FfmpegDir 'bin\ffprobe.exe'

  if ((Test-Path $ffmpegExe) -and (Test-Path $ffprobeExe) -and (-not $Force)) {
    Write-Step "FFmpeg already exists"
    Write-Host $ffmpegExe
    return
  }

  Write-Step "Installing FFmpeg into tools/"
  $zipUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
  $zipPath = Join-Path $DownloadsDir 'ffmpeg-release-essentials.zip'
  $extractDir = Join-Path $ToolsDir '_extract-ffmpeg'

  if ((-not (Test-Path $zipPath)) -or $Force) {
    Download-File $zipUrl $zipPath
  }

  Remove-LocalDirectory $extractDir
  New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

  $ffmpeg = Get-ChildItem -Path $extractDir -Recurse -Filter 'ffmpeg.exe' |
    Where-Object { $_.FullName -match '\\bin\\ffmpeg\.exe$' } |
    Select-Object -First 1

  if (-not $ffmpeg) {
    throw 'Downloaded FFmpeg archive did not contain bin\ffmpeg.exe.'
  }

  $sourceRoot = Split-Path -Parent (Split-Path -Parent $ffmpeg.FullName)
  Remove-LocalDirectory $FfmpegDir
  New-Item -ItemType Directory -Force -Path $FfmpegDir | Out-Null
  Copy-Item -Path (Join-Path $sourceRoot '*') -Destination $FfmpegDir -Recurse -Force
  Remove-LocalDirectory $extractDir

  Write-Host "Installed $ffmpegExe"
}

if (-not $SkipRealEsrgan) {
  Install-RealEsrgan
}

if (-not $SkipFfmpeg) {
  Install-Ffmpeg
}

$realExePath = Join-Path $RealEsrganDir 'realesrgan-ncnn-vulkan.exe'
$realModelsPath = Join-Path $RealEsrganDir 'models'
$ffmpegPath = Join-Path $FfmpegDir 'bin\ffmpeg.exe'
$ffprobePath = Join-Path $FfmpegDir 'bin\ffprobe.exe'

Write-Step "Writing local .env paths"
Set-DotEnvValue $DotEnvPath 'PORT' '4000'
Set-DotEnvValue $DotEnvPath 'REAL_ESRGAN_BIN' $realExePath
Set-DotEnvValue $DotEnvPath 'REAL_ESRGAN_MODELS_DIR' $realModelsPath
Set-DotEnvValue $DotEnvPath 'FFMPEG_BIN' $ffmpegPath
Set-DotEnvValue $DotEnvPath 'FFPROBE_BIN' $ffprobePath
Set-DotEnvValue $DotEnvPath 'REAL_ESRGAN_MODEL' 'realesrgan-x4plus'
Set-DotEnvValue $DotEnvPath 'REAL_ESRGAN_SCALE' '4'
Set-DotEnvValue $DotEnvPath 'AI_DETAIL_BLEND' '0.30'
Set-DotEnvValue $DotEnvPath 'MAX_UPLOAD_MB' '1024'

Write-Step "Checking installed commands"
if (Test-Path $realExePath) {
  Write-Host "Real-ESRGAN found: $realExePath"
}

if (Test-Path (Join-Path $realModelsPath 'realesrgan-x4plus.param')) {
  Write-Host "Real-ESRGAN model found: $(Join-Path $realModelsPath 'realesrgan-x4plus.param')"
}

if (Test-Path $ffmpegPath) {
  & $ffmpegPath -version | Select-Object -First 1
}

if (Test-Path $ffprobePath) {
  & $ffprobePath -version | Select-Object -First 1
}

Write-Host ""
Write-Host "Done. Run npm run dev and open http://localhost:5173"
