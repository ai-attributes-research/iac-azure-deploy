import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
const { parameters: p } = JSON.parse(readFileSync(0, "utf8"));
function az(args) {
  return JSON.parse(
    execFileSync("az", [...args, "--only-show-errors", "-o", "json"], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    }),
  );
}
if (!p?.subscriptionId || !p?.vmName || !p?.resourceGroup)
  throw Error("Missing VM properties");
if (process.argv[2] === "set") {
  const dir = mkdtempSync(join(tmpdir(), "stratus-dsc-"));
  const params = Object.fromEntries(
    Object.entries(p)
      .filter(([k]) => !["subscriptionId", "resourceGroup"].includes(k))
      .map(([k, v]) => [k, { value: v }]),
  );
  writeFileSync(
    join(dir, "parameters.json"),
    JSON.stringify({ parameters: params }),
  );
  az([
    "deployment",
    "group",
    "create",
    "--subscription",
    p.subscriptionId,
    "--resource-group",
    p.resourceGroup,
    "--name",
    `stratus-${p.vmName}`,
    "--template-file",
    resolve("../../arm/virtual-machine/main.json"),
    "--parameters",
    "@" + join(dir, "parameters.json"),
    "--mode",
    "Incremental",
  ]);
}
const found = az([
  "vm",
  "list",
  "--subscription",
  p.subscriptionId,
  "--resource-group",
  p.resourceGroup,
]);
const vm = found.find((v) => v.name.toLowerCase() === p.vmName.toLowerCase());
if (!vm) {
  console.log(JSON.stringify({ parameters: { ...p, vmName: "" } }));
} else {
  const nic = az([
    "network",
    "nic",
    "show",
    "--ids",
    vm.networkProfile.networkInterfaces[0].id,
  ]);
  console.log(
    JSON.stringify({
      parameters: {
        subscriptionId: p.subscriptionId,
        resourceGroup: p.resourceGroup,
        vmName: vm.name,
        location: vm.location,
        vmSize: vm.hardwareProfile.vmSize,
        osDiskSizeGb: vm.storageProfile.osDisk.diskSizeGb,
        adminUsername: vm.osProfile.adminUsername,
        sshPublicKey: vm.osProfile.linuxConfiguration.ssh.publicKeys[0].keyData,
        subnetId: nic.ipConfigurations[0].subnet.id,
        environment: vm.tags?.environment || "",
      },
    }),
  );
}
