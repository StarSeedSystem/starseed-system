/*
 * DIR1125D · el servidor de una capa sirve también los estáticos con huella de las capas guardadas junto a ella.
 * Sin esto, una página de la capa anterior (la copia guardada que entra si la recarga del relevo tarda) pide scripts que
 * la capa nueva ya no tiene y se queda sin ellos. Lógica pura + de punta a punta con un «Next de mentira» que da 404.
 *   node --test native/servidor-local/__tests__/
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const { spawn } = require("node:child_process");

const ORIGEN = path.join(__dirname, "..", "starseed-arranque.cjs");
const A = require(ORIGEN);

function montarCapas() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ss-capas-"));
  const nueva = path.join(base, "capaNueva_0001");
  const vieja = path.join(base, "capaVieja_0001");
  const masVieja = path.join(base, "capaMasVieja_01");
  for (const c of [nueva, vieja, masVieja]) fs.mkdirSync(path.join(c, ".next", "static", "chunks"), { recursive: true });
  fs.mkdirSync(path.join(vieja, ".next", "server"), { recursive: true });
  fs.mkdirSync(path.join(base, "descargas"));
  fs.writeFileSync(path.join(nueva, ".next", "static", "chunks", "solo-nueva.js"), "/*nueva*/");
  fs.writeFileSync(path.join(vieja, ".next", "static", "chunks", "webpack-vieja.js"), "/*vieja*/");
  fs.writeFileSync(path.join(masVieja, ".next", "static", "chunks", "webpack-vieja.js"), "/*mas-vieja*/");
  fs.writeFileSync(path.join(masVieja, ".next", "static", "chunks", "solo-mas-vieja.js"), "/*solo*/");
  fs.writeFileSync(path.join(vieja, ".next", "server", "app.js"), "secreto del servidor");
  fs.writeFileSync(path.join(vieja, "secreto.txt"), "no-debe-salir");
  fs.symlinkSync(path.join(vieja, "secreto.txt"), path.join(vieja, ".next", "static", "chunks", "enlace.js"));
  const ayer = new Date(Date.now() - 86_400_000);
  fs.utimesSync(masVieja, ayer, ayer);
  return { base, nueva, vieja, masVieja };
}

test("rutaEstaticoNext: solo GET/HEAD de /_next/static/** con nombres corrientes", () => {
  assert.equal(A.rutaEstaticoNext("GET", "/_next/static/chunks/webpack-8272b4f193eb72cb.js"), "chunks/webpack-8272b4f193eb72cb.js");
  assert.equal(A.rutaEstaticoNext("HEAD", "/_next/static/css/a1b2.css?dpl=x"), "css/a1b2.css");
  assert.equal(A.rutaEstaticoNext("get", "/_next/static/chunks/app/(grupo)/%5Bid%5D/page-1a2b.js"), "chunks/app/(grupo)/[id]/page-1a2b.js");
  assert.equal(A.rutaEstaticoNext("GET", "/_next/static/JfECZj9JRQuyC9cJ9lB8N/_buildManifest.js"), "JfECZj9JRQuyC9cJ9lB8N/_buildManifest.js");
  const malas = [
    "/_next/static/", "/_next/static/../server/app.js", "/_next/static/chunks/../../secreto.txt", "/_next/static/chunks/%2e%2e/x.js",
    "/_next/static/chunks//x.js", "/_next/static/.oculto", "/_next/static/chunks/a\\b.js", "/_next/static/chunks/a%00.js",
    "/_next/static/chunks/a%2Fb/..%2F..%2Fx.js", "/_next/image?url=x", "/escritorios", "/_next/static/%E0%A4%A", "/_next/staticx/a.js", "", null,
  ];
  for (const mala of malas) assert.equal(A.rutaEstaticoNext("GET", mala), null, String(mala));
  assert.equal(A.rutaEstaticoNext("POST", "/_next/static/chunks/a.js"), null);
  assert.equal(A.rutaEstaticoNext("GET", "/_next/static/chunks/" + "a".repeat(500) + ".js"), null);
});

test("buscarEnOtrasCapas: la capa guardada más reciente primero, nunca la propia, nunca fuera de .next/static", () => {
  const c = montarCapas();
  try {
    const h = A.buscarEnOtrasCapas(c.nueva, "chunks/webpack-vieja.js");
    assert.equal(fs.readFileSync(h.archivo, "utf8"), "/*vieja*/");
    assert.equal(h.bytes, 9);
    assert.equal(fs.readFileSync(A.buscarEnOtrasCapas(c.nueva, "chunks/solo-mas-vieja.js").archivo, "utf8"), "/*solo*/");
    assert.equal(A.buscarEnOtrasCapas(c.nueva, "chunks/no-existe.js"), null);
    assert.equal(A.buscarEnOtrasCapas(c.nueva, "chunks/solo-nueva.js"), null, "lo de la propia capa lo sirve Next, no esto");
    assert.equal(A.buscarEnOtrasCapas(c.nueva, "chunks/enlace.js"), null, "un enlace que sale de la capa no se sirve");
    assert.equal(A.buscarEnOtrasCapas(c.nueva, "chunks"), null, "una carpeta no es un archivo");
    assert.equal(A.buscarEnOtrasCapas(path.join(os.tmpdir(), "ss-no-existe-" + Date.now(), "capa"), "chunks/a.js"), null);
    assert.equal(A.tipoEstatico("x/webpack-1.js"), "application/javascript; charset=utf-8");
    assert.equal(A.tipoEstatico("x/a.CSS"), "text/css; charset=utf-8");
    assert.equal(A.tipoEstatico("x/raro.bin"), "application/octet-stream");
  } finally {
    fs.rmSync(c.base, { recursive: true, force: true });
  }
});

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
      r.on("data", (x) => t.push(x));
      r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(t).toString("utf8") }));
    });
    p.on("error", reject);
    p.end();
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

