<#
.SYNOPSIS
  Deploys the Sovereign Cloud Debunkers game as its OWN Azure Static Web App,
  in the same tenant and subscription as the live poll, then wires the GitHub
  deployment secret.

.DESCRIPTION
  By default the script finds the poll's Static Web App (by its custom domain)
  with Azure Resource Graph, switches to that subscription, and deploys the game
  next to it. The poll app itself is never modified.

.EXAMPLE
  # Same subscription + resource group as the poll (auto-discovered)
  ./infra/deploy.ps1 -Repo pierreroman/sovereignty-game

.EXAMPLE
  # Same subscription as the poll, separate resource group, plus a custom domain
  ./infra/deploy.ps1 -Repo pierreroman/sovereignty-game -ResourceGroup rg-sovereignty-game -CustomDomain game.wiredcanuck.com

.EXAMPLE
  # Explicit subscription, no discovery
  ./infra/deploy.ps1 -Repo pierreroman/sovereignty-game -Subscription <sub-id> -ResourceGroup rg-sovereignty-game

.NOTES
  Requires Azure CLI (az login to the poll's tenant) and GitHub CLI (gh auth login).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $Repo,
    [string] $PollDomain = 'poll.wiredcanuck.com',
    [string] $Subscription,
    [string] $ResourceGroup,
    [string] $Location,
    [string] $Name = 'sovereignty-game',
    [string] $CustomDomain,
    [string] $SecretName = 'AZURE_STATIC_WEB_APPS_API_TOKEN'
)

$ErrorActionPreference = 'Stop'
function Invoke-Az { $out = az @args; if ($LASTEXITCODE -ne 0) { throw "az $($args -join ' ') failed" }; $out }

# 1. Locate the poll app (unless the target was given explicitly).
if (-not $Subscription) {
    Write-Host "Looking up the poll's Static Web App ($PollDomain)..."
    Invoke-Az extension add --name resource-graph --only-show-errors | Out-Null
    $query = "resources | where type =~ 'microsoft.web/staticsites' | where tostring(properties.customDomains) contains '$PollDomain' or tostring(properties.defaultHostname) =~ '$PollDomain' | project name, resourceGroup, subscriptionId, location, tenantId"
    $poll = Invoke-Az graph query -q $query --query 'data[0]' -o json | ConvertFrom-Json
    if (-not $poll) {
        throw "Couldn't find a Static Web App serving $PollDomain in the signed-in tenant. Run 'az login --tenant <poll tenant>' or pass -Subscription and -ResourceGroup."
    }
    Write-Host "  Poll app: $($poll.name) in $($poll.resourceGroup), subscription $($poll.subscriptionId)"
    $Subscription = $poll.subscriptionId
    if (-not $ResourceGroup) { $ResourceGroup = $poll.resourceGroup }
    if (-not $Location) { $Location = $poll.location -replace ' ', '' }
}
if (-not $ResourceGroup) { throw 'Pass -ResourceGroup (or let the script discover the poll).' }
if (-not $Location) { $Location = 'eastus2' }
$Location = $Location.ToLower()

Invoke-Az account set --subscription $Subscription | Out-Null
Write-Host "Target: subscription $Subscription, resource group $ResourceGroup, region $Location, app '$Name'"

# 2. Never overwrite the poll: refuse if the name is already taken in this resource group by something else.
$existing = az staticwebapp show --name $Name --resource-group $ResourceGroup --query name -o tsv 2>$null
if ($existing) { Write-Host "  '$Name' already exists in $ResourceGroup; it will be updated (the poll app is untouched)." }

# 3. Resource group + Static Web App.
Invoke-Az group create --name $ResourceGroup --location $Location --output none
$result = Invoke-Az deployment group create `
    --resource-group $ResourceGroup `
    --name "sovereignty-game-$(Get-Date -Format yyyyMMddHHmmss)" `
    --template-file "$PSScriptRoot/main.bicep" `
    --parameters name=$Name location=$Location `
    --query properties.outputs -o json | ConvertFrom-Json

# 4. Deployment token -> GitHub secret.
$token = Invoke-Az staticwebapp secrets list --name $Name --resource-group $ResourceGroup --query properties.apiKey -o tsv
$token | gh secret set $SecretName --repo $Repo
if ($LASTEXITCODE -ne 0) { throw "Couldn't set the GitHub secret on $Repo (check 'gh auth status')." }
Write-Host "Stored deployment token as $SecretName on $Repo."

# 5. Optional custom domain (CNAME must already point at the default hostname).
if ($CustomDomain) {
    Write-Host "Adding custom domain $CustomDomain (needs a CNAME to $($result.url.value -replace 'https://',''))..."
    Invoke-Az staticwebapp hostname set --name $Name --resource-group $ResourceGroup --hostname $CustomDomain --no-wait | Out-Null
}

# 6. Kick off the first build/deploy.
gh workflow run deploy.yml --repo $Repo --ref main 2>$null
Write-Host ""
Write-Host "Done. Site URL: $($result.url.value)"
Write-Host "The workflow publishes on every push to main (first run started if the workflow is on main)."
