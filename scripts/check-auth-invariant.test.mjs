import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUTH_FLAG,
  compareAuthFlag,
  describeFlag,
  nextBuildClientEnv,
  parseArgs,
  readLiveEnv,
} from "./check-auth-invariant.mjs";

test("parseArgs defaults and flags", () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.url, "http://127.0.0.1:8080");
  assert.equal(defaults.requireServer, false);
  assert.equal(defaults.json, false);
  assert.equal(parseArgs(["--require-server", "--json"]).requireServer, true);
  assert.equal(parseArgs(["--url", "http://x:1"]).url, "http://x:1");
  assert.equal(parseArgs(["--url=http://x:1"]).url, "http://x:1");
  assert.match(String(parseArgs(["--bogus"]).error), /unexpected argument/);
});

test("compareAuthFlag treats unset as a real, comparable value", () => {
  assert.equal(compareAuthFlag(null, null).state, "agree");
  assert.equal(compareAuthFlag(undefined, undefined).state, "agree");
  assert.equal(compareAuthFlag("false", "false").state, "agree");
  assert.equal(compareAuthFlag("", null).state, "agree", "empty string reads as unset");
  // The case the whole check exists for: one side has the flag, the other not.
  assert.equal(compareAuthFlag(null, "false").state, "mismatch");
  assert.equal(compareAuthFlag("true", null).state, "mismatch");
  assert.equal(compareAuthFlag(null, "false").ok, false);
});

test("describeFlag names the effective auth state", () => {
  assert.equal(describeFlag(null), "unset (auth ON)");
  assert.equal(describeFlag("false"), '"false" (auth OFF)');
  assert.equal(describeFlag("true"), '"true" (auth ON)');
});

test("nextBuildClientEnv lets the real environment win over the app-env file", () => {
  const read = () => ({ VITE_AUTH_ENABLED: "false", VITE_OTHER: "from-file", NOPE: "x" });
  const fromFile = nextBuildClientEnv({}, read, "/tmp");
  assert.equal(fromFile[AUTH_FLAG], "false");
  assert.equal(fromFile.VITE_OTHER, "from-file");
  assert.equal("NOPE" in fromFile, false, "non-VITE keys never reach the client env");

  const overridden = nextBuildClientEnv({ VITE_AUTH_ENABLED: "true" }, read, "/tmp");
  assert.equal(overridden[AUTH_FLAG], "true");
});

test("readLiveEnv reports a dead server as a reason, not a throw", async () => {
  const result = await readLiveEnv("http://127.0.0.1:9");
  assert.equal(result.ok, false);
  assert.match(result.reason, /fetch failed|ECONNREFUSED/);
});

test("readLiveEnv rejects a non-JSON answer", async () => {
  const result = await readLiveEnv("http://127.0.0.1:9", async () => ({
    ok: true,
    status: 200,
    json: async () => "not-an-object",
  }));
  assert.equal(result.ok, false);
  assert.match(result.reason, /JSON object/);
});
