using './main.bicep'

param name = 'sovereignty-game'
param location = 'eastus2'
param sku = 'Standard'
param aadClientId = readEnvironmentVariable('AAD_CLIENT_ID')
param aadClientSecret = readEnvironmentVariable('AAD_CLIENT_SECRET')
