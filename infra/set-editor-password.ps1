[CmdletBinding(DefaultParameterSetName = 'Azure')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Azure')] [string] $Subscription,
    [Parameter(Mandatory, ParameterSetName = 'Azure')] [string] $ResourceGroup,
    [Parameter(ParameterSetName = 'Azure')] [string] $Name = 'sovereignty-game',
    [Parameter(Mandatory, ParameterSetName = 'Generate')] [switch] $GenerateOnly
)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$api = Join-Path $PSScriptRoot '..\api'
npm --prefix $api run build
if ($LASTEXITCODE -ne 0) { throw 'Build the API successfully before setting its password.' }

$password = Read-Host 'Editor passphrase (16-256 characters)' -AsSecureString
$confirmation = Read-Host 'Confirm editor passphrase' -AsSecureString
$passwordPtr = [IntPtr]::Zero
$confirmationPtr = [IntPtr]::Zero
$process = $null
try {
    $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $confirmationPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
    if ($plain -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPtr)) {
        throw 'Passphrases do not match. No settings have been changed.'
    }
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $node
    $start.ArgumentList.Add((Join-Path $api 'scripts\hash-editor-password.mjs'))
    $start.UseShellExecute = $false
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($start)
    $process.StandardInput.WriteLine($plain)
    $process.StandardInput.Close()
    $plain = $null
    $result = $process.StandardOutput.ReadToEnd()
    $failure = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "Password hashing failed: $failure" }
    $credentials = $result | ConvertFrom-Json
    $env:EDITOR_PASSWORD_HASH = $credentials.passwordHash
    $env:EDITOR_SESSION_SECRET = $credentials.sessionSecret
    $result = $null
    $credentials = $null
} finally {
    $plain = $null
    if ($passwordPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr) }
    if ($confirmationPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPtr) }
    $password.Dispose()
    $confirmation.Dispose()
    if ($process) { $process.Dispose() }
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
