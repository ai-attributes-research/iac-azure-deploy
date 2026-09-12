export const engines = [
  "powershell",
  "arm",
  "bicep",
  "terraform",
  "dsc",
  "ansible",
];
export const paths = [
  "stratus-library/powershell/virtual-machine/deploy.ps1",
  "stratus-library/arm/virtual-machine/main.json",
  "stratus-library/bicep/virtual-machine/main.bicep",
  "stratus-library/terraform/virtual-machine/main.tf",
  "stratus-library/dsc/virtual-machine/vm.dsc.json",
  "stratus-library/ansible/virtual-machine/playbook.yml",
];
export function validateCandidate(candidate) {
  if (
    !candidate ||
    !Array.isArray(candidate.files) ||
    candidate.files.length !== paths.length
  )
    throw Error("Generator must return exactly six implementation files.");
  const seen = new Set();
  for (const f of candidate.files) {
    if (
      !paths.includes(f.path) ||
      seen.has(f.path) ||
      typeof f.content !== "string" ||
      !f.content.trim() ||
      Buffer.byteLength(f.content) > 150000
    )
      throw Error("Invalid candidate file.");
    seen.add(f.path);
  }
  return candidate.files;
}
export function targetConfig(env = process.env) {
  const target = JSON.parse(env.STRATUS_TARGET || "{}");
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const k of ["subscriptionId", "tenantId", "clientId"])
    if (!uuid.test(target[k] || "")) throw Error("Invalid sandbox identity");
  if (
    !uuid.test(env.STRATUS_JOB_ID || "") ||
    !/^[a-z0-9]{2,40}$/.test(target.region || "")
  )
    throw Error("Invalid validation target");
  const allowed = String(env.STRATUS_ALLOWED_SUBSCRIPTIONS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  if (!allowed.includes(target.subscriptionId.toLowerCase()))
    throw Error("The selected subscription is not allowed for validation.");
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY || "") ||
    !/^\d+$/.test(env.GITHUB_RUN_ID || "")
  )
    throw Error("GitHub run identity required");
  return target;
}
export function groupName(jobId, engine) {
  if (!/^[a-f0-9-]{36}$/i.test(jobId) || !engines.includes(engine))
    throw Error("Invalid cleanup scope");
  return `stratus-test-${jobId.replaceAll("-", "")}-${engine}`;
}
export function assertOwnedGroup(group, target, jobId, engine, repo, runId) {
  const expected = `/subscriptions/${target.subscriptionId}/resourceGroups/${groupName(jobId, engine)}`;
  if (
    group.id?.toLowerCase() !== expected.toLowerCase() ||
    group.tags?.stratusJob !== jobId ||
    group.tags?.stratusRepository !== repo ||
    group.tags?.stratusRun !== runId ||
    group.tags?.stratusPurpose !== "iac-validation"
  )
    throw Error(
      "Cleanup blocked: resource group ownership does not match this exact validation run.",
    );
}
