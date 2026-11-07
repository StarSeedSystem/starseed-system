/*
 * Pruebas de preparar.mjs (APP1107A) — en seco, sin compilar Next ni descargar nada:
 *   node --test native/servidor-local/__tests__/preparar.test.mjs
 * Monta un build de Next de mentira, arma el paquete con el Node de esta máquina (--node-local; en
 * macOS además lo firma ad-hoc de verdad), comprueba lo que queda en src-tauri y LANZA el servidor
 * armado como lo haría la app, hasta que responde «listo» con su firma.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { leerArgs, nombresBinario, seCopia, parchearConf, preparar, EXTERNAL_BIN } from "../preparar.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CONF_REAL = path.join(AQUI, "..", "..", "src-tauri", "tauri.conf.json");

test("argumentos", () => {
  const a = leerArgs(["--tar", "x.tar", "--plataforma", "darwin-universal", "--sin-firma"]);
  assert.equal(a.tar, "x.tar");
  assert.equal(a.sinFirma, true);
  assert.throws(() => leerArgs(["--tar", "x", "--plataforma", "solaris"]), /plataforma/);
  assert.throws(() => leerArgs(["--plataforma", "linux-x64"]), /--tar o --next/);
  assert.throws(() => leerArgs(["--tar", "a", "--next", "b", "--plataforma", "linux-x64"]), /--tar o --next/);
  assert.throws(() => leerArgs(["--rara"]), /desconocida/);
});

test("nombres que Tauri busca para el externalBin", () => {
  assert.deepEqual(nombresBinario("darwin-universal"), [
    "starseed-node-universal-apple-darwin",
    "starseed-node-aarch64-apple-darwin",
    "starseed-node-x86_64-apple-darwin",
  ]);
  assert.deepEqual(nombresBinario("win32-x64"), ["starseed-node-x86_64-pc-windows-msvc.exe"]);
  assert.deepEqual(nombresBinario("linux-x64"), ["starseed-node-x86_64-unknown-linux-gnu"]);
});

test("qué se copia: nunca .env ni caché; sharp fuera si las imágenes no se optimizan", () => {
  assert.equal(seCopia(".env", { sinSharp: false }), false);
  assert.equal(seCopia(".env.local", { sinSharp: false }), false);
  assert.equal(seCopia("node_modules/x/.env", { sinSharp: false }), true);
  assert.equal(seCopia(".next/cache/images/a", { sinSharp: false }), false);
  assert.equal(seCopia("node_modules/sharp/lib/a.js", { sinSharp: true }), false);
  assert.equal(seCopia("node_modules/@img/sharp-linux-x64/lib/x.node", { sinSharp: true }), false);
  assert.equal(seCopia("node_modules/sharp/lib/a.js", { sinSharp: false }), true);
  assert.equal(seCopia(".next/server/app/page.js", { sinSharp: true }), true);
});

test("parche de la configuración real de Tauri: añade sin quitar", () => {
  const conf = JSON.parse(fs.readFileSync(CONF_REAL, "utf8"));
  const p = parchearConf(conf);
  assert.deepEqual(p.bundle.resources, { "recursos/servidor/": "servidor/" });
  assert.deepEqual(p.bundle.externalBin, [EXTERNAL_BIN]);
  assert.equal(p.bundle.icon.length, conf.bundle.icon.length);
  assert.equal(conf.bundle.resources, undefined, "no muta el original");
  assert.deepEqual(parchearConf(p).bundle.externalBin, [EXTERNAL_BIN], "idempotente");
  assert.deepEqual(parchearConf({ bundle: { resources: { "a/": "b/" } } }).bundle.resources, { "a/": "b/", "recursos/servidor/": "servidor/" });
  assert.throws(() => parchearConf({ bundle: { resources: ["x"] } }), /lista/);
});

function escribir(raiz, rel, contenido) {
  const p = path.join(raiz, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contenido);
}

function nextDeMentira(dir, { buildId = true } = {}) {
  const s = path.join(dir, ".next", "standalone");
  escribir(s, "server.js", 'require("node:http").createServer((q,r)=>r.end("hola")).listen(+process.env.PORT, process.env.HOSTNAME);');
  if (buildId) escribir(s, ".next/BUILD_ID", "build-de-mentira");
  escribir(s, ".next/required-server-files.json", JSON.stringify({ config: { images: { unoptimized: true } } }));
  escribir(s, ".next/server/app/page.js", "//");
  escribir(s, ".env", "CLAVE=no-debe-viajar");
  escribir(s, ".env.production", "OTRA=tampoco");
  escribir(s, "node_modules/next/package.json", "{}");
  escribir(s, "node_modules/sharp/package.json", "{}");
  escribir(s, "node_modules/@img/sharp-linux-x64/lib/sharp.node", "x");
  escribir(dir, ".next/static/chunks/a.js", "//");
  escribir(dir, "public/logo.svg", "<svg/>");
}

const PLATAFORMA = process.platform === "darwin" ? (process.arch === "arm64" ? "darwin-arm64" : "darwin-x64") : process.platform === "win32" ? "win32-x64" : "linux-x64";

function puertoLibre() {
  return new Promise((r) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
}

test("arma el paquete en seco y el servidor armado arranca", { timeout: 60_000 }, async () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "ss-preparar-prueba-"));
  try {
    const next = path.join(t, "next");
    nextDeMentira(next);
    const srcTauri = path.join(t, "src-tauri");
    fs.mkdirSync(srcTauri);
    const conf = path.join(srcTauri, "tauri.conf.json");
    fs.copyFileSync(CONF_REAL, conf);

    const m = await preparar({ next, plataforma: PLATAFORMA, nodeLocal: process.execPath, srcTauri, conf, sinFirma: false });
    const dest = path.join(srcTauri, "recursos", "servidor");
    for (const f of ["server.js", ".next/BUILD_ID", ".next/static/chunks/a.js", "public/logo.svg", "starseed-arranque.cjs", "starseed-servidor.json", "node_modules/next/package.json"]) {
      assert.ok(fs.existsSync(path.join(dest, f)), `falta ${f}`);
    }
    for (const f of [".env", ".env.production", "node_modules/sharp", "node_modules/@img"]) {
      assert.equal(fs.existsSync(path.join(dest, f)), false, `no debía viajar ${f}`);
    }
    assert.equal(m.imagenes, "sin-optimizar");
    assert.equal(m.buildId, "build-de-mentira");
    assert.equal(JSON.parse(fs.readFileSync(path.join(dest, "starseed-servidor.json"), "utf8")).plataforma, PLATAFORMA);
    const c = JSON.parse(fs.readFileSync(conf, "utf8"));
    assert.deepEqual(c.bundle.externalBin, [EXTERNAL_BIN]);
    assert.deepEqual(c.bundle.resources, { "recursos/servidor/": "servidor/" });

    // El servidor armado, lanzado como lo lanza la app.
    const node = path.join(srcTauri, "binaries", nombresBinario(PLATAFORMA)[0]);
    assert.ok(fs.existsSync(node));
    const puerto = await puertoLibre();
    const hijo = spawn(node, ["starseed-arranque.cjs"], {
      cwd: dest,
      stdio: ["pipe", "ignore", "ignore"],
      env: { ...process.env, STARSEED_PUERTO: String(puerto), STARSEED_FIRMA: "f-prueba", HOSTNAME: "127.0.0.1" },
    });
    try {
      const fin = Date.now() + 15_000;
      let salud = null;
      while (!salud && Date.now() < fin) {
        salud = await new Promise((res) => {
          http.get({ host: "127.0.0.1", port: puerto, path: "/__starseed/salud" }, (r) => {
            let b = "";
            r.on("data", (x) => (b += x));
            r.on("end", () => {
              try {
                const j = JSON.parse(b);
                res(j.listo ? j : null);
              } catch {
                res(null);
              }
            });
          }).on("error", () => res(null));
        });
        if (!salud) await new Promise((r) => setTimeout(r, 150));
      }
      assert.ok(salud, "el servidor armado no respondió listo");
      assert.equal(salud.firma, "f-prueba");
    } finally {
      hijo.stdin.end();
      await new Promise((r) => (hijo.exitCode !== null ? r() : hijo.once("exit", r)));
    }
  } finally {
    fs.rmSync(t, { recursive: true, force: true });
  }
});

test("si falta el build, no deja nada a medias ni toca la configuración", async () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "ss-preparar-prueba-"));
  try {
    const next = path.join(t, "next");
    nextDeMentira(next, { buildId: false });
    const srcTauri = path.join(t, "src-tauri");
    fs.mkdirSync(srcTauri);
    const conf = path.join(srcTauri, "tauri.conf.json");
    fs.copyFileSync(CONF_REAL, conf);
    const antes = fs.readFileSync(conf, "utf8");
    await assert.rejects(preparar({ next, plataforma: PLATAFORMA, nodeLocal: process.execPath, srcTauri, conf, sinFirma: true }), /BUILD_ID/);
    assert.equal(fs.readFileSync(conf, "utf8"), antes);
    assert.equal(fs.existsSync(path.join(srcTauri, "recursos", "servidor")), false);
    assert.equal(fs.existsSync(path.join(srcTauri, "binaries", nombresBinario(PLATAFORMA)[0])), false);
  } finally {
    fs.rmSync(t, { recursive: true, force: true });
  }
});
