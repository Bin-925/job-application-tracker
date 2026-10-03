param([string]$SecretsDirectory = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $SecretsDirectory) { $SecretsDirectory = Join-Path $root '.local/postgres' }
$SecretsDirectory = [IO.Path]::GetFullPath($SecretsDirectory)
$compose = Join-Path $root 'docker/postgres/compose.yaml'
$container = 'jobtracker-postgres'
$volume = 'jobtracker-postgres-data'
& docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop (Linux engine) before running this script.' }
$existing = & docker ps -a --filter "name=^/$container`$" --format '{{.Names}}|{{.Label "com.jobtracker.purpose"}}'
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Docker containers.' }
if ($existing -and $existing -ne "$container|development") { throw 'Container name belongs to a different project.' }
$existingVolume = & docker volume ls --filter "name=^$volume`$" --format '{{.Name}}|{{.Label "com.jobtracker.purpose"}}'
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Docker volumes.' }
if ($existingVolume -and $existingVolume -ne "$volume|development") { throw 'Volume name belongs to a different project.' }
$admin = Join-Path $SecretsDirectory 'admin-password'
$app = Join-Path $SecretsDirectory 'app-password'
if ($existingVolume -and (!(Test-Path -LiteralPath $admin) -or !(Test-Path -LiteralPath $app))) {
    throw 'Persistent data exists but its credentials are missing. Restore the original secret files; do not regenerate them.'
}
if (-not $existingVolume) {
    $null = New-Item -ItemType Directory -Path $SecretsDirectory -Force
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls $SecretsDirectory /inheritance:r /grant:r "${identity}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot secure the local credential directory.' }
    foreach ($path in @($admin, $app)) {
        if (-not (Test-Path -LiteralPath $path)) {
            $bytes = [byte[]]::new(32)
            $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
            try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
            [IO.File]::WriteAllText($path, ([BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()), [Text.UTF8Encoding]::new($false))
        }
    }
}
$previous = $env:JOBTRACKER_PG_SECRETS_DIR
try {
    $env:JOBTRACKER_PG_SECRETS_DIR = $SecretsDirectory.Replace('\', '/')
    & docker compose -f $compose up -d --wait --wait-timeout 90
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed. Existing data and credentials were retained.' }
    $role = & docker exec $container psql -U jobtracker_admin -d jobtracker -tAc "SELECT rolname || ':' || rolsuper || ':' || rolcreatedb || ':' || rolcreaterole FROM pg_roles WHERE rolname = 'jobtracker'"
    if ($LASTEXITCODE -ne 0 -or ($role.Trim() -ne 'jobtracker:false:false:false')) {
        throw 'Application role is missing or has unexpected privileges. Inspect the database without deleting the volume.'
    }
} finally { $env:JOBTRACKER_PG_SECRETS_DIR = $previous }
Write-Output 'PostgreSQL: 127.0.0.1:5433 / database=jobtracker / application user=jobtracker'
Write-Output 'Persistent volume: jobtracker-postgres-data (never use down -v for normal shutdown).'