// Un «Next» que solo conoce lo de SU capa: cualquier otro estático, 404 (como el de verdad).
const NEXT_DE_MENTIRA = `
const http = require("node:http");
http.createServer((req, res) => {
  if (req.url === "/_next/static/chunks/solo-nueva.js") { res.writeHead(200, { "content-type": "application/javascript" }); return res.end("/*nueva*/"); }
  if (req.url.startsWith("/_next/static/")) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Not Found"); }
  if (req.url === "/no-hay-pagina") { res.writeHead(404, { "content-type": "text/html" }); return res.end("<h1>404</h1>"); }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ quien: "next-local", ruta: req.url }));
}).listen(Number(process.env.PORT), process.env.HOSTNAME);
`;

const PASE = "0123456789abcdef".repeat(4);

test("de punta a punta: la página de la capa anterior recibe sus scripts; lo demás sigue igual", { timeout: 30_000 }, async () => {
  const c = montarCapas();
  fs.writeFileSync(path.join(c.nueva, "server.js"), NEXT_DE_MENTIRA);
  fs.copyFileSync(ORIGEN, path.join(c.nueva, "starseed-arranque.cjs"));
  fs.copyFileSync(path.join(__dirname, "..", "guarda.cjs"), path.join(c.nueva, "guarda.cjs"));
  const puerto = await puertoLibre();
  const puertoWeb = await puertoLibre(); // nadie escucha: «sin internet»
  const env = { ...process.env, STARSEED_PUERTO: String(puerto), STARSEED_FIRMA: "firma-d", STARSEED_WEB_PUBLICADA: `http://127.0.0.1:${puertoWeb}`, STARSEED_PAUSA_RED_MS: "300" };
  delete env.STARSEED_PASE_VENTANA;
  const hijo = spawn(process.execPath, ["starseed-arranque.cjs"], { cwd: c.nueva, stdio: ["pipe", "pipe", "pipe"], env });
  hijo.stdin.write(`pase:${PASE}\n`);
  let salida = "";
  hijo.stdout.on("data", (x) => (salida += x));
  hijo.stderr.on("data", (x) => (salida += x));
  try {
    await esperar(async () => {
      const j = JSON.parse((await pedir(puerto, "/__starseed/salud")).body);
      return j.listo && j.interna !== "comprobando" ? j : null;
    });
    const script = { "sec-fetch-site": "same-origin", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "script", cookie: `starseed_pase=${PASE}` };

    const vieja = await pedir(puerto, "/_next/static/chunks/webpack-vieja.js", { headers: script });
    assert.equal(vieja.status, 200, salida);
    assert.equal(vieja.body, "/*vieja*/");
    assert.match(vieja.headers["content-type"], /^application\/javascript/);
    assert.match(vieja.headers["cache-control"], /immutable/);
    assert.equal(vieja.headers["x-content-type-options"], "nosniff");
    assert.equal(vieja.headers["x-starseed-ruta"], "local-capa-anterior");

    const cabeza = await pedir(puerto, "/_next/static/chunks/webpack-vieja.js?dpl=1", { method: "HEAD", headers: script });
    assert.equal(cabeza.status, 200);
    assert.equal(cabeza.headers["content-length"], "9");
    assert.equal(cabeza.body, "");

    // Lo de la propia capa lo sigue sirviendo Next; lo que no está en ninguna, 404 como siempre.
    const propia = await pedir(puerto, "/_next/static/chunks/solo-nueva.js", { headers: script });
    assert.equal(propia.body, "/*nueva*/");
    assert.equal(propia.headers["x-starseed-ruta"], "local");
    const falta = await pedir(puerto, "/_next/static/chunks/no-existe.js", { headers: script });
    assert.equal(falta.status, 404);
    assert.equal(falta.headers["x-starseed-ruta"], "local");

    // Ni subiendo carpetas, ni por el enlace, ni lo del servidor de la otra capa.
    for (const mala of ["/_next/static/chunks/%2e%2e/%2e%2e/%2e%2e/secreto.txt", "/_next/static/%2e%2e/server/app.js", "/_next/static/chunks/enlace.js"]) {
      const r = await pedir(puerto, mala, { headers: script });
      assert.notEqual(r.status, 200, mala);
      assert.ok(!r.body.includes("no-debe-salir") && !r.body.includes("secreto del servidor"), mala);
    }

    // Un 404 que no es un estático no se toca, y las páginas siguen yendo a Next.
    const sinPagina = await pedir(puerto, "/no-hay-pagina", { headers: { "sec-fetch-site": "none", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } });
    assert.equal(sinPagina.status, 404);
    assert.equal(sinPagina.body, "<h1>404</h1>");
    const pagina = await pedir(puerto, "/escritorios", { headers: { "sec-fetch-site": "none", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } });
    assert.equal(JSON.parse(pagina.body).quien, "next-local");

    // Sin el pase no hay estáticos de ninguna capa: la guarda va antes.
    assert.equal((await pedir(puerto, "/_next/static/chunks/webpack-vieja.js", { headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors" } })).status, 403);
    assert.match(salida, /estático de una capa anterior/);
    assert.ok(!salida.includes(PASE), "el pase salió en el registro");
  } finally {
    hijo.stdin.end();
    await new Promise((r) => setTimeout(r, 300));
    if (hijo.exitCode === null) hijo.kill("SIGKILL");
    fs.rmSync(c.base, { recursive: true, force: true });
  }
});
