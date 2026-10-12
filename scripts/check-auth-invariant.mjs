#!/usr/bin/env node
/**
 * Auth-flag invariant: does the RUNNING dev server agree with the next build?
 *
 * `VITE_AUTH_ENABLED` is baked into the client bundle, so a dev server started
 * outside `scripts/with-app-env.mjs` (a bare `vite dev`, a stale process left
 * over from an earlier flag) renders a different app than the one `npm run
 * build` will produce. That divergence only surfaces as a built-output mismatch
 * long after the fact, which is what this check exists to catch early.
 *
 * It reads the live server's resolved client env from the dev-only
 * `/__app-env` endpoint (`scripts/app-env-plugin.mjs`) and compares
 * `VITE_AUTH_ENABLED` against the value the next build resolves — the same merge
 * `scripts/with-app-env.mjs` performs, so both sides are computed by one rule.
 *
 *   node scripts/check-auth-invariant.mjs [--url http://127.0.0.1:8080]
 *                                         [--require-server] [--json]
 *
 * Exit codes: 0 = in agreement (or no server running, unless --require-server),
 * 1 = they disagree, 2 = bad usage.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ENV_ROUTE } from "./app-env-plugin.mjs";
import {
  APP_ENV_REL_PATH,
  mergeAppEnv,
  projectRoot,
  readAppEnv,
} from "./with-app-env.mjs";

export const DEFAULT_DEV_URL = "http://127.0.0.1:8080";
export const AUTH_FLAG = "VITE_AUTH_ENABLED";
export const FETCH_TIMEOUT_MS = 3000;

export function parseArgs(argv) {
  /** @type {{ url: string, requireServer: boolean, json: boolean, error?: string }} */
  const out = { url: DEFAULT_DEV_URL, requireServer: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--require-server") out.requireServer = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--url") {
      const value = argv[i + 1];
      if (!value) return { ...out, error: "--url needs a value" };
      out.url = value;
      i += 1;
    } else if (arg.startsWith("--url=")) out.url = arg.slice("--url=".length);
    else return { ...out, error: `unexpected argument: ${arg}` };
  }
  return out;
}

/**
 * The `VITE_` client env the NEXT build resolves: the app-env file under
 * `process.env`, exactly as `scripts/with-app-env.mjs` hands it to Vite.
 *
 * @param {Record<string, string | undefined>} processEnv
 * @param {(root: string) => Record<string, string>} readEnv
 * @param {string} root
 */
export function nextBuildClientEnv(processEnv, readEnv = readAppEnv, root = projectRoot()) {
  const merged = mergeAppEnv(readEnv(root), processEnv);
  /** @type {Record<string, string>} */
  const clientEnv = {};
  for (const [key, value] of Object.entries(merged)) {
    if (!key.startsWith("VITE_")) continue;
    if (typeof value !== "string") continue;
    clientEnv[key] = value;
  }
  return clientEnv;
}

/**
 * Compare the two sides of the invariant. Both arguments are RESOLVED values:
 * `null` means "this side resolves the flag as unset", which is a real value
 * (auth ON by default) — not "nothing answered". A server that never answered
 * is handled by the caller, before this is reached.
 *
 * @param {string | null | undefined} live what the running dev server resolved
 * @param {string | null | undefined} next what the next build will resolve
 */
export function compareAuthFlag(live, next) {
  const normalize = (value) => (typeof value === "string" && value !== "" ? value : null);
  const liveValue = normalize(live);
  const nextValue = normalize(next);
  return {
    state: liveValue === nextValue ? "agree" : "mismatch",
    ok: liveValue === nextValue,
    liveValue,
    nextValue,
  };
}

/** How a resolved flag value reads in a report line. */
export function describeFlag(value) {
  return value === null
    ? "unset (auth ON)"
    : `${JSON.stringify(value)} (auth ${authEnabled(value) ? "ON" : "OFF"})`;
}

/** `"false"` is the only value that turns auth off; unset means real sign-in. */
export function authEnabled(value) {
  return value !== "false";
}

/**
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ ok: true, env: Record<string, unknown> } | { ok: false, reason: string }>}
 */
export async function readLiveEnv(url, fetchImpl = fetch) {
  const target = new URL(APP_ENV_ROUTE, url).toString();
  let response;
  try {
    response = await fetchImpl(target, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, reason: `${err?.message ?? err}` };
  }
  if (!response.ok) {
    return { ok: false, reason: `${APP_ENV_ROUTE} answered HTTP ${response.status}` };
  }
  try {
    const body = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, reason: `${APP_ENV_ROUTE} did not answer a JSON object` };
    }
    return { ok: true, env: /** @type {Record<string, unknown>} */ (body) };
  } catch {
    return { ok: false, reason: `${APP_ENV_ROUTE} did not answer JSON` };
  }
}

/** @param {Record<string, unknown>} env */
function flagOf(env) {
  const value = env[AUTH_FLAG];
  return typeof value === "string" ? value : null;
}

const args = parseArgs(process.argv.slice(2));
if (args.error) {
  console.error(`[check:auth] ${args.error}`);
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = projectRoot();
  const nextValue = nextBuildClientEnv(process.env, readAppEnv, root)[AUTH_FLAG] ?? null;
  const live = await readLiveEnv(args.url);

  if (!live.ok) {
    const message =
      `no dev server answered ${args.url}${APP_ENV_ROUTE} (${live.reason}). ` +
      `Next build resolves ${AUTH_FLAG}=${JSON.stringify(nextValue)}.`;
    if (args.json) console.log(JSON.stringify({ ok: !args.requireServer, state: "no-server", message }));
    else console.log(`[check:auth] ${message}`);
    if (args.requireServer) {
      if (!args.json) console.error("[check:auth] --require-server: nothing is listening.");
      process.exit(1);
    }
    process.exit(0);
  }

  const result = compareAuthFlag(flagOf(live.env), nextValue);
  if (args.json) {
    console.log(JSON.stringify({ ...result, url: args.url, appEnvFile: APP_ENV_REL_PATH }));
  } else if (result.state === "mismatch") {
    console.error(
      `[check:auth] MISMATCH — the dev server on ${args.url} resolves ` +
        `${AUTH_FLAG} as ${describeFlag(result.liveValue)} but the next build resolves ` +
        `${describeFlag(result.nextValue)}.\n` +
        `[check:auth] Restart it through the wrapper: npm run dev ` +
        `(which merges ${APP_ENV_REL_PATH}), or set ${AUTH_FLAG} in the real environment.`,
    );
  } else {
    console.log(
      `[check:auth] OK — dev server and next build agree: ` +
        `${AUTH_FLAG} is ${describeFlag(result.liveValue)}.`,
    );
  }
  process.exit(result.ok ? 0 : 1);
}
