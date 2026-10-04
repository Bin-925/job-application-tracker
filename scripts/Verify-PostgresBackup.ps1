#Requires -Version 7.0
param([Parameter(Mandatory)][string]$BackupPath)
. (Join-Path $PSScriptRoot 'backup/Common.ps1')
$BackupPath = [IO.Path]::GetFullPath($BackupPath)
$manifest = Assert-BackupManifest $BackupPath
Assert-LocalBackupDocker
$container = 'jobtracker-restore-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$password = [Guid]::NewGuid().ToString('N')
$created = $false
try {
    $null = Invoke-BackupDocker @('run', '-d', '--name', $container, '--label', 'com.jobtracker.purpose=restore-check',
        '--network', 'none', '--memory', '768m', '--cpus', '1', '--pids-limit', '256',
        '--tmpfs', '/var/lib/postgresql/data:size=536870912',
        '-e', 'POSTGRES_USER=jobtracker_admin', '-e', "POSTGRES_PASSWORD=$password", '-e', 'POSTGRES_DB=jobtracker_restore',
        'postgres:17-alpine')
    $created = $true
    $ready = $false
    for ($i = 0; $i -lt 45; $i++) {
        try {
            $null = Invoke-BackupDocker @('exec', $container, 'pg_isready', '-h', '127.0.0.1', '-U', 'jobtracker_admin', '-d', 'jobtracker_restore') -TimeoutSeconds 5
            $ready = $true; break
        } catch { Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { throw 'Isolated PostgreSQL readiness timed out.' }
    $null = Invoke-BackupDocker @('cp', $BackupPath, "${container}:/tmp/backup.dump")
    # No target URL/host parameter is accepted: a restore can only touch this new container.
    $null = Invoke-BackupDocker @('exec', $container, 'timeout', '120', 'pg_restore', '-U', 'jobtracker_admin',
        '-d', 'jobtracker_restore', '--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction', '/tmp/backup.dump')
    $sql = Join-Path $PSScriptRoot 'backup/verify.sql'
    $null = Invoke-BackupDocker @('cp', $sql, "${container}:/tmp/verify.sql")
    $json = Invoke-BackupDocker @('exec', $container, 'timeout', '30', 'psql', '-U', 'jobtracker_admin',
        '-d', 'jobtracker_restore', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/verify.sql')
    $details = $json | ConvertFrom-Json
    $receipt = [ordered]@{
        verifiedAtUtc = (Get-Date).ToUniversalTime().ToString('o'); sha256 = $manifest.sha256
        postgres = Invoke-BackupDocker @('exec', $container, 'postgres', '--version')
        checks = $details
    }
} finally {
    if ($created) { $null = Invoke-BackupDocker @('rm', '-f', $container) }
}
# Publish success only after validation and temporary-container cleanup both succeed.
$receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath "$BackupPath.restore.json" -Encoding utf8
Protect-BackupPath "$BackupPath.restore.json"
Write-Output $receipt
