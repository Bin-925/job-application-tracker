param(
    [string]$JavaHome = $env:JAVA_HOME,
    [int]$BackendPort = 8080,
    [int]$FrontendPort = 5173
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
foreach ($port in @($BackendPort, $FrontendPort)) {
    $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    try { $probe.Start() } catch { throw "Port $port is busy. Choose another port." } finally { $probe.Stop() }
}
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$env:API_PROXY_TARGET = "http://127.0.0.1:$BackendPort"
$env:APP_CORS_ALLOWED_ORIGINS = "http://127.0.0.1:$FrontendPort,http://localhost:$FrontendPort,http://127.0.0.1:4173"
$api = Start-Process -FilePath $java -ArgumentList @('-jar', ('"' + $jar + '"'), '--spring.profiles.active=demo', "--server.port=$BackendPort") -WorkingDirectory $backend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'backend.log') -RedirectStandardError (Join-Path $logs 'backend-error.log')
try {
    $web = Start-Process -FilePath $node -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', $FrontendPort, '--strictPort') -WorkingDirectory $frontend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'frontend.log') -RedirectStandardError (Join-Path $logs 'frontend-error.log')
} catch { Stop-Process -Id $api.Id; throw }
@{ backendPid = $api.Id; frontendPid = $web.Id; backendPort = $BackendPort; frontendPort = $FrontendPort } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logs 'processes.json')
Write-Output "Frontend: http://127.0.0.1:$FrontendPort"
Write-Output "Local H2 data: $backend/data (not production)"
Write-Output "Process IDs: backend=$($api.Id), frontend=$($web.Id)"
