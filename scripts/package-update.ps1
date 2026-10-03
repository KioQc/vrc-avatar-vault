param([Parameter(Mandatory=$true)][string]$NotesFile)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $projectRoot 'package.json') | ConvertFrom-Json
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $projectRoot 'src-tauri/tauri.conf.json') | ConvertFrom-Json
$version = $package.version
if ($version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$' -or $config.version -ne $version) { throw 'Application versions do not match. Run release:version first.' }
$portable = Join-Path $projectRoot 'src-tauri/target/release/vrc-avatar-vault.exe'
$installer = Join-Path $projectRoot "src-tauri/target/release/bundle/nsis/VRC Avatar Vault_${version}_x64-setup.exe"
foreach ($binary in @($portable, $installer)) {
  $info = (Get-Item -LiteralPath $binary).VersionInfo
  if ($info.ProductVersion -ne $version) { throw "Binary version does not match $version : $binary" }
}
$signaturePath = "$installer.sig"
if (-not (Test-Path -LiteralPath $signaturePath)) { throw 'Missing signed installer. Build a signed bundle first.' }
$signature = [IO.File]::ReadAllText($signaturePath).Trim()
$notes = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $NotesFile).Path)
if ([string]::IsNullOrWhiteSpace($notes) -or $notes.Length -gt 12000) { throw 'Release notes must contain 1–12000 characters.' }
$releaseDir = Join-Path $projectRoot 'release'
[IO.Directory]::CreateDirectory($releaseDir) | Out-Null
$name = "VRC-Avatar-Vault-$version-Setup.exe"
$destination = Join-Path $releaseDir $name
Copy-Item -LiteralPath $installer -Destination $destination -Force
Copy-Item -LiteralPath $portable -Destination (Join-Path $releaseDir "VRC-Avatar-Vault-$version.exe") -Force
Copy-Item -LiteralPath $portable -Destination (Join-Path $releaseDir 'VRC-Avatar-Vault.exe') -Force
$manifest = [ordered]@{ product='local.vrc-avatar-vault.app'; version=$version; installer=$name; sha256=(Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant(); size=(Get-Item -LiteralPath $destination).Length; notes=$notes.Trim(); signature=$signature }
Copy-Item -LiteralPath $signaturePath -Destination ($destination + '.sig') -Force
$manifestPath = Join-Path $releaseDir 'latest.vault-update.json'
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
$zip = Join-Path $releaseDir "VRC-Avatar-Vault-$version-Update.zip"
Compress-Archive -LiteralPath @($destination, $manifestPath) -DestinationPath $zip -Force
Write-Output "Update package ready: $zip"
Write-Output 'Extract both files into the folder selected in Settings > Application updates.'

& node (Join-Path $PSScriptRoot "update-manifest.mjs")
if ($LASTEXITCODE -ne 0) { throw "Online manifest generation failed" }
