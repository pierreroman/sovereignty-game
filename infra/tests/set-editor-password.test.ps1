#requires -Version 7.2
$ErrorActionPreference = 'Stop'
$originalPath = $env:PATH
$originalHash = $env:EDITOR_PASSWORD_HASH
$originalSecret = $env:EDITOR_SESSION_SECRET
$setup = Join-Path $PSScriptRoot '..\set-editor-password.ps1'

function Assert-True([bool] $Condition, [string] $Message) {
    if (-not $Condition) { throw $Message }
}

function Set-TestPassphrases([string[]] $Values) {
    $state = @{
        Inputs = [Collections.Generic.Queue[string]]::new()
        Prompts = [Collections.Generic.List[string]]::new()
        Hash = $env:EDITOR_PASSWORD_HASH
        Secret = $env:EDITOR_SESSION_SECRET
    }
    foreach ($value in $Values) { $state.Inputs.Enqueue($value) }
    $reader = {
        param([string] $Prompt, [switch] $AsSecureString)
        if (-not $AsSecureString) { throw 'Password input must remain masked.' }
        if ($state.Hash -cne $env:EDITOR_PASSWORD_HASH -or $state.Secret -cne $env:EDITOR_SESSION_SECRET) {
            throw 'Settings changed before a valid passphrase was confirmed.'
        }
        $state.Prompts.Add($Prompt)
        if ($state.Inputs.Count -eq 0) {
            throw [OperationCanceledException]::new('Simulated input cancellation.')
        }
        ConvertTo-SecureString $state.Inputs.Dequeue() -AsPlainText -Force
    }.GetNewClosure()
    Set-Item Function:script:Read-Host $reader
    return $state
}

try {
    $env:PATH = ''
    Assert-True (-not (Get-Command node -ErrorAction SilentlyContinue)) 'This test must run without Node on PATH.'
    $testPassword = "native-test passphrase with " + [char]0xE9
    $state = Set-TestPassphrases @($testPassword, $testPassword)
    $output = (& $setup -GenerateOnly) -join "`n"
    Assert-True ($env:EDITOR_PASSWORD_HASH -match '^pbkdf2-sha256\$600000\$[A-Za-z0-9_-]{43}\$[A-Za-z0-9_-]{43}$') 'Invalid native password hash format.'
    Assert-True ($env:EDITOR_SESSION_SECRET -match '^[A-Za-z0-9_-]{43}$') 'Invalid signing key format.'
    Assert-True (-not $output.Contains($env:EDITOR_PASSWORD_HASH)) 'Setup printed the password hash.'
    Assert-True (-not $output.Contains($env:EDITOR_SESSION_SECRET)) 'Setup printed the signing key.'
    Assert-True (-not $output.Contains('native-test passphrase with')) 'Setup printed the plaintext password.'
    Write-Output 'PASS: Credential generation requires no Node, npm, API build, or external executable and prints no credentials.'

    $parts = $env:EDITOR_PASSWORD_HASH.Split('$')
    $salt = [Convert]::FromBase64String($parts[2].Replace('-', '+').Replace('_', '/') + '=')
    $passwordBytes = [Text.Encoding]::UTF8.GetBytes("native-test passphrase with " + [char]0xE9)
    $derived = [Security.Cryptography.Rfc2898DeriveBytes]::Pbkdf2(
        $passwordBytes, $salt, 600000, [Security.Cryptography.HashAlgorithmName]::SHA256, 32)
    $encoded = [Convert]::ToBase64String($derived).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    Assert-True ($encoded -ceq $parts[3]) 'Native hash does not verify the exact Unicode password.'
    Write-Output 'PASS: Hash encoding verifies the exact UTF-8 password.'

    $firstHash = $env:EDITOR_PASSWORD_HASH
    $firstSecret = $env:EDITOR_SESSION_SECRET
    $state = Set-TestPassphrases @($testPassword, $testPassword)
    & $setup -GenerateOnly | Out-Null
    Assert-True ($firstHash -cne $env:EDITOR_PASSWORD_HASH) 'Salt was not randomized.'
    Assert-True ($firstSecret -cne $env:EDITOR_SESSION_SECRET) 'Session key was not randomized.'
    Write-Output 'PASS: Repeated setup generates fresh salts and signing keys.'

    $state = Set-TestPassphrases @($testPassword, $testPassword.ToUpperInvariant(), $testPassword, $testPassword)
    $output = (& $setup -GenerateOnly 3>&1) -join "`n"
    Assert-True ($state.Prompts.Count -eq 4 -and $state.Inputs.Count -eq 0) 'Mismatched confirmation did not restart both prompts.'
    Assert-True ($output.Contains('Passphrases do not match') -and $output.Contains('16 and 256') -and $output.Contains('Please enter a new passphrase')) 'Missing confirmation requirements reminder.'
    Assert-True ($env:EDITOR_PASSWORD_HASH -cne $state.Hash) 'Valid retry did not generate credentials.'
    Write-Output 'PASS: Case-sensitive confirmation failures remind users of the requirements and retry without changing settings early.'

    foreach ($length in 5, 257) {
        $state = Set-TestPassphrases @(('x' * $length), $testPassword, $testPassword)
        $output = (& $setup -GenerateOnly 3>&1) -join "`n"
        Assert-True ($state.Prompts.Count -eq 3 -and $state.Inputs.Count -eq 0) "Invalid length $length did not retry before asking for confirmation."
        Assert-True ($output.Contains('between 16 and 256 characters') -and $output.Contains('Please enter a new passphrase')) 'Missing length requirements reminder.'
        Assert-True ($env:EDITOR_PASSWORD_HASH -cne $state.Hash) 'Valid retry did not generate credentials.'
    }
    Write-Output 'PASS: Short and oversized passwords remind users of the requirements and retry before confirmation.'

    foreach ($length in 16, 256) {
        $boundaryPassword = 'x' * $length
        $state = Set-TestPassphrases @($boundaryPassword, $boundaryPassword)
        & $setup -GenerateOnly | Out-Null
        Assert-True ($state.Prompts.Count -eq 2 -and $state.Inputs.Count -eq 0) "Valid boundary length $length was not accepted."
    }
    Write-Output 'PASS: Both the 16-character minimum and 256-character maximum are accepted.'

    foreach ($values in @(
        @{ Inputs = @('too short') },
        @{ Inputs = @($testPassword) },
        @{ Inputs = @($testPassword, 'different confirmation passphrase') }
    )) {
        $state = Set-TestPassphrases $values.Inputs
        $cancelled = $false
        try { & $setup -GenerateOnly 3>&1 | Out-Null } catch [OperationCanceledException] {
            $cancelled = $true
        }
        Assert-True $cancelled 'Cancellation was swallowed.'
        Assert-True ($env:EDITOR_PASSWORD_HASH -ceq $state.Hash -and $env:EDITOR_SESSION_SECRET -ceq $state.Secret) 'Cancellation changed existing settings.'
    }
    Write-Output 'PASS: Cancellation during confirmation or retries leaves existing credentials unchanged.'
} finally {
    $env:PATH = $originalPath
    $env:EDITOR_PASSWORD_HASH = $originalHash
    $env:EDITOR_SESSION_SECRET = $originalSecret
}
