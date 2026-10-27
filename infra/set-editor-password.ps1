#requires -Version 7.2
[CmdletBinding(DefaultParameterSetName = 'Azure')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Azure')] [string] $Subscription,
    [Parameter(Mandatory, ParameterSetName = 'Azure')] [string] $ResourceGroup,
    [Parameter(ParameterSetName = 'Azure')] [string] $Name = 'sovereignty-game',
    [Parameter(Mandatory, ParameterSetName = 'Generate')] [switch] $GenerateOnly
)

$ErrorActionPreference = 'Stop'
if (-not $GenerateOnly -and -not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI is required to update Azure settings. Install it or use -GenerateOnly for local credential generation.'
}

function ConvertTo-Base64Url([byte[]] $Bytes) {
    [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$passwordBytes = $null
while ($null -eq $passwordBytes) {
    $password = $null
    $confirmation = $null
    $passwordPtr = [IntPtr]::Zero
    $confirmationPtr = [IntPtr]::Zero
    try {
        $password = Read-Host 'Editor passphrase (16-256 characters; Ctrl+C to cancel)' -AsSecureString
        if ($password.Length -lt 16 -or $password.Length -gt 256) {
            Write-Warning 'Use an editor passphrase between 16 and 256 characters. No settings have been changed. Please enter a new passphrase.'
            continue
        }
        $confirmation = Read-Host 'Confirm editor passphrase' -AsSecureString
        $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
        $confirmationPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
        if ($plain -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPtr)) {
            Write-Warning 'Passphrases do not match. Use an editor passphrase between 16 and 256 characters and enter the same value to confirm. No settings have been changed. Please enter a new passphrase.'
            continue
        }
        $passwordBytes = [Text.Encoding]::UTF8.GetBytes($plain)
    } finally {
        $plain = $null
        if ($passwordPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr) }
        if ($confirmationPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPtr) }
        if ($null -ne $password) { $password.Dispose() }
        if ($null -ne $confirmation) { $confirmation.Dispose() }
    }
}

$key = $null
$sessionKey = $null
try {
    $salt = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $key = [Security.Cryptography.Rfc2898DeriveBytes]::Pbkdf2(
        $passwordBytes, $salt, 600000, [Security.Cryptography.HashAlgorithmName]::SHA256, 32)
    $sessionKey = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $env:EDITOR_PASSWORD_HASH = 'pbkdf2-sha256$600000$' + (ConvertTo-Base64Url $salt) + '$' + (ConvertTo-Base64Url $key)
    $env:EDITOR_SESSION_SECRET = ConvertTo-Base64Url $sessionKey
} finally {
    if ($passwordBytes) { [Array]::Clear($passwordBytes, 0, $passwordBytes.Length) }
    if ($key) { [Array]::Clear($key, 0, $key.Length) }
    if ($sessionKey) { [Array]::Clear($sessionKey, 0, $sessionKey.Length) }
}

if (-not $GenerateOnly) {
    az staticwebapp appsettings set --subscription $Subscription --resource-group $ResourceGroup --name $Name `
        --setting-names "EDITOR_PASSWORD_HASH=$env:EDITOR_PASSWORD_HASH" "EDITOR_SESSION_SECRET=$env:EDITOR_SESSION_SECRET" `
        --output none
    if ($LASTEXITCODE -ne 0) { throw 'Could not update Azure password settings. Generated values remain in this shell for retry.' }
    Write-Output "Editor password configured on '$Name'. Existing editor sessions are invalidated."
} else {
    Write-Output 'EDITOR_PASSWORD_HASH and EDITOR_SESSION_SECRET are set in this PowerShell process for local development or infrastructure deployment.'
}
Write-Output 'No plaintext password or credentials were printed or written to files. Clear the two environment variables when finished.'
