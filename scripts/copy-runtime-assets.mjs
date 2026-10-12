#!/usr/bin/env node
/**
 * Copy binary runtime assets the bundler cannot inline into the deployed
 * serverless function.
 *
 * Why this exists: PGLite's Node entry loads `pglite.wasm` / `pglite.data` /
 * `initdb.wasm` from disk, resolved RELATIVE TO THE MODULE FILE. Rolldown
 * bundles the JS into `.vercel/output/functions/__server.func/_libs/…pglite….mjs`
 * but the binaries are not JS, so nothing traces them — and the deployed
 * function then dies with:
 *
 *   ENOENT: no such file or directory, open '…/_libs/pglite.data'
 *
 * On a serverless runtime that is not a per-request error: `src/lib/db.ts` kicks
 * the bootstrap at import time, the rejection is unhandled, and the whole Node
 * process exits — every route 500s. This step runs after `vite build` (once
 * `.vercel/output` exists) and puts the binaries next to the chunk that asks for
 * them.
 *
 * No-op by design when there is nothing to do: no `.vercel/output`, no bundled
 * PGLite (e.g. a Postgres-only build), or assets already in place. It FAILS the
 * build when the chunk is there but a binary cannot be copied — a silently
 * missing wasm is exactly the crash above.
 *
 *   node scripts/copy-runtime-assets.mjs [--root <dir>] [--dry-run]
 */
import { createRequire } from "node:module";
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Binary suffixes a package loads from disk at runtime (never inlined). */
const RUNTIME_ASSET_EXTENSIONS = [".wasm", ".data"];

/**
 * Packages whose runtime binaries must sit next to their bundled chunk.
 * `chunkHint` matches the bundle's own chunk name (Nitro derives it from the
 * package name, e.g. `_libs/electric-sql__pglite.mjs`).
 */
export const RUNTIME_ASSET_PACKAGES = [
  { pkg: "@electric-sql/pglite", chunkHint: "pglite" },
];

/** Where the Vercel Build Output API puts each function's bundle. */
export const FUNCTIONS_REL_DIR = ".vercel/output/functions";

/** The workspace root (this file lives in `<root>/scripts/`). */
export function projectRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

export function parseArgs(argv) {
  /** @type {{ root?: string, dryRun: boolean, error?: string }} */
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--root") {
      const value = argv[i + 1];
      if (!value) return { ...out, error: "--root needs a directory" };
      out.root = value;
      i += 1;
    } else if (arg.startsWith("--root=")) {
      out.root = arg.slice("--root=".length);
    } else {
      return { ...out, error: `unexpected argument: ${arg}` };
    }
  }
  return out;
}

/**
 * Directories under `functionsDir` that hold a deployable function bundle.
 * Skips symlinks — the Vercel preset links per-route functions back to
 * `__server.func`, and following them would copy the same files twice.
 */
export function functionBundleDirs(functionsDir) {
  if (!existsSync(functionsDir)) return [];
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".func"))
    .map((entry) => join(functionsDir, entry.name))
    .filter((dir) => statSync(dir).isDirectory());
}

/**
 * Every regular file under `dir`, without following symlinks.
 * A missing `dir` yields nothing instead of throwing: callers probe build output
 * that legitimately does not exist until a build has run (`npm test` on a clean
 * checkout must not fail because `.vercel/output` is absent).
 */
function* walkFiles(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) yield* walkFiles(path);
    else if (entry.isFile()) yield path;
  }
}

/**
 * Directories holding a bundled chunk for `hint` — the directories the runtime
 * will resolve relative paths against.
 */
export function chunkDirsFor(bundleDir, hint) {
  const needle = hint.toLowerCase();
  const dirs = new Set();
  for (const file of walkFiles(bundleDir)) {
    if (!/\.(m?js|cjs)$/.test(file)) continue;
    const base = file.split("/").pop() ?? "";
    if (!base.toLowerCase().includes(needle)) continue;
    dirs.add(dirname(file));
  }
  return [...dirs];
}

/**
 * True when the bundle really ships `hint` — either as a chunk name or as an
 * import specifier inside one of its modules. This is what separates "the app
 * does not use this dependency" (fine to skip) from "it uses it under a chunk
 * name this script no longer matches" (fatal: the function would boot without
 * its binaries).
 */
export function bundleUsesHint(bundleDir, hint) {
  const needle = hint.toLowerCase();
  for (const file of walkFiles(bundleDir)) {
    if (!/\.(m?js|cjs)$/.test(file)) continue;
    const base = (file.split("/").pop() ?? "").toLowerCase();
    if (base.includes(needle)) return true;
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (source.toLowerCase().includes(needle)) return true;
  }
  return false;
}

/** Directories that hold at least one runtime binary. */
function hasRuntimeAssets(dir) {
  try {
    const names = readdirSync(dir);
    return RUNTIME_ASSET_EXTENSIONS.some((ext) => names.some((name) => name.endsWith(ext)));
  } catch {
    return false;
  }
}

