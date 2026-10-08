# Requires PowerShell 7, JDK 21, pnpm and npm. Sends package coordinates only to advisory services.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$output = Join-Path $root ('.local/security-audit/' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$null = New-Item -ItemType Directory -Path $output -Force
$findingCount = 0
foreach ($scope in @('frontend', '.github')) {
    Push-Location (Join-Path $root $scope)
    try {
        $path = Join-Path $output ($scope.TrimStart('.') + '.json')
        if ($scope -eq 'frontend') { & pnpm audit --json > $path }
        else { & npm audit --json > $path }
        $exit = $LASTEXITCODE
        $report = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        if ($exit -notin @(0, 1) -or -not $report.metadata.vulnerabilities) { throw "$scope audit did not return a valid report." }
        $counts = $report.metadata.vulnerabilities
        $count = [int]$counts.low + [int]$counts.moderate + [int]$counts.high + [int]$counts.critical
        $findingCount += $count
        Write-Output "$scope advisory counts: $($counts | ConvertTo-Json -Compress)"
    } finally { Pop-Location }
}
Push-Location (Join-Path $root 'backend')
try {
    $manifest = Join-Path $output 'runtime-dependencies.json'
    $wrapper = if ($IsWindows) { './gradlew.bat' } else { './gradlew' }
    & $wrapper securityDependencyManifest --init-script (Join-Path $root 'tests/security/dependencies.init.gradle') "-Dsecurity.manifest=$manifest" --console=plain *> (Join-Path $output 'resolution.log')
    if ($LASTEXITCODE -ne 0) { throw 'Runtime dependency resolution failed; see resolution.log.' }
    $dependencies = @(Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json)
    if ($dependencies.Count -eq 0) { throw 'Empty runtime dependency manifest.' }
    $queries = @($dependencies | ForEach-Object { @{ package = @{ ecosystem = 'Maven'; name = "$($_.group):$($_.name)" }; version = $_.version } })
    $response = Invoke-RestMethod -Uri 'https://api.osv.dev/v1/querybatch' -Method Post -ContentType 'application/json' -Body (@{ queries = $queries } | ConvertTo-Json -Depth 5) -TimeoutSec 90
    if (@($response.results).Count -ne $dependencies.Count) { throw 'Incomplete OSV response; audit is inconclusive.' }
    $findings = @()
    for ($i = 0; $i -lt $dependencies.Count; $i++) {
        foreach ($vulnerability in $response.results[$i].vulns) {
            $details = Invoke-RestMethod -Uri "https://api.osv.dev/v1/vulns/$($vulnerability.id)" -TimeoutSec 30
            $findings += @{ dependency = $dependencies[$i]; advisory = $details }
        }
    }
    @{ checkedAt = (Get-Date).ToUniversalTime().ToString('o'); dependencyCount = $dependencies.Count; findings = $findings } | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $output 'backend.json') -Encoding UTF8
    $findingCount += $findings.Count
    Write-Output "Backend: $($dependencies.Count) runtime dependencies, $($findings.Count) advisory matches."
} finally { Pop-Location }
Write-Output "Audit reports: $output"
# Do not suppress unused-feature advisories; their applicability is documented separately.
if ($findingCount -gt 0) { throw "$findingCount advisory matches require review. A match is not proof of exploitability." }
