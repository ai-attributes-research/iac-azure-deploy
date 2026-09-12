import { readFileSync, writeFileSync } from "node:fs";
const p = JSON.parse(process.env.STRATUS_INPUTS || "{}");
const manifest = JSON.parse(
  readFileSync("stratus-library/virtual-machine/manifest.json", "utf8"),
);
const allowed = new Set(manifest.fields.map((f) => f.key));
for (const key of Object.keys(p))
  if (!allowed.has(key)) throw Error("Unexpected parameter " + key);
for (const f of manifest.fields)
  if (f.required && (p[f.key] === undefined || p[f.key] === ""))
    throw Error("Missing " + f.key);
if (p.subscriptionId !== process.env.AZURE_SUBSCRIPTION_ID)
  throw Error("Subscription differs from the configured deployment identity");
if (
  !/^[a-z][a-z0-9-]{1,62}$/.test(p.vmName) ||
  !/^ssh-rsa [A-Za-z0-9+/]+=*( .*)?$/.test(p.sshPublicKey)
)
  throw Error("Invalid name or SSH public key");
if (
  !Number.isSafeInteger(p.osDiskSizeGb) ||
  p.osDiskSizeGb < 32 ||
  p.osDiskSizeGb > 2048
)
  throw Error("Invalid disk size");
writeFileSync("parameters.json", JSON.stringify(p));
writeFileSync(
  "stratus-library/virtual-machine/terraform/stratus.auto.tfvars.json",
  JSON.stringify(p),
);
writeFileSync(
  "arm.parameters.json",
  JSON.stringify({
    parameters: Object.fromEntries(
      Object.entries(p)
        .filter(([k]) => !["subscriptionId", "resourceGroup"].includes(k))
        .map(([k, v]) => [k, { value: v }]),
    ),
  }),
);
writeFileSync("dsc.parameters.json", JSON.stringify({ parameters: { vm: p } }));
