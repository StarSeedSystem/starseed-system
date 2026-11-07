/*
 * Pruebas del envoltorio en modo Android (AND1107A): Node DENTRO del proceso de la app (nodejs-mobile).
 *   node --test native/servidor-local/__tests__/arranque-android.test.cjs
 * Lo que cambia con STARSEED_EN_PROCESO=1: el pase llega por una tubería propia (STARSEED_ENTRADA_FD,
 * como la escribe servidor_local_android.rs), no se vigila la entrada estándar, y process.exit no
 * mata el proceso (en Android mataría la app entera): cierra la puerta. De punta a punta con un
 * «standalone de mentira», como arranque.test.cjs.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");

const ORIGEN = path.join(__dirname, "..", "starseed-arranque.cjs");
const A = require(ORIGEN);

test("config: modo en proceso y descriptor del pase", () => {
  const c = A.leerConfig({ STARSEED_EN_PROCESO: "1", STARSEED_ENTRADA_FD: "7", STARSEED_VIGIA_PADRE: "0" });
  assert.equal(c.enProceso, true);
  assert.equal(c.fdEntrada, 7);
  assert.equal(c.vigiaPadre, false);
  const d = A.leerConfig({});
  assert.equal(d.enProceso, false, "escritorio: nada cambia");
  assert.equal(d.fdEntrada, null);
  for (const malo of ["0", "1", "2", "-3", "3.5", "x", "", " ", "9999999"]) assert.equal(A.fdValido(malo), null, malo);
  assert.equal(A.fdValido(" 12 "), 12);
});

test("process.exit dentro de la app: no sale, cierra la puerta y registra", () => {
  const proc = new EventEmitter();
  let salio = false;
  proc.exit = () => {
    salio = true;
  };
  const avisos = [];
  const cierres = [];
  const original = A.protegerSalidaEnProceso(proc, (c) => cierres.push(c), (...a) => avisos.push(a.join(" ")));
  assert.equal(typeof original, "function");
  proc.exit(1);
  proc.exit();
  assert.equal(salio, false);
  assert.deepEqual(cierres, [1, 1], "sin código, el último exitCode");
  assert.equal(proc.exitCode, 1);
  assert.match(avisos[0], /process\.exit\(1\) ignorado/);
  proc.emit("uncaughtException", new Error("boom"));
  assert.match(avisos.at(-1), /error sin capturar \(la app sigue\)/);
});

// ───────────────────────── De punta a punta ─────────────────────────

function puertoLibre() {
  return new Promise((r) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
}

function pedir(puerto, ruta, opciones = {}) {
  return new Promise((resolve, reject) => {
    const p = http.request({ host: "127.0.0.1", port: puerto, path: ruta, method: opciones.method || "GET", headers: opciones.headers || {} }, (r) => {
      const t = [];
      r.on("data", (c) => t.push(c));
      r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(t).toString("utf8") }));
    });
    p.on("error", reject);
    p.end(opciones.body);
  });
}

async function esperar(cond, ms = 10_000) {
  const fin = Date.now() + ms;
  for (;;) {
    try {
      const v = await cond();
      if (v) return v;
    } catch {}
    if (Date.now() > fin) throw new Error("tiempo agotado");
    await new Promise((r) => setTimeout(r, 100));
  }
}

// «Next» de mentira: dice qué entorno ve y, en /salir, hace lo que haría un Next que se rinde.
const SERVIDOR_DE_MENTIRA = `
const http = require("node:http");
const s = http.createServer((req, res) => {
  if (req.url === "/api/salir") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
    setTimeout(() => process.exit(1), 50);
    return;
  }
  if (req.url === "/api/lanzar") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
    setTimeout(() => { throw new Error("error de prueba sin capturar"); }, 10);
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    quien: "next-local", ruta: req.url, cookie: req.headers.cookie || null,
    fdEnEntorno: "STARSEED_ENTRADA_FD" in process.env,
    paseEnEntorno: Object.keys(process.env).some((k) => /PASE/.test(k)),
  }));
});
s.listen(Number(process.env.PORT), process.env.HOSTNAME);
`;

const PASE = "0123456789abcdef".repeat(4);

test("de punta a punta en modo Android: pase por tubería, sin vigía y sin process.exit", { timeout: 30_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-arranque-android-"));
  fs.writeFileSync(path.join(dir, "server.js"), SERVIDOR_DE_MENTIRA);
  fs.copyFileSync(ORIGEN, path.join(dir, "starseed-arranque.cjs"));
  fs.copyFileSync(path.join(__dirname, "..", "guarda.cjs"), path.join(dir, "guarda.cjs"));
  const puerto = await puertoLibre();
  const puertoWeb = await puertoLibre(); // nadie escucha: «sin internet»
  const env = {
    ...process.env,
    STARSEED_PUERTO: String(puerto),
    STARSEED_FIRMA: "firma-android",
    STARSEED_WEB_PUBLICADA: `http://127.0.0.1:${puertoWeb}`,
    STARSEED_PAUSA_RED_MS: "300",
    STARSEED_EN_PROCESO: "1",
    STARSEED_VIGIA_PADRE: "0",
    STARSEED_ENTRADA_FD: "3",
  };
  delete env.STARSEED_PASE_VENTANA;
  // Como Rust en Android: entrada estándar SIN nada (la de la app) y el pase por el descriptor 3, que
  // se escribe y se cierra enseguida.
  const hijo = spawn(process.execPath, ["starseed-arranque.cjs"], { cwd: dir, stdio: ["ignore", "pipe", "pipe", "pipe"], env });
  hijo.stdio[3].end(`pase:${PASE}\n`);
  let salida = "";
  hijo.stdout.on("data", (c) => (salida += c));
  hijo.stderr.on("data", (c) => (salida += c));
  let termino = null;
  hijo.on("exit", (c) => (termino = c));
  try {
    const salud = await esperar(async () => {
      const j = JSON.parse((await pedir(puerto, "/__starseed/salud")).body);
      return j.listo && j.interna !== "comprobando" ? j : null;
    });
    assert.equal(salud.firma, "firma-android");
    assert.equal(salud.pase, true, "el pase llegó por la tubería");
    assert.equal(salud.interna, "protegida");
    // Con la entrada estándar cerrada desde el principio, NO sale (no hay padre que vigilar).
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(termino, null, "sigue vivo sin entrada estándar");

    const ent = await pedir(puerto, `/__starseed/entrar?t=${PASE}&a=%2F`, { headers: { "sec-fetch-site": "none", "sec-fetch-mode": "navigate" } });
    assert.equal(ent.status, 303);
    const LOCAL = `http://127.0.0.1:${puerto}`;
    const propio = { origin: LOCAL, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", cookie: `starseed_pase=${PASE}` };
    const api = JSON.parse((await pedir(puerto, "/api/hola", { headers: propio })).body);
    assert.equal(api.quien, "next-local");
    assert.equal(api.fdEnEntorno, false, "Next no ve el descriptor del pase");
    assert.equal(api.paseEnEntorno, false);
    assert.equal((await pedir(puerto, "/api/hola")).status, 403, "sin pase, nada");

    // Un error sin capturar en «Next»: se registra y el servidor sigue.
    await pedir(puerto, "/api/lanzar", { headers: propio });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(termino, null, "un error sin capturar no tumba la app");
    assert.equal((await pedir(puerto, "/__starseed/salud")).status, 200);
    assert.match(salida, /error sin capturar \(la app sigue\)/);

    // «Next» llama a process.exit(1): el proceso (la app) sigue vivo y la puerta se cierra.
    await pedir(puerto, "/api/salir", { headers: propio });
    await esperar(async () => {
      try {
        await pedir(puerto, "/__starseed/salud");
        return false;
      } catch (e) {
        return e.code === "ECONNREFUSED";
      }
    });
    assert.equal(termino, null, "process.exit no mató el proceso");
    assert.match(salida, /process\.exit\(1\) ignorado/);
    assert.ok(!salida.includes(PASE), "el pase no sale en el registro");
  } finally {
    hijo.kill("SIGKILL");
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("modo Android sin STARSEED_PUERTO: termina solo, sin process.exit", { timeout: 10_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-arranque-android-"));
  fs.copyFileSync(ORIGEN, path.join(dir, "starseed-arranque.cjs"));
  fs.copyFileSync(path.join(__dirname, "..", "guarda.cjs"), path.join(dir, "guarda.cjs"));
  const env = { ...process.env, STARSEED_EN_PROCESO: "1", STARSEED_VIGIA_PADRE: "0" };
  delete env.STARSEED_PUERTO;
  const hijo = spawn(process.execPath, ["starseed-arranque.cjs"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"], env });
  let salida = "";
  hijo.stderr.on("data", (c) => (salida += c));
  const codigo = await new Promise((r) => hijo.on("exit", r));
  assert.equal(codigo, 0, "el bucle se vacía y node::Start volvería: la app no muere");
  assert.match(salida, /falta STARSEED_PUERTO/);
  fs.rmSync(dir, { recursive: true, force: true });
});
