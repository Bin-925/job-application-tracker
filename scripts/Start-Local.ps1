param(
    [string]$JavaHome = $env:JAVA_HOME,
    [int]$BackendPort = 8080,
    [int]$FrontendPort = 5173,
    [ValidateSet('postgres', 'demo')][string]$Database = 'postgres',
    [string]$SecretsDirectory = '',
    [switch]$LocalMail
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$logs = Join-Path $root '.local'
$java = if ($JavaHome) { Join-Path $JavaHome 'bin/java.exe' } else { (Get-Command java).Source }
$node = (Get-Command node).Source
$jar = Join-Path $backend 'build/libs/jobtracker-0.0.1-SNAPSHOT.jar'
if (!(Test-Path -LiteralPath $jar)) { throw 'Run backend/gradlew.bat bootJar first.' }
if (!(Test-Path -LiteralPath (Join-Path $frontend 'node_modules/vite/bin/vite.js'))) { throw 'Install frontend dependencies with pnpm install --frozen-lockfile first.' }
foreach ($port in @($BackendPort, $FrontendPort)) {
    $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    try { $probe.Start() } catch { throw "Port $port is busy. Choose another port." } finally { $probe.Stop() }
}
New-Item -ItemType Directory -Path $logs -Force | Out-Null
if (-not $SecretsDirectory) { $SecretsDirectory = Join-Path $root '.local/postgres' }
if ($Database -eq 'postgres') { & (Join-Path $PSScriptRoot 'Start-Postgres.ps1') -SecretsDirectory $SecretsDirectory }
$names = @('API_PROXY_TARGET', 'APP_CORS_ALLOWED_ORIGINS', 'DB_PASSWORD', 'DB_USERNAME', 'DATABASE_URL')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$api = $null
$web = $null
try {
$env:API_PROXY_TARGET = "http://127.0.0.1:$BackendPort"
$env:APP_CORS_ALLOWED_ORIGINS = "http://127.0.0.1:$FrontendPort,http://localhost:$FrontendPort,http://127.0.0.1:4173"
if ($LocalMail) {
    & docker compose -f (Join-Path $root 'compose.mail.yaml') up -d
    if ($LASTEXITCODE -ne 0) { throw 'Local Mailpit startup failed; existing containers were retained.' }
}
$profile = if ($LocalMail) { "$Database,mail-local" } else { $Database }
if ($Database -eq 'postgres') {
    $env:DB_PASSWORD = [IO.File]::ReadAllText((Join-Path $SecretsDirectory 'app-password')).Trim()
    $env:DB_USERNAME = 'jobtracker'
    $env:DATABASE_URL = 'jdbc:postgresql://127.0.0.1:5433/jobtracker'
}
$apiArguments = @('-jar', ('"' + $jar + '"'), "--spring.profiles.active=$profile", '--spring.config.import=', "--server.port=$BackendPort", '--server.address=127.0.0.1')
if ($LocalMail) { $apiArguments += "--app.recovery-email.public-base-url=http://127.0.0.1:$FrontendPort" }
$api = Start-Process -FilePath $java -ArgumentList $apiArguments -WorkingDirectory $backend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'backend.log') -RedirectStandardError (Join-Path $logs 'backend-error.log')
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        if ($api.HasExited) { throw 'Backend exited. See .local/backend.log; existing DB data is retained.' }
        try {
            $response = Invoke-WebRequest "http://127.0.0.1:$BackendPort/api/v1/members/csrf" -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $ready) { throw 'Backend readiness timed out.' }
    # The frontend does not need database credentials in its child process environment.
    foreach ($name in @('DB_PASSWORD', 'DB_USERNAME', 'DATABASE_URL')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
    $web = Start-Process -FilePath $node -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', $FrontendPort, '--strictPort') -WorkingDirectory $frontend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'frontend.log') -RedirectStandardError (Join-Path $logs 'frontend-error.log')
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        if ($web.HasExited) { throw 'Frontend exited. See .local/frontend-error.log.' }
        try {
            $response = Invoke-WebRequest "http://127.0.0.1:$FrontendPort" -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $ready) { throw 'Frontend readiness timed out.' }
    @{ backendPid = $api.Id; frontendPid = $web.Id; backendPort = $BackendPort; frontendPort = $FrontendPort; database = $Database
        backendStartedUtc = $api.StartTime.ToUniversalTime().ToString('o')
        frontendStartedUtc = $web.StartTime.ToUniversalTime().ToString('o')
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logs 'processes.json')
} catch {
    foreach ($process in @($web, $api)) { if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id } }
    throw
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
Write-Output "Frontend: http://127.0.0.1:$FrontendPort"
if ($LocalMail) { Write-Output 'Local-only mailbox: http://127.0.0.1:8025 (messages are not delivered externally)' }
if ($Database -eq 'postgres') { Write-Output 'Database: PostgreSQL jobtracker (persistent local development data)' }
else { Write-Output "Demo H2 data: $backend/data" }
Write-Output "Process IDs: backend=$($api.Id), frontend=$($web.Id)"
