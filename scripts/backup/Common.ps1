#Requires -Version 7.0
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-BackupDocker {
    [CmdletBinding(PositionalBinding = $false)]
    param([Parameter(ValueFromRemainingArguments)][string[]]$Arguments, [int]$TimeoutSeconds = 180)
    $info = [Diagnostics.ProcessStartInfo]::new('docker')
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::Start($info)
    $output = $process.StandardOutput.ReadToEndAsync()
    $errorOutput = $process.StandardError.ReadToEndAsync()
    try {
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $process.Kill($true)
            throw 'Docker operation timed out. No successful backup/restore was recorded.'
        }
        if ($process.ExitCode -ne 0) {
            # pg_restore errors may contain private row values. Do not print raw stderr.
            $failure = [InvalidOperationException]::new("Docker $($Arguments[0]) failed (exit $($process.ExitCode)); no private command output was printed.")
            $failure.Data['DockerDiagnostic'] = $errorOutput.GetAwaiter().GetResult()
            throw $failure
        }
        return $output.GetAwaiter().GetResult().Trim()
    } finally { $process.Dispose() }
}

function Assert-LocalBackupDocker {
    if ($env:DOCKER_HOST -and $env:DOCKER_HOST -notmatch '^(unix|npipe)://') {
        throw 'Only a local Docker engine is allowed.'
    }
    $endpoint = Invoke-BackupDocker @('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}')
    if ($endpoint -notmatch '^(unix|npipe)://') { throw 'Remote Docker contexts are not allowed.' }
    $null = Invoke-BackupDocker @('info', '--format', '{{.ServerVersion}}')
}

function Protect-BackupPath([string]$Path) {
    if ($IsWindows) {
        $directory = Test-Path -LiteralPath $Path -PathType Container
        $acl = if ($directory) { [Security.AccessControl.DirectorySecurity]::new() } else { [Security.AccessControl.FileSecurity]::new() }
        $acl.SetAccessRuleProtection($true, $false)
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $inheritance = if ($directory) { [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
        foreach ($sid in @($identity, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
            $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', $inheritance, 'None', 'Allow')
            $null = $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $Path -AclObject $acl
    } else {
        $mode = if (Test-Path -LiteralPath $Path -PathType Container) { '700' } else { '600' }
        & chmod $mode -- $Path
        if ($LASTEXITCODE -ne 0) { throw 'Cannot restrict backup permissions.' }
    }
}

function Assert-BackupManifest([string]$BackupPath) {
    $manifest = Get-Content -LiteralPath "$BackupPath.backup.json" -Raw | ConvertFrom-Json
    if ($manifest.format -ne 1 -or $manifest.database -ne 'jobtracker' -or $manifest.sessionsExcluded -ne $true) {
        throw 'Unsupported backup metadata.'
    }
    $file = Get-Item -LiteralPath $BackupPath
    if ($file.Length -le 0 -or $file.Length -gt 268435456 -or $file.Length -ne $manifest.bytes) {
        throw 'Backup size mismatch or 256 MiB verification limit exceeded.'
    }
    if ($manifest.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash -ne $manifest.sha256) {
        throw 'Backup checksum mismatch. Restore was not attempted.'
    }
    return $manifest
}
