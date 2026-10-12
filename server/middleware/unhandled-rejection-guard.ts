/**
 * Keep the serverless process alive when a third-party module leaks an
 * unhandled promise rejection.
 *
 * Node ≥15 exits the process on an unhandled rejection. On a long-running
 * server that is a loud, debuggable crash; on a Vercel function it is a TOTAL
 * outage — the one Lambda instance serving every route dies, so even pages
 * that never touch the failing code 500 until a cold start.
 *
 * This is not hypothetical here: `@electric-sql/pglite` (the no-DATABASE_URL
 * fallback, see `src/lib/db.ts`) rejects internally when its `pglite.data`
 * binary is missing, and that rejection is uncatchable from app code — the
 * caller can await and catch `waitReady` and the internal promise still
 * rejects on its own. `scripts/copy-runtime-assets.mjs` ships the binaries so
 * the condition cannot occur in a correct build; this guard means a regression
 * there degrades the database path instead of the whole deployment.
 *
 * Installed at MODULE scope: Nitro imports every `server/middleware/*` module
 * when the function boots, i.e. before any route, loader or server function can
 * pull in `@/lib/db`. The install is idempotent across HMR / module reloads.
 */
const guardRef = globalThis as typeof globalThis & {
  __unhandledRejectionGuardInstalled__?: boolean;
};

if (!guardRef.__unhandledRejectionGuardInstalled__) {
  guardRef.__unhandledRejectionGuardInstalled__ = true;
  process.on("unhandledRejection", (reason) => {
    // Log with full detail: swallowing the crash must not swallow the evidence.
    console.error("[server] unhandled promise rejection (process kept alive):", reason);
  });
}

interface GuardEvent {
  url: URL;
}

export default function unhandledRejectionGuard(
  _event: GuardEvent,
  next: () => unknown | Promise<unknown>,
): unknown {
  return next();
}
