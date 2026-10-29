param([Parameter(Mandatory=$true)][string]$StudioDirectory,[Parameter(Mandatory=$true)][string]$EnvironmentFile)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$studioResolved=(Resolve-Path -LiteralPath $StudioDirectory).Path
if(-not(Test-Path -LiteralPath (Join-Path $studioResolved 'dist/assets/mapped/camaro.glb'))){throw 'The existing Camaro model was not found.'}
$paintRuntime=Join-Path $env:LOCALAPPDATA 'ASCRL Paint Host'
[IO.Directory]::CreateDirectory($paintRuntime) | Out-Null
$credentialPath=Join-Path $paintRuntime 'credential.bin'
if(Test-Path -LiteralPath $credentialPath){$bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($credentialPath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)}else{
 $random=New-Object byte[] 32
 $rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($random);$rng.Dispose()
 $secret=([BitConverter]::ToString($random)).Replace('-','').ToLowerInvariant()
 $bytes=[Text.Encoding]::UTF8.GetBytes($secret)
 [IO.File]::WriteAllBytes($credentialPath,[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
}
$hash=[Security.Cryptography.SHA256]::Create();$digest=([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace('-','').ToLowerInvariant();$hash.Dispose()
$settings=@{}
foreach($line in Get-Content -LiteralPath $EnvironmentFile){if($line -match '^([A-Z_]+)=(.*)$'){$settings[$matches[1]]=$matches[2].Trim('"',"'")}}
$config=@{studioDirectory=$studioResolved;supabaseUrl=$settings['NEXT_PUBLIC_SUPABASE_URL'];publishableKey=$settings['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']}
if(-not $config.supabaseUrl -or -not $config.publishableKey){throw 'Public backend configuration is missing.'}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'host-config.json'),($config|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$runtimePath=Join-Path $PSScriptRoot '.runtime';[IO.Directory]::CreateDirectory($runtimePath)|Out-Null
$sql="insert into rc_paint_private.host_credentials(user_id,token_hash,expires_at) values('2a20a12e-3786-481d-a77d-72d281290948',decode('$digest','hex'),now()+interval '90 days') on conflict(user_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at;"
[IO.File]::WriteAllText((Join-Path $runtimePath 'register-host.sql'),$sql,[Text.UTF8Encoding]::new($false))
Write-Output 'Host configuration created. Credential is protected by Windows DPAPI; only its hash is included in registration SQL.'
