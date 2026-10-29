$ErrorActionPreference='Stop'
$paintExecutable=Join-Path $PSScriptRoot 'node_modules/electron/dist/electron.exe'
if(-not(Test-Path -LiteralPath $paintExecutable)){throw 'Install the pinned host dependencies and run node node_modules/electron/install.js first.'}
Start-Process -FilePath $paintExecutable -ArgumentList ('"'+$PSScriptRoot+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
