import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanHostHeader,
  isLocalHost,
  normalizeOrigin,
  originFromHost,
  resolvePublicOrigin,
  sharedAppUrl,
} from "./public-url.ts";

test("la cabecera de host se limpia y se valida antes de usarla", () => {
  assert.equal(cleanHostHeader("ScannerStock.EXAMPLE"), "scannerstock.example");
  assert.equal(cleanHostHeader("8080-abc123.e2b.app, proxy.interno"), "8080-abc123.e2b.app");
  assert.equal(cleanHostHeader("localhost:8080"), "localhost:8080");
  assert.equal(cleanHostHeader("  ejemplo.com  "), "ejemplo.com");
});

test("una cabecera rara no se cuela en el QR", () => {
  assert.equal(cleanHostHeader(""), "");
  assert.equal(cleanHostHeader(null), "");
  assert.equal(cleanHostHeader("ejemplo.com/ruta"), "");
  assert.equal(cleanHostHeader("ejemplo com"), "");
  assert.equal(cleanHostHeader("javascript:alert(1)"), "");
  assert.equal(cleanHostHeader("<script>alert(1)</script>"), "");
  assert.equal(cleanHostHeader("-empieza-mal.com"), "");
});

test("local e IP se distinguen del dominio público", () => {
  assert.equal(isLocalHost("localhost:8080"), true);
  assert.equal(isLocalHost("127.0.0.1"), true);
  assert.equal(isLocalHost("192.168.1.20:3000"), true);
  assert.equal(isLocalHost("scannerstock.example"), false);
});

test("el protocolo por defecto depende del destino", () => {
  assert.equal(originFromHost("scannerstock.example"), "https://scannerstock.example");
  assert.equal(originFromHost("localhost:8080"), "http://localhost:8080");
  assert.equal(originFromHost("scannerstock.example", "http"), "http://scannerstock.example");
  assert.equal(originFromHost("localhost:8080", "https"), "https://localhost:8080");
  assert.equal(originFromHost(""), "");
});

test("el host publicado manda sobre la cabecera de la petición", () => {
  assert.equal(
    resolvePublicOrigin({
      envHostname: "scannerstock.example",
      requestHost: "interno.local:3000",
      requestProto: "http",
    }),
    "https://scannerstock.example",
  );
});

test("sin host publicado se usa el de la petición con su protocolo", () => {
  assert.equal(
    resolvePublicOrigin({ requestHost: "8080-abc123.e2b.app", requestProto: "https" }),
    "https://8080-abc123.e2b.app",
  );
  assert.equal(resolvePublicOrigin({ requestHost: "localhost:8080", requestProto: "http" }), "http://localhost:8080");
});

test("si el servidor no resuelve, se acepta el origen del navegador", () => {
  assert.equal(resolvePublicOrigin({ browserOrigin: "https://scannerstock.example/ruta" }), "https://scannerstock.example");
  assert.equal(resolvePublicOrigin({ browserOrigin: "no-es-una-url" }), "");
  assert.equal(resolvePublicOrigin({ browserOrigin: "file:///tmp/informe.html" }), "");
  assert.equal(resolvePublicOrigin({}), "");
});

test("un host publicado inválido no bloquea la resolución por cabecera", () => {
  assert.equal(
    resolvePublicOrigin({ envHostname: "sin puntos", requestHost: "scannerstock.example" }),
    "https://scannerstock.example",
  );
});

test("normalizar un origen se queda solo con el origen", () => {
  assert.equal(normalizeOrigin("https://scannerstock.example/qr?x=1#y"), "https://scannerstock.example");
  assert.equal(normalizeOrigin("http://localhost:8080/preview/"), "http://localhost:8080");
  assert.equal(normalizeOrigin("  "), "");
});

test("el enlace compartido lleva una sola barra final", () => {
  assert.equal(sharedAppUrl("https://scannerstock.example"), "https://scannerstock.example/");
  assert.equal(sharedAppUrl("https://scannerstock.example///"), "https://scannerstock.example/");
  assert.equal(sharedAppUrl("http://localhost:8080"), "http://localhost:8080/");
  assert.equal(sharedAppUrl(""), "");
});
