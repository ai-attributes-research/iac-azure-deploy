import { readFileSync } from "node:fs";
const p = JSON.parse(readFileSync("parameters.json", "utf8"));
const resources = JSON.parse(readFileSync("existing-resources.json", "utf8"));
const names = [p.vmName, `${p.vmName}-nic`, `${p.vmName}-os`].map((n) =>
  n.toLowerCase(),
);
if (resources.some((r) => names.includes(r.name.toLowerCase())))
  throw Error(
    "A VM, NIC, or disk with this name already exists. This starter is create-only; choose another name.",
  );
