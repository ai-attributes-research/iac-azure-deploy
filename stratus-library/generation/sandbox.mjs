import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import {
  targetConfig,
  groupName,
  assertOwnedGroup,
  engines,
} from "./contract.mjs";
const t = targetConfig(),
  job = process.env.STRATUS_JOB_ID,
  engine = process.env.STRATUS_ENGINE;
const repo = process.env.GITHUB_REPOSITORY,
  run = process.env.GITHUB_RUN_ID;
function az(args) {
  const value = execFileSync(
    "az",
    [
      ...args,
      "--subscription",
      t.subscriptionId,
      "--only-show-errors",
      "--output",
      "json",
    ],
    { encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
  );
  return value.trim() ? JSON.parse(value) : null;
}
function output(name, value) {
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
function cleanup(e) {
  const rg = groupName(job, e);
  if (!az(["group", "exists", "--name", rg])) return;
  const group = az(["group", "show", "--name", rg]);
  assertOwnedGroup(group, t, job, e, repo, run);
  az(["group", "delete", "--name", rg, "--yes", "--no-wait"]);
  execFileSync(
    "az",
    [
      "group",
      "wait",
      "--subscription",
      t.subscriptionId,
      "--name",
      rg,
      "--deleted",
      "--interval",
      "15",
      "--timeout",
      "1500",
    ],
    { stdio: "inherit", timeout: 1530000 },
  );
  if (az(["group", "exists", "--name", rg]))
    throw Error(`Cleanup incomplete: ${rg}`);
  console.log(`Confirmed deleted: ${rg}`);
}
if (process.argv[2] === "cleanup-one") {
  if (!engines.includes(engine)) throw Error("Invalid cleanup engine");
  cleanup(engine);
} else if (process.argv[2] === "cleanup") {
  const failures = [];
  for (const e of engines) {
    try {
      cleanup(e);
    } catch (err) {
      failures.push(groupName(job, e));
      console.error(String(err.message));
    }
  }
  if (failures.length) {
    output("status", "cleanup_failed");
    throw Error("Cleanup requires attention: " + failures.join(", "));
  }
  output("status", "confirmed");
} else if (process.argv[2] === "prepare") {
  if (!engines.includes(engine)) throw Error("Choose a known engine");
  const rg = groupName(job, engine);
  if (az(["group", "exists", "--name", rg]))
    throw Error(
      "Test resource group already exists; refusing to reuse or overwrite it.",
    );
  az([
    "group",
    "create",
    "--name",
    rg,
    "--location",
    t.region,
    "--tags",
    `stratusJob=${job}`,
    `stratusRepository=${repo}`,
    `stratusRun=${run}`,
    "stratusPurpose=iac-validation",
  ]);
  const group = az(["group", "show", "--name", rg]);
  assertOwnedGroup(group, t, job, engine, repo, run);
  az([
    "network",
    "vnet",
    "create",
    "--resource-group",
    rg,
    "--name",
    "test-vnet",
    "--location",
    t.region,
    "--address-prefixes",
    "10.238.0.0/24",
    "--subnet-name",
    "test",
    "--subnet-prefixes",
    "10.238.0.0/27",
  ]);
  const temp = process.env.RUNNER_TEMP;
  if (!temp) throw Error("Runner temporary directory is required.");
  const key = join(temp, `stratus-key-${engine}`);
  if (!existsSync(key))
    execFileSync(
      "ssh-keygen",
      ["-t", "rsa", "-b", "2048", "-N", "", "-f", key],
      { stdio: "ignore" },
    );
  const values = {
    subscriptionId: t.subscriptionId,
    resourceGroup: rg,
    vmName: "stratus-smoke-vm",
    location: t.region,
    environment: "development",
    vmSize: "Standard_B2s",
    osDiskSizeGb: 32,
    adminUsername: "azureuser",
    sshPublicKey: readFileSync(key + ".pub", "utf8").trim(),
    subnetId: `/subscriptions/${t.subscriptionId}/resourceGroups/${rg}/providers/Microsoft.Network/virtualNetworks/test-vnet/subnets/test`,
  };
  writeFileSync("parameters.json", JSON.stringify(values));
  writeFileSync(
    "arm.parameters.json",
    JSON.stringify({
      parameters: Object.fromEntries(
        Object.entries(values)
          .filter(([k]) => !["subscriptionId", "resourceGroup"].includes(k))
          .map(([k, v]) => [k, { value: v }]),
      ),
    }),
  );
  writeFileSync(
    "dsc.parameters.json",
    JSON.stringify({ parameters: { vm: values } }),
  );
  writeFileSync(
    "stratus-library/terraform/virtual-machine/stratus.auto.tfvars.json",
    JSON.stringify(values),
  );
  // The sandbox uses ephemeral local state; production retains the original remote backend.
  const tf = "stratus-library/terraform/virtual-machine/main.tf";
  const code = readFileSync(tf, "utf8");
  if (!/backend\s+"azurerm"\s*\{\s*\}/.test(code))
    throw Error(
      "Terraform candidate must retain the supported empty AzureRM backend block.",
    );
  writeFileSync(
    tf,
    code.replace(/backend\s+"azurerm"\s*\{\s*\}/, 'backend "local" {}'),
  );
  output("resource_group", rg);
} else if (process.argv[2] === "verify") {
  const rg = groupName(job, engine),
    vm = az([
      "vm",
      "show",
      "--resource-group",
      rg,
      "--name",
      "stratus-smoke-vm",
    ]);
  if (
    vm.provisioningState !== "Succeeded" ||
    vm.osProfile?.linuxConfiguration?.disablePasswordAuthentication !== true
  )
    throw Error("VM provisioning/SSH verification failed.");
  const nicId = vm.networkProfile?.networkInterfaces?.[0]?.id;
  if (
    !nicId
      ?.toLowerCase()
      .startsWith(
        `/subscriptions/${t.subscriptionId}/resourcegroups/${rg}/`.toLowerCase(),
      )
  )
    throw Error("VM NIC is outside the test group.");
  const nic = az(["network", "nic", "show", "--ids", nicId]);
  if (nic.ipConfigurations?.some((c) => c.publicIPAddress))
    throw Error("Unexpected public IP on generated VM.");
  const resources = az(["resource", "list", "--resource-group", rg]);
  const allowed = [
    "microsoft.compute/virtualmachines",
    "microsoft.compute/disks",
    "microsoft.network/networkinterfaces",
    "microsoft.network/virtualnetworks",
  ];
  if (
    resources.some((r) => !allowed.includes(r.type.toLowerCase())) ||
    resources.length !== 4
  )
    throw Error(
      "Candidate created unexpected resources in the validation group.",
    );
  mkdirSync("validation-results", { recursive: true });
  writeFileSync(
    `validation-results/${engine}.json`,
    JSON.stringify({
      engine,
      vmId: vm.id,
      provisioning: "Succeeded",
      sshOnly: true,
      publicIp: false,
      cleanup: "pending",
    }),
  );
  console.log(
    `${engine}: deployment smoke checks passed; cleanup remains required.`,
  );
} else throw Error("Unknown sandbox operation");
