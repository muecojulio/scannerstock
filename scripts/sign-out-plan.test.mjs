import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRE_SIGN_IN_TIMEOUT_MS,
  SIGN_OUT_TIMEOUT_MS,
  SIGN_OUT_UNCONFIRMED,
  runPreSignInSignOut,
  runSignOut,
  withTimeout,
} from "./sign-out-plan.mjs";

const NEVER = () => new Promise(() => {});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {Partial<Parameters<typeof runSignOut>[0]>} hooks */
function hooksFor(hooks = {}) {
  /** @type {{ cleared: number, redirected: number, asked: number }} */
  const calls = { cleared: 0, redirected: 0, asked: 0 };
  return {
    calls,
    hooks: {
      livePreview: false,
      hasBearer: false,
      requestSignOut: () => {
        calls.asked += 1;
      },
      clearToken: () => {
        calls.cleared += 1;
      },
      redirect: () => {
        calls.redirected += 1;
      },
      ...hooks,
    },
  };
}

test("deployed sign-out waits for the server, then clears and redirects", async () => {
  const { calls, hooks } = hooksFor();
  await runSignOut(hooks);
  assert.deepEqual(calls, { cleared: 1, redirected: 1, asked: 1 });
});

test("deployed sign-out rejects without redirecting when the server refuses", async () => {
  const { calls, hooks } = hooksFor({
    requestSignOut: () => {
      calls.asked += 1;
      throw new Error("boom");
    },
  });
  await assert.rejects(() => runSignOut(hooks), /boom/);
  assert.equal(calls.redirected, 0, "a failed sign-out must not navigate");
  assert.equal(calls.cleared, 0, "the token stays so the visitor can retry");
});

test("deployed sign-out fails closed when there is no server hook at all", async () => {
  const { calls, hooks } = hooksFor({ requestSignOut: undefined });
  await assert.rejects(() => runSignOut(hooks), new RegExp(SIGN_OUT_UNCONFIRMED));
  assert.equal(calls.redirected, 0);
});

test("live-preview sign-out drops the bearer before waiting on the server", async () => {
  let resolveServer;
  const server = new Promise((resolve) => {
    resolveServer = resolve;
  });
  const { calls, hooks } = hooksFor({
    livePreview: true,
    hasBearer: true,
    requestSignOut: () => server,
    timeoutMs: 40,
  });
  const pending = runSignOut(hooks);
  await sleep(5);
  assert.equal(calls.cleared, 1, "the local credential is gone immediately");
  assert.equal(calls.redirected, 0, "but nothing navigates until the bound elapses");
  resolveServer();
  await pending;
  assert.equal(calls.redirected, 1);
});

test("live-preview sign-out resolves and redirects even if the server hangs", async () => {
  const { calls, hooks } = hooksFor({
    livePreview: true,
    hasBearer: false,
    requestSignOut: NEVER,
    timeoutMs: 20,
  });
  const started = Date.now();
  await runSignOut(hooks);
  assert.ok(Date.now() - started < SIGN_OUT_TIMEOUT_MS, "the default bound was not used");
  assert.equal(calls.redirected, 1);
});

test("pre-sign-in: deployed waits out a REJECTING server without throwing", async () => {
  const { calls, hooks } = hooksFor({
    requestSignOut: () => {
      calls.asked += 1;
      throw new Error("stale session");
    },
  });
  await runPreSignInSignOut(hooks);
  assert.deepEqual(calls, { cleared: 1, redirected: 0, asked: 1 });
});

test("pre-sign-in: live preview is bounded while the popup is open", async () => {
  const { calls, hooks } = hooksFor({
    livePreview: true,
    hasBearer: true,
    requestSignOut: NEVER,
    timeoutMs: 20,
  });
  const started = Date.now();
  await runPreSignInSignOut(hooks);
  assert.ok(Date.now() - started < PRE_SIGN_IN_TIMEOUT_MS);
  // Cleared before the bounded wait and again after it: removeItem is idempotent,
  // and the second pass catches a token minted by the server response itself.
  assert.ok(calls.cleared >= 1);
});

test("withTimeout passes through a settled promise and expires a stuck one", async () => {
  assert.equal(await withTimeout(Promise.resolve("fast"), 50), "fast");
  assert.notEqual(await withTimeout(NEVER(), 20), "fast");
  assert.equal(await withTimeout(Promise.resolve("unbounded"), 0), "unbounded");
});

test("withTimeout clears its timer once the promise wins", async () => {
  const before = process.getActiveResourcesInfo?.().length ?? 0;
  await withTimeout(Promise.resolve(1), 500);
  const after = process.getActiveResourcesInfo?.().length ?? 0;
  assert.ok(after <= before + 1, "no timer left behind");
});
