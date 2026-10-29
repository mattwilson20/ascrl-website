$ErrorActionPreference='Stop'
$paintPackage=Get-Item -LiteralPath (Join-Path $PSScriptRoot 'node_modules/electron') -Force
# Launch the same physical executable named in Windows' existing app rule.
# pnpm's junction path can otherwise identify the process differently.
$paintPackagePath=$paintPackage.FullName
if($paintPackage.LinkType -and $paintPackage.Target){
  $paintPackagePath=@($paintPackage.Target)[0]
  if(-not [IO.Path]::IsPathRooted($paintPackagePath)){$paintPackagePath=Join-Path $paintPackage.Parent.FullName $paintPackagePath}
}
$paintExecutable=Join-Path $paintPackagePath 'dist/electron.exe'
if(-not(Test-Path -LiteralPath $paintExecutable)){throw 'Install the pinned host dependencies and run node node_modules/electron/install.js first.'}
Start-Process -FilePath $paintExecutable -ArgumentList ('"'+$PSScriptRoot+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
