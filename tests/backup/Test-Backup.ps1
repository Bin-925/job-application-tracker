#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $root 'scripts/backup/Common.ps1')
Assert-LocalBackupDocker
$source = 'jobtracker-backup-fixture-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$output = Join-Path $root ('.local/backup-tests/' + [Guid]::NewGuid().ToString('N'))
$created = $false
function Expect-Rejection([scriptblock]$Action, [string]$Name) {
    $rejected = $false
    try { $null = & $Action } catch { $rejected = $true }
    if (-not $rejected) { throw "Expected rejection: $Name" }
    Write-Output "PASS: $Name"
}
try {
    $null = Invoke-BackupDocker @('run', '-d', '--name', $source, '--label', 'com.jobtracker.purpose=backup-fixture',
        '--network', 'none', '--memory', '768m', '--cpus', '1', '--tmpfs', '/var/lib/postgresql/data:size=536870912',
        '-e', 'POSTGRES_USER=jobtracker_admin', '-e', 'POSTGRES_DB=jobtracker',
        '-e', ('POSTGRES_PASSWORD=' + [Guid]::NewGuid().ToString('N')), 'postgres:17-alpine')
    $created = $true
    $ready = $false
    for ($i=0; $i -lt 45; $i++) {
        try {
            $null = Invoke-BackupDocker @('exec',$source,'pg_isready','-h','127.0.0.1','-U','jobtracker_admin','-d','jobtracker') -TimeoutSeconds 5
            $ready = $true; break
        } catch { Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { throw 'Fixture startup failed' }
    # Direct SQL fixture setup, not a forged Flyway migration history.
    $sqlFiles = @(Get-ChildItem (Join-Path $root 'backend/src/main/resources/db/migration/postgresql/*.sql') | Sort-Object Name | Select-Object -ExpandProperty FullName)
    $sqlFiles += Join-Path $PSScriptRoot 'fixture.sql'
    foreach ($sql in $sqlFiles) {
        $null = Invoke-BackupDocker @('cp',$sql,"${source}:/tmp/fixture.sql")
        $null = Invoke-BackupDocker @('exec',$source,'psql','-U','jobtracker_admin','-d','jobtracker','-v','ON_ERROR_STOP=1','-f','/tmp/fixture.sql')
    }
    $digests = @{}
    foreach ($table in @('member','application','schedule_event')) {
        $query = "SELECT md5(coalesce(string_agg(row_to_json(t)::text,E'\n' ORDER BY id),'')) FROM $table t"
        $digests[$table] = Invoke-BackupDocker @('exec',$source,'psql','-U','jobtracker_admin','-d','jobtracker','-X','-qAt','-c',$query)
    }
    $backup = & (Join-Path $root 'scripts/Backup-Postgres.ps1') -SourceContainer $source -OutputDirectory $output
    $receipt = Get-Content -LiteralPath "$backup.restore.json" -Raw | ConvertFrom-Json
    if ($receipt.checks.members -ne 1 -or $receipt.checks.applications -ne 1 -or $receipt.checks.schedules -ne 1 -or
        $receipt.checks.sessions -ne 0 -or $receipt.checks.sessionAttributes -ne 0 -or
        $receipt.checks.memberDigest -ne $digests.member -or $receipt.checks.applicationDigest -ne $digests.application -or
        $receipt.checks.scheduleDigest -ne $digests.schedule_event) { throw 'Restored records differ from the fixed source fixture.' }
    $sourceSessions = Invoke-BackupDocker @('exec',$source,'psql','-U','jobtracker_admin','-d','jobtracker','-X','-qAt','-c','SELECT count(*) FROM spring_session')
    if ($sourceSessions -ne '1') { throw 'Backup changed original sessions' }
    Write-Output 'PASS: Unicode/memo/date/version/ownership data digests, sequences and constraints, excluded sessions, unchanged source'
    $corrupt = Join-Path $output 'corrupt.dump'
    Copy-Item -LiteralPath $backup -Destination $corrupt
    Copy-Item -LiteralPath "$backup.backup.json" -Destination "$corrupt.backup.json"
    $stream = [IO.File]::OpenWrite($corrupt)
    try { $stream.WriteByte(0) } finally { $stream.Dispose() }
    Expect-Rejection { & (Join-Path $root 'scripts/Verify-PostgresBackup.ps1') -BackupPath $corrupt } 'corrupted dump'
    Expect-Rejection { & (Join-Path $root 'scripts/Verify-PostgresBackup.ps1') -BackupPath (Join-Path $output 'missing.dump') } 'missing manifest'
    $withSessions = Join-Path $output 'sessions.dump'
    $null = Invoke-BackupDocker @('exec',$source,'pg_dump','-U','jobtracker_admin','-d','jobtracker','-Fc','-f','/tmp/sessions.dump')
    $null = Invoke-BackupDocker @('cp',"${source}:/tmp/sessions.dump",$withSessions)
    $metadata = Get-Content -LiteralPath "$backup.backup.json" -Raw | ConvertFrom-Json
    $metadata.bytes = (Get-Item $withSessions).Length
    $metadata.sha256 = (Get-FileHash $withSessions -Algorithm SHA256).Hash
    $metadata | ConvertTo-Json | Set-Content -LiteralPath "$withSessions.backup.json" -Encoding utf8
    Expect-Rejection { & (Join-Path $root 'scripts/Verify-PostgresBackup.ps1') -BackupPath $withSessions } 'session-containing dump even with matching checksum'
    if (Test-Path -LiteralPath "$withSessions.restore.json") { throw 'Rejected backup has a false success receipt' }
    Expect-Rejection { & (Join-Path $root 'scripts/Backup-Postgres.ps1') -SourceContainer $source -OutputDirectory $root } 'project root cannot become a protected backup directory'
    $null = Invoke-BackupDocker @('exec',$source,'psql','-U','jobtracker_admin','-d','jobtracker','-X','-qAt','-c',"SELECT setval(pg_get_serial_sequence('application','id'),1,false)")
    Expect-Rejection { & (Join-Path $root 'scripts/Backup-Postgres.ps1') -SourceContainer $source -OutputDirectory $output } 'identity sequence behind restored rows'
} finally {
    if ($created) { $null = Invoke-BackupDocker @('rm','-f',$source) }
}
