param([Parameter(Mandatory)][string]$ParametersFile)
$ErrorActionPreference = 'Stop'
$p = Get-Content -LiteralPath $ParametersFile -Raw | ConvertFrom-Json
Set-AzContext -SubscriptionId $p.subscriptionId | Out-Null
$tags = @{ environment = $p.environment; managedBy = 'stratus' }
$nic = New-AzNetworkInterface -Name "$($p.vmName)-nic" -ResourceGroupName $p.resourceGroup -Location $p.location -SubnetId $p.subnetId -Tag $tags
# Azure requires a PSCredential object even with password authentication disabled.
$unused = ConvertTo-SecureString ([guid]::NewGuid().ToString() + '!aA1') -AsPlainText -Force
$credential = [pscredential]::new($p.adminUsername, $unused)
$vm = New-AzVMConfig -VMName $p.vmName -VMSize $p.vmSize
$vm = Set-AzVMOperatingSystem -VM $vm -Linux -ComputerName $p.vmName -Credential $credential -DisablePasswordAuthentication
$vm = Set-AzVMSourceImage -VM $vm -PublisherName Canonical -Offer ubuntu-24_04-lts -Skus server -Version latest
$vm = Add-AzVMNetworkInterface -VM $vm -Id $nic.Id -Primary
$vm = Add-AzVMSshPublicKey -VM $vm -KeyData $p.sshPublicKey -Path "/home/$($p.adminUsername)/.ssh/authorized_keys"
$vm = Set-AzVMOSDisk -VM $vm -Name "$($p.vmName)-os" -CreateOption FromImage -DiskSizeInGB $p.osDiskSizeGb -StorageAccountType StandardSSD_LRS -Caching ReadWrite
$vm = Set-AzVMBootDiagnostic -VM $vm -Enable
New-AzVM -ResourceGroupName $p.resourceGroup -Location $p.location -VM $vm -Tag $tags
