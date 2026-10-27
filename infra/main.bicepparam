using './main.bicep'

param name = 'sovereignty-game'
param location = 'eastus2'
param sku = 'Standard'
param editorPasswordHash = readEnvironmentVariable('EDITOR_PASSWORD_HASH')
param editorSessionSecret = readEnvironmentVariable('EDITOR_SESSION_SECRET')
