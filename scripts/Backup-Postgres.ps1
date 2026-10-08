#Requires -Version 7.0
param(
    [string]$OutputDirectory = '',
    [ValidatePattern('^jobtracker-(postgres|backup-fixture-[a-f0-9]{12})$')]
    [string]$SourceContainer = 'jobtracker-postgres'
)
. (Join-Path $PSScriptRoot 'backup/Common.ps1')
Assert-LocalBackupDocker
$expectedPurpose = if ($SourceContainer -eq 'jobtracker-postgres') { 'development' } else { 'backup-fixture' }
$state = Invoke-BackupDocker @('inspect', $SourceContainer, '--format', '{{.State.Running}}|{{index .Config.Labels "com.jobtracker.purpose"}}')
if ($state -ne "true|$expectedPurpose") { throw 'Source is not the running, owned local development/fixture container.' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) '.local/backups' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$repoRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$separator = [IO.Path]::DirectorySeparatorChar
$parentPrefix = $OutputDirectory.TrimEnd($separator) + $separator
if ($OutputDirectory -eq [IO.Path]::GetPathRoot($OutputDirectory) -or
    $repoRoot -eq $OutputDirectory -or $repoRoot.StartsWith($parentPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    (Test-Path -LiteralPath (Join-Path $OutputDirectory '.git'))) {
    throw 'Use a dedicated backup directory, not a filesystem/project root or its parent.'
}
$null = New-Item -ItemType Directory -Path $OutputDirectory -Force
Protect-BackupPath $OutputDirectory
$id = [Guid]::NewGuid().ToString('N')
$file = Join-Path $OutputDirectory ("jobtracker-" + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + "-$id.dump")
$remote = "/tmp/jobtracker-backup-$id.dump"
try {
    $null = Invoke-BackupDocker @('exec', $SourceContainer, 'timeout', '120', 'pg_dump',
        '-U', 'jobtracker_admin', '-d', 'jobtracker', '--format=custom', '--no-owner', '--no-privileges',
        '--lock-wait-timeout=5s', '--exclude-table-data=public.spring_session',
        '--exclude-table-data=public.spring_session_attributes',
        '--exclude-table-data=public.recovery_email_verification',
        '--exclude-table-data=public.password_reset_token',
        '--exclude-table-data=public.registration_token',
        '--exclude-table-data=public.google_reauthentication', '--file', $remote)
    $null = Invoke-BackupDocker @('cp', "${SourceContainer}:$remote", "$file.partial")
    Protect-BackupPath "$file.partial"
    Move-Item -LiteralPath "$file.partial" -Destination $file
    $manifest = [ordered]@{
        format = 1; createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        database = 'jobtracker'; sourceContainer = $SourceContainer; sessionsExcluded = $true
        bytes = (Get-Item -LiteralPath $file).Length
        sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
        dumpVersion = Invoke-BackupDocker @('exec', $SourceContainer, 'pg_dump', '--version')
    }
    $manifest | ConvertTo-Json | Set-Content -LiteralPath "$file.backup.json" -Encoding utf8
    Protect-BackupPath "$file.backup.json"
    $null = & (Join-Path $PSScriptRoot 'Verify-PostgresBackup.ps1') -BackupPath $file
    Write-Output $file
} finally {
    $null = Invoke-BackupDocker @('exec', $SourceContainer, 'rm', '-f', $remote)
    if (Test-Path -LiteralPath "$file.partial") { Remove-Item -LiteralPath "$file.partial" }
}
