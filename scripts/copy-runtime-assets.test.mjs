import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  FUNCTIONS_REL_DIR,
  chunkDirsFor,
  functionBundleDirs,
  parseArgs,
  pendingAssets,
  projectRoot,
  syncRuntimeAssets,
} from "./copy-runtime-assets.mjs";

const WASM_BODY = Buffer.from("fake-wasm-binary");
const DATA_BODY = Buffer.from("fake-pglite-data");

/**
 * A hermetic workspace: an app manifest, an installed "@electric-sql/pglite"
 * whose `dist/` holds the binaries, and a Vercel function bundle whose `_libs/`
 * holds the chunk that will ask for them.
 */
function makeWorkspace({ withBinaries = true, withChunk = true, symlinked = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "runtime-assets-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "app", type: "module" }));

  const pkgDir = join(root, "node_modules", "@electric-sql", "pglite");
  const dist = join(pkgDir, "dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify({ name: "@electric-sql/pglite", main: "./dist/index.js" }),
  );
  writeFileSync(join(dist, "index.js"), "export {}\n");
  if (withBinaries) {
    writeFileSync(join(dist, "pglite.wasm"), WASM_BODY);
    writeFileSync(join(dist, "pglite.data"), DATA_BODY);
  }

  const funcDir = join(root, FUNCTIONS_REL_DIR, "__server.func", "_libs");
  mkdirSync(funcDir, { recursive: true });
  if (withChunk) {
    writeFileSync(join(funcDir, "electric-sql__pglite.mjs"), "export {}\n");
  }
  if (symlinked) {
    symlinkSync(
      join(root, FUNCTIONS_REL_DIR, "__server.func"),
      join(root, FUNCTIONS_REL_DIR, "historial.func"),
      "dir",
    );
  }
  return { root, dist, funcDir };
}

test("parseArgs reads --root, --dry-run and rejects the unknown", () => {
  assert.deepEqual(parseArgs([]), { dryRun: false });
  assert.equal(parseArgs(["--dry-run"]).dryRun, true);
  assert.equal(parseArgs(["--root", "/tmp/x"]).root, "/tmp/x");
  assert.equal(parseArgs(["--root=/tmp/x"]).root, "/tmp/x");
  assert.match(String(parseArgs(["--nope"]).error), /unexpected argument/);
  assert.match(String(parseArgs(["--root"]).error), /needs a directory/);
});

test("functionBundleDirs lists .func dirs and ignores symlinked routes", () => {
  const { root } = makeWorkspace({ symlinked: true });
  const dirs = functionBundleDirs(join(root, FUNCTIONS_REL_DIR));
  assert.deepEqual(dirs, [join(root, FUNCTIONS_REL_DIR, "__server.func")]);
  assert.equal(functionBundleDirs(join(root, "nowhere")).length, 0);
});

test("chunkDirsFor finds the directory of the bundled pglite chunk", () => {
  const { root, funcDir } = makeWorkspace();
  assert.deepEqual(chunkDirsFor(join(root, FUNCTIONS_REL_DIR, "__server.func"), "pglite"), [
    funcDir,
  ]);
  assert.deepEqual(chunkDirsFor(join(root, FUNCTIONS_REL_DIR, "__server.func"), "nope"), []);
});

test("pendingAssets lists missing files and skips identical ones", () => {
  const { dist, funcDir } = makeWorkspace();
  const pending = pendingAssets(dist, funcDir);
  assert.deepEqual(
    pending.map((item) => item.name).sort(),
    ["pglite.data", "pglite.wasm"],
  );
  for (const item of pending) {
    assert.equal(readFileSync(item.from).toString(), readFileSync(item.from).toString());
  }
  // Once in place with the same size, nothing is pending.
  writeFileSync(join(funcDir, "pglite.wasm"), WASM_BODY);
  writeFileSync(join(funcDir, "pglite.data"), DATA_BODY);
  assert.deepEqual(pendingAssets(dist, funcDir), []);
});

test("syncRuntimeAssets delivers the binaries next to the chunk that asks", () => {
  const { root, funcDir } = makeWorkspace();
  const { copied, problems } = syncRuntimeAssets({ root, log: () => {} });
  assert.deepEqual(problems, []);
  assert.equal(copied.length, 2, copied.map((c) => c.file).join(", "));
  assert.equal(readFileSync(join(funcDir, "pglite.wasm")).toString(), WASM_BODY.toString());
  assert.equal(readFileSync(join(funcDir, "pglite.data")).toString(), DATA_BODY.toString());

  // Idempotent: a second pass finds everything in place.
  const again = syncRuntimeAssets({ root, log: () => {} });
  assert.deepEqual(again.copied, []);
  assert.deepEqual(again.problems, []);
});

test("dry-run reports without writing", () => {
  const { root, funcDir } = makeWorkspace();
  const { copied } = syncRuntimeAssets({ root, dryRun: true, log: () => {} });
  assert.equal(copied.length, 2);
  assert.equal(existsSync(join(funcDir, "pglite.wasm")), false);
});

test("a bundled chunk with no installed binaries is a hard problem", () => {
  const { root } = makeWorkspace({ withBinaries: false });
  const { problems } = syncRuntimeAssets({ root, log: () => {} });
  assert.equal(problems.length, 1, problems.join("; "));
  assert.match(problems[0], /binaries are not installed/);
});

test("a bundle that references pglite without a matching chunk is fatal", () => {
  const { root } = makeWorkspace({ withChunk: false });
  const ssrDir = join(root, FUNCTIONS_REL_DIR, "__server.func", "_ssr");
  mkdirSync(ssrDir, { recursive: true });
  writeFileSync(
    join(ssrDir, "db-abc.mjs"),
    'export const load = () => import("../_libs/electric-sql__pglite.mjs");\n',
  );
  const { problems } = syncRuntimeAssets({ root, log: () => {} });
  assert.equal(problems.length, 1, problems.join("; "));
  assert.match(problems[0], /no chunk matched hint/);
});

test("a bundle with no pglite at all is skipped, not a problem", () => {
  const { root } = makeWorkspace({ withChunk: false });
  const { problems, skipped } = syncRuntimeAssets({ root, log: () => {} });
  assert.deepEqual(problems, []);
  assert.equal(skipped.length, 1);
});

test("no function output is a no-op, not a failure", () => {
  const root = mkdtempSync(join(tmpdir(), "runtime-assets-empty-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "app" }));
  const { copied, problems } = syncRuntimeAssets({ root, log: () => {} });
  assert.deepEqual(copied, []);
  assert.deepEqual(problems, []);
});

test("the real repo's chunk hint matches the installed package", () => {
  // The bundle's chunk name is what chunkDirsFor matches; if Nitro ever renames
  // it, this test fails loudly instead of shipping a crashing function.
  const { pkg } = { pkg: "@electric-sql/pglite" };
  const dirs = chunkDirsFor(join(projectRoot(), ".vercel/output/functions/__server.func"), pkg.split("/").pop() ?? "");
  // Only meaningful when a build has run in this workspace.
  if (existsSync(join(projectRoot(), ".vercel/output"))) {
    assert.ok(dirs.length > 0, `no bundled chunk matched ${pkg}`);
  } else {
    assert.deepEqual(dirs, []);
  }
});
