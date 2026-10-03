param(
    [ValidateSet('smoke', 'load', 'spike', 'soak', 'volume', 'conflict', 'contract', 'limits')]
    [string[]]$Profiles = @('smoke', 'contract', 'limits', 'load', 'spike', 'soak', 'volume', 'conflict'),
    [ValidateRange(18134, 18144)][int]$Port = 18134,
    [string]$JavaPath = $(if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { 'java' }),
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $root 'backend'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$output = Join-Path $root ".local/load-results/$stamp"
$null = New-Item -ItemType Directory -Path $output -Force
$k6 = (Get-Command k6 -ErrorAction Stop).Source
$java = (Get-Command $JavaPath -ErrorAction Stop).Source
$compose = Join-Path $root 'tests/load/compose.yaml'
$container = 'jobtracker-load-postgres'
$previousPassword = $env:LOAD_DB_PASSWORD

if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port is already occupied. No existing process will be stopped."
}
if (-not $SkipBuild) {
    Push-Location $backend
    try {
        & .\gradlew.bat bootJar *> (Join-Path $output 'build.log')
        if ($LASTEXITCODE -ne 0) { throw 'bootJar failed; see build.log' }
    } finally { Pop-Location }
}
$jar = Join-Path $backend 'build/libs/jobtracker-0.0.1-SNAPSHOT.jar'
if (-not (Test-Path -LiteralPath $jar)) { throw 'Build the backend bootJar first.' }
$revision = & git -C $root rev-parse HEAD
@{
    startedAt = (Get-Date).ToUniversalTime().ToString('o'); revision = $revision
    k6 = (& $k6 version | Out-String).Trim(); java = (& $java -version 2>&1 | Out-String).Trim()
    processors = [Environment]::ProcessorCount; os = [Environment]::OSVersion.VersionString
    profiles = $Profiles; database = 'PostgreSQL 17 Docker, ephemeral tmpfs, 1 CPU / 768 MiB'
    heapMaxMiB = 512; hikariMaxConnections = 10; tomcatMaxThreads = 50; port = $Port
    jarSha256 = (Get-FileHash -LiteralPath $jar -Algorithm SHA256).Hash
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'environment.json') -Encoding UTF8

