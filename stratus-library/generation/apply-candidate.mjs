import { readFileSync, writeFileSync, lstatSync } from "node:fs";
import { validateCandidate } from "./contract.mjs";
for (const file of validateCandidate(
  JSON.parse(readFileSync("candidate/files.json", "utf8")),
)) {
  if (lstatSync(file.path).isSymbolicLink())
    throw Error("Candidate cannot replace symlinks.");
  writeFileSync(file.path, file.content);
}
