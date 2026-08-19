import { execFileSync } from "node:child_process";

const requestedVersion = process.argv[2];
if (!requestedVersion || process.argv.length > 3) {
  throw new Error("Usage: npm run bump:version -- <version>");
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this command through npm");

// Explicitly enable lifecycle scripts so a developer's global ignore-scripts
// setting cannot silently skip the metadata synchronization hook.
execFileSync(
  process.execPath,
  [
    npmCli,
    "version",
    requestedVersion,
    "--no-git-tag-version",
    "--ignore-scripts=false",
  ],
  { stdio: "inherit" },
);
