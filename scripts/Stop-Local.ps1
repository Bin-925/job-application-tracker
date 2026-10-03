$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$file = Join-Path $root '.local/processes.json'
if (-not (Test-Path -LiteralPath $file)) { Write-Output 'No recorded local application processes.'; return }
$state = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
$owned = @()
foreach ($kind in @('backend', 'frontend')) {
    $processId = $state."${kind}Pid"
    $started = $state."${kind}StartedUtc"
    if (-not $processId -or -not $started) { throw 'Old process record has no ownership timestamp. Verify those processes manually.' }
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    if ($process.StartTime.ToUniversalTime() -ne ([datetime]$started).ToUniversalTime()) {
        throw "PID $processId has been reused. Refusing to stop an unrelated process."
    }
    $owned += $process
}
foreach ($process in $owned) { Stop-Process -InputObject $process }
Remove-Item -LiteralPath $file
Write-Output 'Local application stopped. PostgreSQL and its data volume were retained.'