/** Walk up from `start` to the directory whose package.json is named `pkg`. */
function packageRootOf(start, pkg) {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    try {
      const manifest = join(dir, "package.json");
      if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === pkg) {
        return dir;
      }
    } catch {
      // Unreadable manifest — keep walking.
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * The on-disk directory a package loads its binaries from: the folder of its
 * resolved entry point (PGLite keeps `pglite.wasm` next to `dist/index.js`),
 * falling back to the package's own `dist/`.
 */
export function packageAssetDir(root, pkg) {
  const require = createRequire(join(root, "package.json"));
  let entry;
  try {
    entry = require.resolve(pkg);
  } catch {
    return null;
  }
  const entryDir = dirname(entry);
  if (hasRuntimeAssets(entryDir)) return entryDir;
  const pkgRoot = packageRootOf(entryDir, pkg);
  const dist = pkgRoot ? join(pkgRoot, "dist") : null;
  return dist && hasRuntimeAssets(dist) ? dist : null;
}

/** Binary assets of `assetDir` that are not yet in place at `targetDir`. */
export function pendingAssets(assetDir, targetDir) {
  return readdirSync(assetDir)
    .filter((name) => RUNTIME_ASSET_EXTENSIONS.some((ext) => name.endsWith(ext)))
    .map((name) => {
      const from = join(assetDir, name);
      const to = join(targetDir, name);
      return { name, from, to, size: statSync(from).size };
    })
    .filter(({ from, to, size }) => {
      if (!existsSync(to)) return true;
      // Same name AND same size: a previous run of this step, nothing to redo.
      return statSync(to).size !== size || statSync(from).mtimeMs > statSync(to).mtimeMs;
    });
}

/**
 * Plan + apply. Returns `{ copied, skipped, problems }` where `problems` are
 * fatal (a chunk that will ask for a binary we could not deliver).
 */
export function syncRuntimeAssets({ root, dryRun = false, log = () => {} }) {
  const functionsDir = resolve(root, FUNCTIONS_REL_DIR);
  const bundleDirs = functionBundleDirs(functionsDir);
  if (bundleDirs.length === 0) {
    log(`[assets] no ${FUNCTIONS_REL_DIR} — nothing to do.`);
    return { copied: [], skipped: [], problems: [] };
  }

  /** @type {{ pkg: string, file: string, size: number }[]} */
  const copied = [];
  /** @type {string[]} */
  const skipped = [];
  /** @type {string[]} */
  const problems = [];

  for (const { pkg, chunkHint } of RUNTIME_ASSET_PACKAGES) {
    const assetDir = packageAssetDir(root, pkg);
    for (const bundleDir of bundleDirs) {
      const targets = chunkDirsFor(bundleDir, chunkHint);
      if (targets.length === 0) {
        if (bundleUsesHint(bundleDir, chunkHint)) {
          // The app ships this dependency but no chunk carried its name — the
          // naming scheme changed. Without the binaries the function crashes at
          // boot, so this must fail the build, not quietly skip.
          problems.push(
            `${pkg}: referenced by ${bundleDir} but no chunk matched hint ` +
              `"${chunkHint}" — update RUNTIME_ASSET_PACKAGES`,
          );
        } else {
          skipped.push(`${pkg} (not bundled into ${bundleDir})`);
        }
        continue;
      }
      if (!assetDir) {
        problems.push(`${pkg}: bundled at ${targets.join(", ")} but its binaries are not installed`);
        continue;
      }
      for (const target of targets) {
        let pending;
        try {
          pending = pendingAssets(assetDir, target);
        } catch (err) {
          problems.push(`${pkg}: cannot read ${assetDir} (${err?.message ?? err})`);
          continue;
        }
        if (pending.length === 0) {
          skipped.push(`${pkg} → ${target} (already in place)`);
          continue;
        }
        for (const asset of pending) {
          if (dryRun) {
            copied.push({ pkg, file: `${target}/${asset.name}`, size: asset.size });
            continue;
          }
          try {
            copyFileSync(asset.from, asset.to);
            copied.push({ pkg, file: `${target}/${asset.name}`, size: asset.size });
          } catch (err) {
            problems.push(
              `${pkg}: cannot copy ${asset.name} into ${target} (${err?.message ?? err})`,
            );
          }
        }
      }
    }
  }

  for (const item of copied) {
    log(`[assets] ${item.pkg}: ${item.file} (${Math.round(item.size / 1024)} KB)`);
  }
  for (const item of skipped) log(`[assets] skip ${item}`);
  return { copied, skipped, problems };
}

const args = parseArgs(process.argv.slice(2));
if (args.error) {
  console.error(`[assets] ${args.error}`);
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = resolve(args.root ?? projectRoot());
  const { copied, problems } = syncRuntimeAssets({
    root,
    dryRun: args.dryRun,
    log: (line) => console.log(line),
  });
  for (const problem of problems) console.error(`[assets] ERROR ${problem}`);
  if (problems.length > 0) {
    console.error(
      "[assets] the deployed function would crash at runtime — see the errors above.",
    );
    process.exit(1);
  }
  if (copied.length === 0) console.log("[assets] nothing to copy.");
}
