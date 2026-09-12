import { readFileSync } from "node:fs";
import { validateCandidate } from "./contract.mjs";
const repo = process.env.GITHUB_REPOSITORY,
  job = process.env.STRATUS_JOB_ID,
  base = process.env.GITHUB_SHA;
if (!/^[a-f0-9-]{36}$/i.test(job || "") || !/^[a-f0-9]{40}$/i.test(base || ""))
  throw Error("Invalid generation identity");
const candidate = JSON.parse(readFileSync("candidate/files.json", "utf8")),
  files = validateCandidate(candidate);
async function gh(path, method = "GET", body) {
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok)
    throw Error(
      `GitHub publication failed (${r.status}). Enable Actions pull request creation and check repository policy.`,
    );
  return r.json();
}
const commit = await gh(`/git/commits/${base}`),
  info = await gh("");
const tree = await gh("/git/trees", "POST", {
  base_tree: commit.tree.sha,
  tree: files.map((f) => ({ ...f, mode: "100644", type: "blob" })),
});
const next = await gh("/git/commits", "POST", {
  message: "Generate VM IaC after sandbox validation and cleanup",
  tree: tree.sha,
  parents: [base],
});
const branch = `stratus-generated-${job}`;
await gh("/git/refs", "POST", { ref: `refs/heads/${branch}`, sha: next.sha });
const pr = await gh("/pulls", "POST", {
  title: "Validated VM IaC generation",
  head: branch,
  base: info.default_branch,
  body: `Generated six VM implementations. Each passed an Azure provisioning smoke test, followed by confirmed deletion of its temporary resource group.\n\nReview the complete diff before merging. Terraform smoke tests use an ephemeral local state backend; production backend behavior is not covered. These checks do not certify arbitrary workloads or all Azure policies.\n\nValidation run: https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}\nGeneration ID: ${job}`,
  draft: true,
});
console.log("Review generated code: " + pr.html_url);
