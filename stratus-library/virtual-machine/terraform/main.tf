terraform {
  required_version = ">= 1.9, < 2.0"
  backend "azurerm" {}
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
  }
}
provider "azurerm" {
  features {}
  subscription_id                 = var.subscriptionId
  resource_provider_registrations = "none"
}
variable "subscriptionId" { type = string }
variable "resourceGroup" { type = string }
variable "vmName" { type = string }
variable "location" { type = string }
variable "vmSize" { type = string }
variable "adminUsername" { type = string }
variable "sshPublicKey" { type = string }
variable "subnetId" { type = string }
variable "osDiskSizeGb" { type = number }
variable "environment" { type = string }
locals {
  tags = { environment = var.environment, managedBy = "stratus" }
}
resource "azurerm_network_interface" "vm" {
  name                = "${var.vmName}-nic"
  location            = var.location
  resource_group_name = var.resourceGroup
  tags                = local.tags
  ip_configuration {
    name                          = "private"
    subnet_id                     = var.subnetId
    private_ip_address_allocation = "Dynamic"
  }
}
resource "azurerm_linux_virtual_machine" "vm" {
  name                            = var.vmName
  location                        = var.location
  resource_group_name             = var.resourceGroup
  size                            = var.vmSize
  admin_username                  = var.adminUsername
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.vm.id]
  tags                            = local.tags
  admin_ssh_key {
    username   = var.adminUsername
    public_key = var.sshPublicKey
  }
  os_disk {
    name                 = "${var.vmName}-os"
    caching              = "ReadWrite"
    storage_account_type = "StandardSSD_LRS"
    disk_size_gb         = var.osDiskSizeGb
  }
  source_image_reference {
    publisher = "Canonical"
    offer     = "ubuntu-24_04-lts"
    sku       = "server"
    version   = "latest"
  }
  boot_diagnostics {}
}
output "vm_id" { value = azurerm_linux_virtual_machine.vm.id }
output "private_ip" { value = azurerm_network_interface.vm.private_ip_address }
