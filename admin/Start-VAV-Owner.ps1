$ErrorActionPreference = 'Stop'
$env:VAV_ADMIN_DATA = Join-Path (Split-Path -Parent $PSScriptRoot) '.vav-admin'
Write-Host 'VAV Owner - http://127.0.0.1:14830'
Write-Host 'Laissez cette fenetre ouverte pour garder le panneau disponible.'
& node (Join-Path $PSScriptRoot 'server.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Le serveur ne peut pas demarrer. Node.js 24 est requis, et le port 14830 doit etre libre.' }
