import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { packExtension } from "@anthropic-ai/mcpb/cli";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stagingDirectory = await mkdtemp(join(tmpdir(), "cdt-express-mcpb-"));
const outputPath = join(root, "cdt-express.mcpb");

try {
  const packageJson = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(join(root, "manifest.json"), "utf8"),
  );
  manifest.version = packageJson.version;

  await mkdir(join(stagingDirectory, "build"));
  await writeFile(
    join(stagingDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await copyFile(join(root, "LICENSE"), join(stagingDirectory, "LICENSE"));

  // Bundle only the stdio entry point and the modules it can reach. This keeps
  // the HTTP transport, OAuth implementation, Express, and ipaddr.js out of the
  // local extension without coupling the remote deployment to MCPB packaging.
  const result = await build({
    entryPoints: [join(root, "src/index.ts")],
    // .mjs makes the ESM contract independent of Node's syntax detection and
    // of any package.json that may exist above the extension directory.
    outfile: join(stagingDirectory, "build/index.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    minify: true,
    legalComments: "eof",
    metafile: true,
  });
  const remoteOnlyInputs = [
    "src/http.ts",
    "src/oauth.ts",
    "src/cimd.ts",
    "node_modules/express/",
    "node_modules/ipaddr.js/",
  ];
  const bundledInputs = Object.keys(result.metafile.inputs).map((input) =>
    input.replaceAll("\\", "/"),
  );
  const leakedInputs = bundledInputs.filter((input) =>
    remoteOnlyInputs.some(
      (remoteInput) =>
        input === remoteInput ||
        input.endsWith(`/${remoteInput}`) ||
        input.includes(remoteInput),
    ),
  );
  if (leakedInputs.length > 0) {
    throw new Error(
      `Remote-only modules leaked into the MCPB: ${leakedInputs.join(", ")}`,
    );
  }

  const packed = await packExtension({
    extensionPath: stagingDirectory,
    outputPath,
  });
  if (!packed) throw new Error("MCPB packer did not produce an artifact");
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}
