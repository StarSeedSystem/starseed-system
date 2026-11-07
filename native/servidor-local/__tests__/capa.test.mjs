/*
 * Pruebas de capa.mjs (CAP1107A · T1) — en seco, sin compilar Next:
 *   node --test native/servidor-local/__tests__/capa.test.mjs
 * Arma una capa de un build de Next de mentira (con rutas largas y no ASCII), la abre con el `tar`
 * del sistema, compara cada archivo con su SHA-256 del manifiesto, comprueba que sale idéntica dos
 * veces y LANZA el servidor extraído como lo haría la app. El lector de Rust se prueba con estas
 * mismas reglas en native/src-tauri/src/servidor_capas_logica.rs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import {
  APP_MINIMA,
  REQUERIDOS,
  aPodar,
  armar,
  cabecerasTar,
  canal,
  canalDe,
  comprobarLista,
  leerArgs,
  nombreArchivo,
  nombreManifiesto,
  problemaDeRuta,
} from "../capa.mjs";

const require = createRequire(import.meta.url);
const { PROTOCOLO } = require("../starseed-arranque.cjs");
const LARGA = `node_modules/${"paquete-con-nombre-largo/".repeat(6)}index.js`;

function escribir(raiz, rel, contenido) {
  const p = path.join(raiz, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contenido);
}

function nextDeMentira(dir, extra = {}) {
  const s = path.join(dir, ".next", "standalone");
  escribir(s, "server.js", 'require("node:http").createServer((q,r)=>r.end("hola")).listen(+process.env.PORT, process.env.HOSTNAME);');
  escribir(s, ".next/BUILD_ID", "Build_de-Mentira1");
  escribir(s, ".next/required-server-files.json", JSON.stringify({ config: { images: { unoptimized: true } } }));
  escribir(s, ".env", "CLAVE=no-debe-viajar");
  escribir(s, LARGA, "module.exports = 1;");
  escribir(s, "node_modules/next/package.json", "{}");
  escribir(dir, ".next/static/chunks/a.js", "x".repeat(70_000));
  escribir(dir, "public/añil.txt", "ñ");
  for (const [rel, c] of Object.entries(extra)) escribir(dir, rel, c);
}

const sha = (b) => createHash("sha256").update(b).digest("hex");

test("argumentos", () => {
  const a = leerArgs(["armar", "--tar", "x.tar", "--salida", "d"]);
  assert.equal(a.appMinima, APP_MINIMA);
  assert.throws(() => leerArgs(["borrar", "--salida", "d"]), /uso/);
  assert.throws(() => leerArgs(["podar", "--salida", "d", "--assets", "a.json"]), /--guardar/);
  assert.equal(leerArgs(["podar", "--salida", "d", "--assets", "a.json", "--guardar", "4"]).guardar, 4);
  assert.throws(() => leerArgs(["armar", "--salida", "d"]), /--tar o --next/);
  assert.throws(() => leerArgs(["armar", "--tar", "a", "--next", "b", "--salida", "d"]), /--tar o --next/);
  assert.throws(() => leerArgs(["armar", "--tar", "a"]), /--salida/);
  assert.throws(() => leerArgs(["armar", "--tar", "a", "--salida", "d", "--app-minima", "0.5"]), /x\.y\.z/);
  assert.throws(() => leerArgs(["canal", "--salida", "d", "--manifiesto", "m"]), /--firma/);
  assert.throws(() => leerArgs(["armar", "--tar"]), /falta el valor/);
});

test("rutas y lista: las mismas reglas que Rust", () => {
  for (const r of ["a/b.js", ".next/BUILD_ID", "public/añil.txt", LARGA]) assert.equal(problemaDeRuta(r), null, r);
  for (const r of ["", "/x", "../x", "a/./b", "a//b", "a\\b", "C:/x", "a.", "a /b", "a/\u0001"]) assert.notEqual(problemaDeRuta(r), null, r);
  const ok = REQUERIDOS.map((ruta) => ({ ruta })).sort((x, y) => Buffer.compare(Buffer.from(x.ruta), Buffer.from(y.ruta)));
  assert.deepEqual(comprobarLista(ok), []);
  const mal = [...ok, { ruta: "Server.js" }].sort((x, y) => Buffer.compare(Buffer.from(x.ruta), Buffer.from(y.ruta)));
  assert.match(comprobarLista(mal).join(" "), /mayúsculas/);
  assert.match(comprobarLista(ok.slice(1)).join(" "), /falta/);
  assert.match(comprobarLista([...ok].reverse()).join(" "), /desordenada/);
  const archivoYCarpeta = [...ok, { ruta: "server.js/x" }].sort((x, y) => Buffer.compare(Buffer.from(x.ruta), Buffer.from(y.ruta)));
  assert.match(comprobarLista(archivoYCarpeta).join(" "), /archivo y carpeta/);
});

test("cabeceras de tar: ustar corto, pax para lo largo o no ASCII, suma de control buena", () => {
  const suma = (c) => {
    let s = 0;
    for (let i = 0; i < 512; i++) s += i >= 148 && i < 156 ? 32 : c[i];
    return s;
  };
  const corta = cabecerasTar("a/b.js", 5);
  assert.equal(corta.length, 512);
  assert.equal(corta.subarray(0, 6).toString(), "a/b.js");
  assert.equal(corta.subarray(257, 263).toString("binary"), "ustar\u0000");
  assert.equal(Number.parseInt(corta.subarray(148, 154).toString(), 8), suma(corta));
  assert.equal(Number.parseInt(corta.subarray(124, 135).toString(), 8), 5);
  for (const r of [LARGA, "public/añil.txt"]) {
    const c = cabecerasTar(r, 3);
    assert.equal(c.length, 512 * 3);
    assert.equal(String.fromCharCode(c[156]), "x");
    const largo = Number.parseInt(c.subarray(124, 135).toString(), 8);
    const pax = c.subarray(512, 512 + largo).toString();
    assert.equal(Buffer.byteLength(pax), largo);
    assert.equal(pax, `${largo} path=${r}\n`);
    assert.equal(Number.parseInt(c.subarray(1024 + 148, 1024 + 154).toString(), 8), suma(c.subarray(1024)));
  }
});

test("canal: https, firma base64 y direcciones de esta capa", () => {
  const m = { build_id: "B1", version: "1", commit: "c", creado_ms: 5, app_minima: "0.5.0", protocolo: 1, archivo: { nombre: nombreArchivo("B1"), bytes: 9, sha256: "a".repeat(64) } };
  const c = canalDe(m, "ZmlybWE=\n", "https://github.com/o/r/releases/download/servidor-local/");
  assert.equal(c.manifiesto, "https://github.com/o/r/releases/download/servidor-local/servidor-capa-B1.json");
  assert.equal(c.archivo, "https://github.com/o/r/releases/download/servidor-local/servidor-capa-B1.tar.gz");
  assert.equal(c.firma, "ZmlybWE=");
  assert.equal(c.bytes, 9);
  assert.throws(() => canalDe(m, "x", "http://inseguro"), /https/);
  assert.throws(() => canalDe(m, "no es base64!", "https://x"), /base64/);
  assert.throws(() => canalDe({ ...m, build_id: "../x" }, "ZQ==", "https://x"), /build_id/);
});

test("poda del canal: se quedan las capas más recientes y el puntero", () => {
  const capa = (b, fecha) => ["tar.gz", "json", "json.sig"].map((x) => ({ name: `servidor-capa-${b}.${x}`, createdAt: fecha }));
  const assets = [
    { name: "latest-servidor.json", createdAt: "2026-11-01T00:00:00Z" },
    ...capa("A", "2026-11-01T00:00:00Z"),
    ...capa("B", "2026-11-03T00:00:00Z"),
    ...capa("C", "2026-11-02T00:00:00Z"),
    { name: "otro.txt", createdAt: "2026-01-01T00:00:00Z" },
  ];
  assert.deepEqual(aPodar(assets, 2), ["servidor-capa-A.json", "servidor-capa-A.json.sig", "servidor-capa-A.tar.gz"]);
  assert.deepEqual(aPodar(assets, 3), []);
  assert.equal(aPodar(assets, 1).length, 6);
});

function puertoLibre() {
  return new Promise((r) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
}

async function saludLista(puerto, tope = 15_000) {
  const fin = Date.now() + tope;
  while (Date.now() < fin) {
    const j = await new Promise((res) => {
      http
        .get({ host: "127.0.0.1", port: puerto, path: "/__starseed/salud" }, (r) => {
          let b = "";
          r.on("data", (x) => (b += x));
          r.on("end", () => {
            try {
              const v = JSON.parse(b);
              res(v.listo ? v : null);
            } catch {
              res(null);
            }
          });
        })
        .on("error", () => res(null));
    });
    if (j) return j;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

test("arma una capa determinista que el tar del sistema abre, que cuadra con su manifiesto y que arranca", { timeout: 90_000 }, async () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "ss-capa-prueba-"));
  try {
    const next = path.join(t, "next");
    nextDeMentira(next);
    const r1 = await armar({ next, salida: path.join(t, "a"), appMinima: "0.5.0", creadoMs: 1_794_000_000_000 });
    const r2 = await armar({ next, salida: path.join(t, "b"), appMinima: "0.5.0", creadoMs: 1_794_000_000_000 });
    assert.equal(r1.buildId, "Build_de-Mentira1");
    assert.equal(path.basename(r1.rutaArchivo), nombreArchivo(r1.buildId));
    assert.equal(path.basename(r1.rutaManifiesto), nombreManifiesto(r1.buildId));
    assert.equal(sha(fs.readFileSync(r1.rutaArchivo)), sha(fs.readFileSync(r2.rutaArchivo)), "la misma entrada da el mismo .tar.gz");

    const m = JSON.parse(fs.readFileSync(r1.rutaManifiesto, "utf8"));
    assert.equal(m.formato, 1);
    assert.equal(m.protocolo, PROTOCOLO);
    assert.equal(m.app_minima, "0.5.0");
    assert.equal(m.node_mayor, 22);
    assert.equal(m.creado_ms, 1_794_000_000_000);
    assert.equal(m.archivo.bytes, fs.statSync(r1.rutaArchivo).size);
    assert.equal(m.archivo.sha256, sha(fs.readFileSync(r1.rutaArchivo)));
    assert.equal(m.total.archivos, m.archivos.length);
    assert.equal(m.total.bytes, m.archivos.reduce((s, a) => s + a[1], 0));
    const rutas = m.archivos.map((a) => a[0]);
    assert.deepEqual(comprobarLista(rutas.map((ruta) => ({ ruta }))), []);
    assert.ok(rutas.includes(LARGA) && rutas.includes("public/añil.txt"));
    assert.ok(!rutas.includes(".env"), "nunca un .env");

    // El tar del sistema la abre y cada archivo casa con su SHA-256.
    const dentro = path.join(t, "dentro");
    fs.mkdirSync(dentro);
    const x = spawnSync("tar", ["-xzf", r1.rutaArchivo, "-C", dentro], { encoding: "utf8" });
    assert.equal(x.status, 0, x.stderr);
    for (const [ruta, bytes, suma] of m.archivos) {
      const d = fs.readFileSync(path.join(dentro, ruta));
      assert.equal(d.length, bytes, ruta);
      assert.equal(sha(d), suma, ruta);
    }
    const propio = JSON.parse(fs.readFileSync(path.join(dentro, "starseed-servidor.json"), "utf8"));
    assert.equal(propio.buildId, r1.buildId);
    assert.equal(propio.plataforma, "capa");
    assert.equal(propio.creadoMs, 1_794_000_000_000);
    assert.equal(propio.protocolo, PROTOCOLO);

    // El puntero del canal con una firma de mentira.
    const sig = path.join(t, "m.sig");
    fs.writeFileSync(sig, "ZmlybWEgZGUgbWVudGlyYQ==\n");
    const c = canal({ manifiesto: r1.rutaManifiesto, firma: sig, base: "https://github.com/o/r/releases/download/servidor-local", salida: path.join(t, "latest-servidor.json") });
    assert.equal(JSON.parse(fs.readFileSync(path.join(t, "latest-servidor.json"), "utf8")).sha256, m.archivo.sha256);
    assert.equal(c.creado_ms, m.creado_ms);

    // La capa extraída arranca como la lanzaría la app (mismo envoltorio, mismo pase).
    const puerto = await puertoLibre();
    const hijo = spawn(process.execPath, ["starseed-arranque.cjs"], {
      cwd: dentro,
      stdio: ["pipe", "ignore", "ignore"],
      env: { ...process.env, STARSEED_PUERTO: String(puerto), STARSEED_FIRMA: "f-capa", HOSTNAME: "127.0.0.1" },
    });
    hijo.stdin.write(`pase:${"7".repeat(64)}\n`);
    try {
      const s = await saludLista(puerto);
      assert.ok(s, "la capa no respondió listo");
      assert.equal(s.firma, "f-capa");
      assert.equal(s.pase, true);
      assert.equal(s.protocolo, PROTOCOLO);
    } finally {
      hijo.stdin.end();
      await new Promise((r) => (hijo.exitCode !== null ? r() : hijo.once("exit", r)));
    }
  } finally {
    fs.rmSync(t, { recursive: true, force: true });
  }
});

test("si la capa no se puede publicar, no deja nada", { skip: process.platform !== "linux" && "en macOS/Windows el disco no distingue mayúsculas" }, async () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "ss-capa-prueba-"));
  try {
    const next = path.join(t, "next");
    nextDeMentira(next, { "public/Logo.svg": "a", "public/logo.svg": "b" });
    await assert.rejects(armar({ next, salida: path.join(t, "out"), appMinima: "0.5.0" }), /mayúsculas/);
    assert.deepEqual(fs.existsSync(path.join(t, "out")) ? fs.readdirSync(path.join(t, "out")) : [], []);
  } finally {
    fs.rmSync(t, { recursive: true, force: true });
  }
});

test("sin BUILD_ID no hay capa", async () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "ss-capa-prueba-"));
  try {
    const next = path.join(t, "next");
    nextDeMentira(next);
    fs.rmSync(path.join(next, ".next", "standalone", ".next", "BUILD_ID"));
    await assert.rejects(armar({ next, salida: path.join(t, "out"), appMinima: "0.5.0" }), /BUILD_ID/);
  } finally {
    fs.rmSync(t, { recursive: true, force: true });
  }
});
