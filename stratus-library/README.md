# Stratus infrastructure library

This library starts with a private Ubuntu 24.04 LTS virtual machine. Its form is defined in `virtual-machine/manifest.json`; `catalog.json` lists available resources. Implementations live in `bicep`, `terraform`, `arm`, `powershell`, `dsc`, and `ansible` folders.

Connect this repository in Stratus, configure its `stratus` GitHub environment and Azure OIDC identity, and sync the library. Required repository Actions variables: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`. Terraform additionally requires `TF_STORAGE_ACCOUNT` and `TF_STORAGE_CONTAINER` and Blob Data Contributor access to its remote state container.

The identity needs permission to create compute/network resources in the target group and join the existing subnet. The federated subject is `repo:OWNER/REPO:environment:stratus`. Restrict environment deployment tags to `stratus-deploy-*`. Never commit Azure client secrets, private SSH keys, GitHub tokens, or Supabase keys.

Stratus dispatches the workflow at a reviewed commit through a unique deployment tag. The workflow creates a new VM, NIC, and managed disk; it rejects existing matching names. It does not create a public IP or subnet, and does not implement rollback or destruction. Failed runs can leave partial resources: inspect them and preserve Terraform state before deciding how to recover.

The runner's input files are generated at runtime from the reviewed form. Do not commit these files. DSC v3 uses a custom resource backed by the ARM template. Source validation does not guarantee Azure capacity, policy compliance, or successful live provisioning.
