targetScope = 'resourceGroup'
param vmName string
param location string
param vmSize string = 'Standard_B2s'
param adminUsername string = 'azureuser'
param sshPublicKey string
param subnetId string
@minValue(32)
@maxValue(2048)
param osDiskSizeGb int = 32
param environment string = 'development'
var tags = { environment: environment
managedBy: 'stratus' }
resource nic 'Microsoft.Network/networkInterfaces@2024-05-01' = {
  name: '${vmName}-nic'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [{ name: 'private'
properties: { privateIPAllocationMethod: 'Dynamic'
subnet: { id: subnetId } } }]
  }
}
resource vm 'Microsoft.Compute/virtualMachines@2024-07-01' = {
  name: vmName
  location: location
  tags: tags
  properties: {
    hardwareProfile: { vmSize: vmSize }
    storageProfile: {
      imageReference: { publisher: 'Canonical'
offer: 'ubuntu-24_04-lts'
sku: 'server'
version: 'latest' }
      osDisk: { name: '${vmName}-os'
createOption: 'FromImage'
diskSizeGB: osDiskSizeGb
managedDisk: { storageAccountType: 'StandardSSD_LRS' } }
    }
    osProfile: {
      computerName: vmName
      adminUsername: adminUsername
      linuxConfiguration: { disablePasswordAuthentication: true
ssh: { publicKeys: [{ path: '/home/${adminUsername}/.ssh/authorized_keys'
keyData: sshPublicKey }] } }
    }
    networkProfile: { networkInterfaces: [{ id: nic.id
properties: { primary: true } }] }
    diagnosticsProfile: { bootDiagnostics: { enabled: true } }
  }
}
output vmId string = vm.id
output privateIp string = nic.properties.ipConfigurations[0].properties.privateIPAddress