$existing = & docker ps -a --filter "name=^/$container`$" --format '{{.Names}}|{{.Label "com.jobtracker.purpose"}}'
if ($LASTEXITCODE -ne 0) { throw 'Docker engine is unavailable.' }
if ($existing -and $existing -ne "$container|load-test") { throw 'Container name belongs to another workload.' }
if (Get-NetTCPConnection -LocalPort 15434 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Database port 15434 is occupied. Stop the dedicated test container yourself before retrying.'
}
$env:LOAD_DB_PASSWORD = [Guid]::NewGuid().ToString('N')
$containerStarted = $false
$results = @()
try {
    $containerStarted = $true
    & docker compose -f $compose up -d --force-recreate --wait *> (Join-Path $output 'docker.log')
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL container startup failed; see docker.log.' }
foreach ($profile in $Profiles) {
    $server = $null
    $load = $null
    $samples = @()
    try {
        if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
            throw "Port $Port became occupied; refusing to send traffic."
        }
        $database = 'load_' + $profile + '_' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
        & docker exec $container createdb -U jobtracker_load $database
        if ($LASTEXITCODE -ne 0) { throw 'Cannot create isolated scenario database.' }
        $serverArgs = @('-Xms128m', '-Xmx512m', '-jar', "`"$jar`"", '--spring.profiles.active=postgres',
            '--spring.config.import=', "--server.port=$Port", '--server.address=127.0.0.1',
            "--spring.datasource.url=jdbc:postgresql://127.0.0.1:15434/$database",
            '--spring.datasource.username=jobtracker_load', "--spring.datasource.password=$env:LOAD_DB_PASSWORD",
            '--spring.datasource.driver-class-name=org.postgresql.Driver', '--spring.datasource.hikari.maximum-pool-size=10',
            '--spring.jpa.hibernate.ddl-auto=validate', '--spring.jpa.show-sql=false',
            '--spring.flyway.enabled=true', '--spring.session.jdbc.initialize-schema=never',
            '--server.tomcat.threads.max=50',
            '--logging.level.root=WARN', '--app.rate-limit.enabled=true')
        if ($profile -ne 'limits') {
            # A single load generator IP must provision independent synthetic users.
            # The limits profile runs a fresh server with the actual production defaults.
            foreach ($setting in @('global-requests-per-minute', 'requests-per-ip-per-minute',
                'csrf-requests-per-ip-per-minute', 'registrations-per-ip', 'attempts-per-account')) {
                $serverArgs += "--app.rate-limit.$setting=100000"
            }
        }
        $server = Start-Process -FilePath $java -ArgumentList $serverArgs -WorkingDirectory $backend `
            -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output "$profile-server.log") `
            -RedirectStandardError (Join-Path $output "$profile-server-error.log")
        $ready = $false
        for ($i = 0; $i -lt 90; $i++) {
            if ($server.HasExited) { throw "Test server exited; see $profile-server*.log" }
            try {
                $response = Invoke-WebRequest "http://127.0.0.1:$Port/api/v1/members/csrf" -UseBasicParsing -TimeoutSec 2
                if ($response.StatusCode -eq 200) { $ready = $true; break }
            } catch { Start-Sleep -Milliseconds 500 }
        }
        if (-not $ready) { throw 'Test server readiness timed out.' }
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen
        if ($listener.OwningProcess -ne $server.Id) { throw 'Listener ownership mismatch; refusing traffic.' }
        Write-Host "Running $profile on isolated PostgreSQL at port $Port"
        $args = @('run', '--quiet', '-e', "PROFILE=$profile", '-e', 'K6_LOCAL_ISOLATED=ephemeral-postgres',
            '-e', "BASE_URL=http://127.0.0.1:$Port", '-e', "`"RESULT_FILE=$output/$profile.json`"",
            "`"$root/tests/load/tracker.js`"")
        $load = Start-Process -FilePath $k6 -ArgumentList $args -WorkingDirectory $root -WindowStyle Hidden `
            -PassThru -RedirectStandardOutput (Join-Path $output "$profile-k6.log") `
            -RedirectStandardError (Join-Path $output "$profile-k6-error.log")
        $timer = [Diagnostics.Stopwatch]::StartNew()
        while (-not $load.WaitForExit(500)) {
            if ($timer.Elapsed.TotalSeconds -gt 360) { throw "Safety timeout for $profile" }
            if ($server.HasExited) { throw 'Server exited during load.' }
            $server.Refresh()
            $samples += @{ seconds = [math]::Round($timer.Elapsed.TotalSeconds, 2)
                cpuSeconds = $server.TotalProcessorTime.TotalSeconds; workingSetBytes = $server.WorkingSet64 }
        }
        $load.WaitForExit()
        $exitCode = $load.ExitCode
        $summaryPath = Join-Path $output "$profile.json"
        if (-not (Test-Path -LiteralPath $summaryPath)) { $exitCode = -1 }
        $results += @{ profile = $profile; exitCode = $exitCode; seconds = $timer.Elapsed.TotalSeconds }
        Write-Host "$profile exit=$exitCode"
    } finally {
        if ($load -and -not $load.HasExited) { Stop-Process -Id $load.Id -Force }
        if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force; $server.WaitForExit() }
        $samples | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $output "$profile-resources.json") -Encoding UTF8
    }
}
} finally {
    $stopExit = 0
    try {
        if ($containerStarted) {
            & docker compose -f $compose stop *> (Join-Path $output 'docker-stop.log')
            $stopExit = $LASTEXITCODE
        }
    } finally {
        $env:LOAD_DB_PASSWORD = $previousPassword
        $results | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'results.json') -Encoding UTF8
    }
    if ($stopExit -ne 0) { throw "Failed to stop $container. Inspect docker-stop.log and stop the dedicated container." }
}
Write-Host "Results: $output"
if ($results | Where-Object { $_.exitCode -ne 0 }) { throw 'One or more profiles failed; inspect the saved results.' }
