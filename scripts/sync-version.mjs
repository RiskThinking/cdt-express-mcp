import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const readJson = async (path) =>
  JSON.parse(await readFile(join(root, path), "utf8"));
const packageJson = await readJson("package.json");
const expectedVersion = packageJson.version;
const mismatches = [];

const syncJsonVersion = async (path, getVersions, setVersion) => {
  const document = await readJson(path);
  for (const [location, version] of getVersions(document)) {
    if (version !== expectedVersion) {
      mismatches.push(`${location} is ${version}, expected ${expectedVersion}`);
    }
  }
  if (!checkOnly) {
    setVersion(document, expectedVersion);
    await writeFile(
      join(root, path),
      `${JSON.stringify(document, null, 2)}\n`,
    );
  }
};

await syncJsonVersion(
  "package-lock.json",
  (lock) => [
    ["package-lock.json#version", lock.version],
    ["package-lock.json#packages[''].version", lock.packages?.[""]?.version],
  ],
  (lock, version) => {
    lock.version = version;
    lock.packages[""].version = version;
  },
);
await syncJsonVersion(
  "manifest.json",
  (manifest) => [["manifest.json#version", manifest.version]],
  (manifest, version) => {
    manifest.version = version;
  },
);
await syncJsonVersion(
  "server.json",
  (server) => [["server.json#version", server.version]],
  (server, version) => {
    server.version = version;
  },
);

const constantsPath = join(root, "src/constants.ts");
const constants = await readFile(constantsPath, "utf8");
const versionDeclaration =
  /^export const SERVER_VERSION = "(?<version>[^"]+)";/m;
const currentRuntimeVersion = constants.match(versionDeclaration)?.groups?.version;
if (!currentRuntimeVersion) {
  throw new Error("Could not find SERVER_VERSION in src/constants.ts");
}
if (currentRuntimeVersion !== expectedVersion) {
  mismatches.push(
    `src/constants.ts#SERVER_VERSION is ${currentRuntimeVersion}, expected ${expectedVersion}`,
  );
}
if (!checkOnly) {
  await writeFile(
    constantsPath,
    constants.replace(
      versionDeclaration,
      `export const SERVER_VERSION = "${expectedVersion}";`,
    ),
  );
}

if (checkOnly && mismatches.length > 0) {
  throw new Error(`Version metadata is out of sync:\n- ${mismatches.join("\n- ")}`);
}

console.log(
  checkOnly
    ? `Version metadata is consistent at ${expectedVersion}`
    : `Synchronized version metadata to ${expectedVersion}`,
);
