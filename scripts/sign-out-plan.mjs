// @ts-check
/**
 * Sign-out sequencing for `src/lib/auth/client.ts`, split out of the browser
 * module so the ordering rules are unit-testable in plain Node.
 *
 * Two callers, two different contracts:
 *
 * - `runPreSignInSignOut` clears whatever session exists BEFORE a new OAuth
 *   round-trip starts, so switching provider actually switches identity. It is
 *   best-effort and never rejects — a stale session must not block sign-in. In
 *   the live preview the sign-in popup is already open, so the server request
 *   is bounded; deployed there is nothing else pending and only the server can
 *   clear an HttpOnly cookie, so it waits for the full round-trip.
 * - `runSignOut` is the visitor-facing sign-out. It redirects once the session
 *   is gone and, when deployed, REJECTS without redirecting if the server never
 *   confirms — redirecting anyway would report a sign-out that did not happen.
 *   In the live preview dropping the local bearer token is sufficient, so it
 *   always resolves.
 *
 * Keep this module dependency-free: it is bundled into the browser build.
 */

/** Bound for the pre-sign-in clear, during which the popup is already open. */
export const PRE_SIGN_IN_TIMEOUT_MS = 1500;

/** Bound for the visitor-facing sign-out in the live preview. */
export const SIGN_OUT_TIMEOUT_MS = 5000;

/** Message when a deployed sign-out gets no confirmation from the server. */
export const SIGN_OUT_UNCONFIRMED = "sign_out_unconfirmed";

/** Distinguishes "the request never settled" from a settled failure. */
const TIMED_OUT = Symbol("sign-out-plan:timed-out");

/**
 * @typedef {Object} PreSignInInput
 * @property {boolean} livePreview running inside the `*.grok-sandbox.com` iframe
 * @property {boolean} hasBearer a preview bearer token is stored locally
 * @property {() => unknown} requestSignOut the server round-trip that ends the session
 * @property {() => void} clearToken drop the locally stored bearer token
 * @property {number} [timeoutMs] preview-only bound on `requestSignOut`
 */

/**
 * @typedef {Object} SignOutInput
 * @property {boolean} livePreview running inside the `*.grok-sandbox.com` iframe
 * @property {boolean} hasBearer a preview bearer token is stored locally
 * @property {() => unknown} requestSignOut the server round-trip that ends the session
 * @property {() => void} clearToken drop the locally stored bearer token
 * @property {() => void} redirect navigate once the session is gone
 * @property {number} [timeoutMs] preview-only bound on `requestSignOut`
 */

/**
 * @typedef {{ ok: true } | { ok: false, error?: unknown }} ServerAttempt
 */

/**
 * Resolve with `promise`'s outcome, or with `TIMED_OUT` once `ms` elapses.
 *
 * Never leaves an unhandled branch behind: the timer is cleared whichever side
 * wins, and callers pass an already-caught promise (see `askServer`), so the
 * losing request settling later cannot reject into nothing.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T | symbol>}
 */
export function withTimeout(promise, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {Promise<symbol>} */
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Run the server request, turning a throw/rejection into a value so "did the
 * server confirm?" is something a caller can branch on instead of a control-flow
 * exception. A missing hook reads as "not confirmed" — fail closed.
 *
 * @param {(() => unknown) | undefined} requestSignOut
 * @returns {Promise<ServerAttempt>}
 */
function askServer(requestSignOut) {
  if (typeof requestSignOut !== "function") return Promise.resolve({ ok: false });
  /** @type {Promise<ServerAttempt>} */
  const attempt = Promise.resolve()
    .then(() => requestSignOut())
    .then(
      () => ({ ok: true }),
      (error) => ({ ok: false, error }),
    );
  return attempt;
}

/**
 * Clear any prior session before a NEW OAuth round-trip starts, so switching
 * provider actually switches identity instead of silently reusing the broker
 * session that is already live.
 *
 * Never rejects: a stale or unreachable session must not block sign-in. The
 * local bearer token is dropped on every path, including a timeout.
 *
 * @param {PreSignInInput} input
 * @returns {Promise<void>}
 */
export async function runPreSignInSignOut({
  livePreview,
  hasBearer,
  requestSignOut,
  clearToken,
  timeoutMs = PRE_SIGN_IN_TIMEOUT_MS,
}) {
  const clear = () => {
    if (typeof clearToken === "function") clearToken();
  };

  if (!livePreview) {
    // Deployed: the session is an HttpOnly cookie that ONLY the server can
    // clear, and nothing else is pending — so wait for the whole round-trip.
    // Cutting it short would start OAuth with the old identity still signed in,
    // which is exactly what this call exists to prevent.
    await askServer(requestSignOut);
    clear();
    return;
  }

  // Live preview: `signIn` opened the popup SYNCHRONOUSLY on the user gesture,
  // so it is already waiting. A request that never settles would leave it
  // hanging — bound it, and drop the local token regardless.
  if (hasBearer) clear();
  await withTimeout(askServer(requestSignOut), timeoutMs);
  clear();
}

/**
 * Sign out of this app's session, clear the preview token, then redirect.
 *
 * Rejects (and does NOT redirect) when deployed and the server never confirms;
 * always resolves in the live preview, where the local bearer token is the
 * credential the iframe can present.
 *
 * @param {SignOutInput} input
 * @returns {Promise<void>}
 */
export async function runSignOut({
  livePreview,
  hasBearer,
  requestSignOut,
  clearToken,
  redirect,
  timeoutMs = SIGN_OUT_TIMEOUT_MS,
}) {
  const clear = () => {
    if (typeof clearToken === "function") clearToken();
  };
  const go = () => {
    if (typeof redirect === "function") redirect();
  };

  if (!livePreview) {
    const attempt = await askServer(requestSignOut);
    if (!attempt.ok) {
      // Leave the token and the current page alone: reporting a sign-out that
      // did not happen is worse than an error the UI can offer a retry for.
      throw attempt.error instanceof Error
        ? attempt.error
        : new Error(SIGN_OUT_UNCONFIRMED);
    }
    clear();
    go();
    return;
  }

  if (hasBearer) clear();
  await withTimeout(askServer(requestSignOut), timeoutMs);
  clear();
  go();
}
