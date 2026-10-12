import assert from "node:assert/strict";
import { test } from "node:test";
import { securityHeaders, withSecurityHeaders } from "./security-headers.ts";

test("CSP: bloquea todo lo que la app no necesita", () => {
  const csp = securityHeaders()["content-security-policy"];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
  // Nada de fuentes de script externas salvo la de la plataforma.
  const scriptSrc = csp.split(";").find((part) => part.trim().startsWith("script-src")) ?? "";
  assert.ok(scriptSrc.includes("'self'"));
  assert.ok(!/\*/.test(scriptSrc), "script-src no debe llevar comodines");
});

test("CSP: frame-ancestors permite el preview y no usa comodín suelto", () => {
  const csp = securityHeaders()["content-security-policy"];
  const frame = csp.split(";").find((part) => part.trim().startsWith("frame-ancestors")) ?? "";
  assert.match(frame, /frame-ancestors 'self'/);
  assert.match(frame, /https:\/\/\*\.e2b\.app/);
  assert.ok(!frame.includes(" * "), "frame-ancestors no puede ser un comodín total");
});

test("CSP: frame-ancestors se abre en dev porque el host del preview cambia", () => {
  const dev = securityHeaders({ dev: true })["content-security-policy"];
  assert.match(dev, /frame-ancestors \*/);
  assert.ok(!securityHeaders({ dev: false })["content-security-policy"].includes("frame-ancestors *"));
});

test("HSTS y upgrade-insecure-requests solo sobre HTTPS", () => {
  assert.ok(!("strict-transport-security" in securityHeaders({ secure: false })));
  assert.ok(!securityHeaders({ secure: false })["content-security-policy"].includes("upgrade-insecure-requests"));
  assert.equal(
    securityHeaders({ secure: true })["strict-transport-security"],
    "max-age=31536000; includeSubDomains",
  );
  assert.match(securityHeaders({ secure: true })["content-security-policy"], /upgrade-insecure-requests/);
});

test("en desarrollo se permite el WebSocket de HMR de Vite", () => {
  const csp = securityHeaders({ dev: true })["content-security-policy"];
  assert.match(csp, /connect-src 'self' https:\/\/grok\.com ws: wss:/);
  assert.ok(!securityHeaders({ dev: false })["content-security-policy"].includes(" ws:"));
});

test("cabeceras básicas de endurecimiento presentes", () => {
  const headers = securityHeaders();
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(headers["cross-origin-opener-policy"], "same-origin");
  assert.match(headers["permissions-policy"], /camera=\(\)/);
  assert.match(headers["permissions-policy"], /microphone=\(\)/);
  assert.match(headers["permissions-policy"], /geolocation=\(\)/);
  // No se fija Cache-Control aquí: lo decide cada ruta.
  assert.ok(!("cache-control" in headers));
});

test("withSecurityHeaders conserva cuerpo y estado, y fija la política", async () => {
  const original = new Response("hola", {
    status: 201,
    headers: { "content-type": "text/plain", "content-security-policy": "default-src *" },
  });
  const hardened = withSecurityHeaders(original, { secure: true });
  assert.equal(hardened.status, 201);
  assert.equal(await hardened.text(), "hola");
  assert.equal(hardened.headers.get("content-type"), "text/plain");
  assert.ok(hardened.headers.get("content-security-policy")?.includes("default-src 'self'"));
  assert.ok(!hardened.headers.get("content-security-policy")?.includes("default-src *"));
  assert.equal(hardened.headers.get("x-content-type-options"), "nosniff");
});
