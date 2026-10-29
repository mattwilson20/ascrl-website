param(
 [string]$StudioDirectory=(Join-Path $PSScriptRoot '..\..\..\livery-studio'),
 [string]$ElectronDirectory=(Join-Path $PSScriptRoot '..\paint-host\node_modules\.pnpm\electron@45.1.0\node_modules\electron\dist')
)
$ErrorActionPreference='Stop'
$paintSource=(Resolve-Path -LiteralPath $StudioDirectory).Path
$paintElectron=(Resolve-Path -LiteralPath $ElectronDirectory).Path
$paintInstall=Join-Path $env:LOCALAPPDATA 'Programs\ASCRL Paint Studio\0.2.0'
$paintRuntime=Join-Path $env:LOCALAPPDATA 'ASCRL Paint Studio'
$paintPrevious=Join-Path $env:LOCALAPPDATA 'ASCRL Paint Host'
if(Test-Path -LiteralPath $paintInstall){throw 'This version is already installed. Preserve it and increment the version for the next install.'}
if(Get-NetTCPConnection -State Listen -LocalPort 4197 -ErrorAction SilentlyContinue){throw 'Stop the old host before installing, so its projects can be copied consistently.'}
$paintExpected=@{
 'camaro'='1311768fa582beb558302124ad8ac8e2d9dd16145e7c986095f5980575e772d3'
 'mustang'='0055b27f95d343f299cbfaf538be65adac6523c215e010a8ed5c0804095cc324'
 'camry'='eb5498f330f739504fa3e57f310edb9df4a380aa9f081d561a952b5ff85f169e'
}
foreach($paintCar in $paintExpected.Keys){
 $paintHash=(Get-FileHash -LiteralPath (Join-Path $paintSource "dist\assets\mapped\$paintCar.glb") -Algorithm SHA256).Hash.ToLower()
 if($paintHash -ne $paintExpected[$paintCar]){throw "The verified $paintCar model changed. Installation stopped before copying."}
}
New-Item -ItemType Directory -Path $paintInstall -Force | Out-Null
Get-ChildItem -LiteralPath $paintElectron | Copy-Item -Destination $paintInstall -Recurse
$paintApp=Join-Path $paintInstall 'resources\app'
New-Item -ItemType Directory -Path $paintApp -Force | Out-Null
foreach($paintFile in @('main.cjs','preload.cjs','server.cjs','desktop-hook.mjs','package.json','README.txt')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $paintFile) -Destination $paintApp}
Copy-Item -LiteralPath (Join-Path $paintSource 'dist') -Destination (Join-Path $paintApp 'site') -Recurse
# Performance preference is applied to the desktop copy; the original editor is untouched.
$paintViewer=Join-Path $paintApp 'site\viewer.js'
$paintViewerSource=[IO.File]::ReadAllText($paintViewer)
$paintOld='new THREE.WebGLRenderer({antialias:true,alpha:true})'
if(-not $paintViewerSource.Contains($paintOld)){throw 'Renderer initialization changed; review before applying the GPU preference.'}
[IO.File]::WriteAllText($paintViewer,$paintViewerSource.Replace($paintOld,'new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"high-performance"})'))
$paintExe=Join-Path $paintInstall 'ASCRL Paint Studio.exe'
Rename-Item -LiteralPath (Join-Path $paintInstall 'electron.exe') -NewName 'ASCRL Paint Studio.exe'
if(Test-Path -LiteralPath (Join-Path $paintInstall 'electron_wer.dll')){Rename-Item -LiteralPath (Join-Path $paintInstall 'electron_wer.dll') -NewName 'ASCRL Paint Studio_wer.dll'}
New-Item -ItemType Directory -Path $paintRuntime -Force | Out-Null
$paintPartition=Join-Path $paintRuntime 'browser-profile\Partitions\private-paint-editor'
if(Test-Path -LiteralPath $paintPartition){throw 'A desktop workspace already exists. It was not overwritten.'}
New-Item -ItemType Directory -Path (Split-Path $paintPartition) -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $paintPrevious 'browser-profile\Partitions\private-paint-editor') -Destination $paintPartition -Recurse
Copy-Item -LiteralPath (Join-Path $paintPrevious 'artwork') -Destination (Join-Path $paintRuntime 'imported-host-artwork') -Recurse
foreach($paintCar in $paintExpected.Keys){
 $paintHash=(Get-FileHash -LiteralPath (Join-Path $paintApp "site\assets\mapped\$paintCar.glb") -Algorithm SHA256).Hash.ToLower()
 if($paintHash -ne $paintExpected[$paintCar]){throw "The packaged $paintCar model did not verify."}
}
$paintManifest=@{version='0.2.0';installedAt=(Get-Date).ToString('o');installDirectory=$paintInstall;importedFrom=$paintPrevious;models=$paintExpected}
$paintManifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $paintRuntime 'installation.json') -Encoding utf8
# Windows graphics preference for this executable only; preserve other app settings.
$paintGpuKey='HKCU:\Software\Microsoft\DirectX\UserGpuPreferences'
New-Item -Path $paintGpuKey -Force | Out-Null
New-ItemProperty -Path $paintGpuKey -Name $paintExe -Value 'GpuPreference=2;' -PropertyType String -Force | Out-Null
$paintShell=New-Object -ComObject WScript.Shell
foreach($paintShortcutPath in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'ASCRL Paint Studio.lnk'),(Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\ASCRL Paint Studio.lnk'))){
 $paintShortcut=$paintShell.CreateShortcut($paintShortcutPath);$paintShortcut.TargetPath=$paintExe;$paintShortcut.WorkingDirectory=$paintInstall;$paintShortcut.Description='Standalone NASCAR paint editor — local GPU rendering';$paintShortcut.Save()
}
Write-Output "Installed: $paintExe"
Write-Output "Workspaces: $paintRuntime"
