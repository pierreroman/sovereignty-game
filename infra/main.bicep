// Azure Static Web App that hosts the Sovereign Cloud Debunker game front end.
// Tenant-specific custom authentication requires the Standard tier.

@description('Name of the Static Web App.')
param name string = 'sovereignty-game'

@description('Static Web Apps is only offered in a few regions.')
@allowed([
  'eastus2'
  'centralus'
  'westus2'
  'westeurope'
  'eastasia'
])
param location string = 'eastus2'

@allowed([
  'Standard'
])
param sku string = 'Standard'

@description('Client ID of a single-tenant Entra web app in tenant 72f988bf-86f1-41af-91ab-2d7cd011db47.')
param aadClientId string

@secure()
@description('Client secret for the Entra web app. Never store this in source control.')
param aadClientSecret string

param tags object = {
  workload: 'sovereignty-game'
}

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    // Deployments come from the GitHub Actions workflow using the deployment token,
    // so no repository link is configured here.
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

var catalogueAccountName = 'myths${uniqueString(resourceGroup().id, name)}'

module catalogueStorage './catalogue-storage.bicep' = {
  name: '${name}-catalogue-storage'
  params: {
    name: name
    location: location
    storageAccountName: catalogueAccountName
    tags: tags
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: catalogueAccountName
}

resource settings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: swa
  name: 'appsettings'
  properties: {
    AAD_CLIENT_ID: aadClientId
    AAD_CLIENT_SECRET: aadClientSecret
    MYTHS_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
  }
  dependsOn: [catalogueStorage]
}

output name string = swa.name
output url string = 'https://${swa.properties.defaultHostname}'
output storageAccountName string = storage.name
