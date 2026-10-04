#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This regression test requires Windows.' }
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $root 'scripts/backup/Common.ps1')
$directory = Join-Path ([IO.Path]::GetTempPath()) ('jobtracker-acl-' + [Guid]::NewGuid().ToString('N'))
$file = Join-Path $directory 'private.txt'
$null = New-Item -ItemType Directory -Path $directory
$sections = [Security.AccessControl.AccessControlSections]'Access,Owner'
$allowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18')
function Assert-Private([string]$Path, [string]$OwnerBefore) {
    $item = Get-Item -LiteralPath $Path
    $acl = [IO.FileSystemAclExtensions]::GetAccessControl($item, $sections)
    if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $OwnerBefore) { throw 'Inheritance or owner changed unexpectedly.' }
    $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if ($rules.Count -ne 2) { throw 'Expected only current user and SYSTEM.' }
    foreach ($rule in $rules) {
        if ($rule.IsInherited -or $rule.IdentityReference.Value -notin $allowed -or
            $rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne 'FullControl') { throw 'Unexpected access rule.' }
    }
    Write-Output 'PASS: private DACL, no inherited grants, unchanged owner'
}
try {
    $owner = ([IO.FileSystemAclExtensions]::GetAccessControl((Get-Item -LiteralPath $directory), $sections)).GetOwner([Security.Principal.SecurityIdentifier]).Value
    Protect-BackupPath $directory
    Assert-Private $directory $owner
    [IO.File]::WriteAllText($file, 'fixture')
    $fileOwner = ([IO.FileSystemAclExtensions]::GetAccessControl((Get-Item -LiteralPath $file), $sections)).GetOwner([Security.Principal.SecurityIdentifier]).Value
    Protect-BackupPath $file
    Protect-BackupPath $file
    Assert-Private $file $fileOwner
    if ([IO.File]::ReadAllText($file) -ne 'fixture') { throw 'File access failed.' }
    Write-Output 'PASS: protected file remains readable and repeat application succeeds'
} finally {
    if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
    Remove-Item -LiteralPath $directory
}
