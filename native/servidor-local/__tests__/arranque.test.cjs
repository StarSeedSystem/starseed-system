/*
 * Pruebas del envoltorio del servidor local (APP1107A). Sin Next ni red de verdad:
 *   node --test native/servidor-local/__tests__/
 * La prueba de punta a punta monta un «standalone de mentira» (un server.js diminuto) en una carpeta
 * temporal, lanza el envoltorio como lo lanza la app (entrada estándar en tubería) y comprueba la
 * salud con firma, el reparto local/web, la vuelta a local sin red, las cookies y que sale solo al
 * cerrarse su entrada.
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

const cfgBase = A.leerConfig({ STARSEED_PUERTO: "47610", STARSEED_FIRMA: "f", STARSEED_WEB_PUBLICADA: "https://web.example/" });

test("config: puerto, web sin barra final, /api a la web por defecto", () => {
  assert.equal(cfgBase.puerto, 47610);
  assert.equal(cfgBase.web, "https://web.example");
  assert.equal(cfgBase.apiRemota, true);
  assert.equal(A.leerConfig({}).puerto, null);
  assert.equal(A.leerConfig({ STARSEED_PUERTO: "99999" }).puerto, null);
  assert.equal(A.leerConfig({ STARSEED_API_REMOTA: "nunca" }).apiRemota, false);
  assert.deepEqual(A.leerConfig({ STARSEED_API_SOLO_LOCAL: "/api/a, nada ,/api/b/" }).localSiempre, ["/api/a", "/api/b/"]);
});

test("destino: salud, red, páginas en local, /api a la web salvo sin conexión", () => {
  const red = { sinConexionHasta: 0, ultimaRespuesta: 0 };
  assert.equal(A.destino("/__starseed/salud", cfgBase, red, 1), "salud");
  assert.equal(A.destino("/__starseed/red?x=1", cfgBase, red, 1), "red");
  assert.equal(A.destino("/escritorios", cfgBase, red, 1), "local");
  assert.equal(A.destino("/_next/static/a.js", cfgBase, red, 1), "local");
  assert.equal(A.destino("/api/ai/chat?x", cfgBase, red, 1), "web");
  assert.equal(A.destino("/apix", cfgBase, red, 1), "local");
  assert.equal(A.destino("/api/x", cfgBase, { sinConexionHasta: 10, ultimaRespuesta: 0 }, 5), "local");
  assert.equal(A.destino("/api/x", A.leerConfig({ STARSEED_API_REMOTA: "nunca" }), red, 1), "local");
  const solo = A.leerConfig({ STARSEED_API_SOLO_LOCAL: "/api/local" });
  assert.equal(A.destino("/api/local/x", solo, red, 1), "local");
  assert.equal(A.destino("/api/localidad", solo, red, 1), "web");
});

test("destino: la migración (T4) y lo que solo vive en la Mac (T8)", () => {
  const red = { sinConexionHasta: 0, ultimaRespuesta: 0 };
  assert.equal(A.destino("/__starseed/migracion", cfgBase, red, 1), "migracion");
  assert.equal(A.destino("/__starseed/migracion-origen.js?v=1", cfgBase, red, 1), "migracion-js");
  // /api/mando nunca se sirve desde la app: ni a la web ni al Next local, con o sin conexión, y
  // tampoco con los trucos de siempre para saltarse un prefijo.
  for (const r of ["/api/mando", "/api/mando/", "/api/mando/grafo?x=1", "//api//mando/x", "/api/./mando/x", "/api/x/../mando/y", "/API/Mando/x", "/api/%6dando/x", "/api\\mando/x"]) {
    assert.equal(A.destino(r, cfgBase, red, 1), "solo-mac", r);
    assert.equal(A.destino(r, cfgBase, { sinConexionHasta: 10, ultimaRespuesta: 0 }, 5), "solo-mac", r);
  }
  for (const r of ["/api/mandos", "/api/mandox/y", "/api/metagenesis/orden", "/api/genesis/proponer"]) {
    assert.equal(A.destino(r, cfgBase, red, 1), "web", r);
  }
  assert.equal(A.destino("/mando", cfgBase, red, 1), "local");
  assert.deepEqual(A.RUTAS_SOLO_MAC, ["/api/mando"]);
});

test("página de migración: sin recursos de fuera, con su CSP y siempre acaba en /", () => {
  const html = A.paginaMigracion();
  assert.match(html, /Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'/);
  assert.match(html, /<script src="\/__starseed\/migracion-origen\.js" onerror="location\.replace\('\/'\)"><\/script>/);
  assert.match(html, /paginaImportar\(/);
  assert.match(html, /setTimeout\(function \(\) \{ irA\("\/"\); \}, 120000\)/);
  assert.match(html, /La sesión no se copia/);
  assert.doesNotMatch(html, /https?:\/\/(?!ipc\.localhost)/);
});

test("errores de red y estado de la red", () => {
  assert.equal(A.esErrorDeRed({ code: "ENOTFOUND" }), true);
  assert.equal(A.esErrorDeRed({ cause: { code: "ECONNREFUSED" } }), true);
  assert.equal(A.esErrorDeRed({ code: "ERR_INVALID_ARG" }), false);
  assert.equal(A.esErrorDeRed(null), false);
  assert.equal(A.estadoRed({ sinConexionHasta: 100, ultimaRespuesta: 0 }, 50), "sin-conexion");
  assert.equal(A.estadoRed({ sinConexionHasta: 0, ultimaRespuesta: 40 }, 50), "en-linea");
  assert.equal(A.estadoRed({ sinConexionHasta: 0, ultimaRespuesta: 0 }, 50), "desconocida");
});

test("cabeceras hacia la web: host, origen y referencia de la web; sin saltos", () => {
  const h = A.cabecerasHaciaWeb(
    { host: "127.0.0.1:47610", origin: "http://127.0.0.1:47610", referer: "http://127.0.0.1:47610/escritorios?a=1", connection: "keep-alive, x-quitar", "x-quitar": "1", cookie: "sb=1", "x-forwarded-for": "1.2.3.4" },
    "https://web.example",
  );
  assert.equal(h.host, "web.example");
  assert.equal(h.origin, "https://web.example");
  assert.equal(h.referer, "https://web.example/escritorios?a=1");
  assert.equal(h.cookie, "sb=1");
  assert.equal(h.connection, undefined);
  assert.equal(h["x-quitar"], undefined);
  assert.equal(h["x-forwarded-for"], undefined);
});

test("cookies de la web valen en 127.0.0.1 y sin HSTS", () => {
  assert.equal(A.adaptarCookie("a=1; Path=/; Domain=web.example; Secure; HttpOnly; SameSite=None"), "a=1; Path=/; HttpOnly; SameSite=Lax");
  const v = A.cabecerasDeVuelta({ "set-cookie": ["b=2; Secure"], "strict-transport-security": "max-age=1", "transfer-encoding": "chunked", "content-type": "x" });
  assert.deepEqual(v["set-cookie"], ["b=2"]);
  assert.equal(v["strict-transport-security"], undefined);
  assert.equal(v["transfer-encoding"], undefined);
  assert.equal(v["content-type"], "x");
});

test("salud: JSON compacto que Rust sabe leer", () => {
  const t = A.cuerpoSalud({ firma: "abc", listo: true, red: { sinConexionHasta: 0, ultimaRespuesta: 0 }, puertoInterno: 5 }, 1);
  assert.match(t, /^\{"servidor":"starseed-os-local","firma":"abc","listo":true,/);
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

const SERVIDOR_DE_MENTIRA = `
const http = require("node:http");
http.createServer((req, res) => {
  const t = [];
  req.on("data", (c) => t.push(c));
  req.on("end", () => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ quien: "next-local", ruta: req.url, metodo: req.method, cuerpo: Buffer.concat(t).toString(), host: req.headers.host, env: process.env.HOSTNAME }));
  });
}).listen(Number(process.env.PORT), process.env.HOSTNAME);
`;

test("de punta a punta con un standalone de mentira", { timeout: 30_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-arranque-"));
  fs.writeFileSync(path.join(dir, "server.js"), SERVIDOR_DE_MENTIRA);
  fs.copyFileSync(ORIGEN, path.join(dir, "starseed-arranque.cjs"));
  const puerto = await puertoLibre();
  const puertoWeb = await puertoLibre(); // nadie escucha: «sin internet»
  const hijo = spawn(process.execPath, ["starseed-arranque.cjs"], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, STARSEED_PUERTO: String(puerto), STARSEED_FIRMA: "firma-1", STARSEED_WEB_PUBLICADA: `http://127.0.0.1:${puertoWeb}`, STARSEED_PAUSA_RED_MS: "300" },
  });
  let salida = "";
  hijo.stdout.on("data", (c) => (salida += c));
  hijo.stderr.on("data", (c) => (salida += c));
  let web = null;
  try {
    const salud = await esperar(async () => {
      const r = await pedir(puerto, "/__starseed/salud");
      const j = JSON.parse(r.body);
      return j.listo ? j : null;
    });
    assert.equal(salud.servidor, "starseed-os-local");
    assert.equal(salud.firma, "firma-1");

    // T4: la página de migración y su script (este paquete aún no lo trae: 404, y la página lo
    // resuelve yendo a «/»); T8: /api/mando no llega a Next ni a la web.
    const mig = await pedir(puerto, "/__starseed/migracion");
    assert.equal(mig.status, 200);
    assert.match(mig.headers["content-type"], /text\/html/);
    assert.equal(mig.headers["cache-control"], "no-store");
    assert.equal((await pedir(puerto, "/__starseed/migracion-origen.js")).status, 404);
    fs.copyFileSync(path.join(__dirname, "..", "migracion-origen.js"), path.join(dir, "migracion-origen.js"));
    const js = await pedir(puerto, "/__starseed/migracion-origen.js");
    assert.equal(js.status, 200);
    assert.match(js.headers["content-type"], /text\/javascript/);
    assert.match(js.body, /StarseedMigracionOrigen/);
    const mando = await pedir(puerto, "/api/mando/grafo");
    assert.equal(mando.status, 404);
    assert.equal(JSON.parse(mando.body).error, "solo-mac");
    assert.equal(mando.headers["x-starseed-ruta"], undefined);

    const pagina = await pedir(puerto, "/escritorios");
    assert.equal(pagina.headers["x-starseed-ruta"], "local");
    assert.equal(JSON.parse(pagina.body).env, "127.0.0.1");
    assert.equal(JSON.parse(pagina.body).host, `127.0.0.1:${puerto}`);

    // Sin web: /api cae a local, también un POST con cuerpo (se repite la copia).
    const api = await pedir(puerto, "/api/hola");
    assert.equal(api.headers["x-starseed-ruta"], "local");
    const post = await pedir(puerto, "/api/eco", { method: "POST", body: "uno-dos", headers: { "content-type": "text/plain" } });
    assert.equal(JSON.parse(post.body).cuerpo, "uno-dos");
    const red = JSON.parse((await pedir(puerto, "/__starseed/red")).body);
    assert.equal(red.red, "sin-conexion");

    // Vuelve la web: /api va a ella, con su host, y sus cookies valen aquí.
    web = http.createServer((req, res) => {
      const t = [];
      req.on("data", (c) => t.push(c));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json", "set-cookie": "sb=1; Domain=web.example; Secure; Path=/" });
        res.end(JSON.stringify({ quien: "web", host: req.headers.host, origin: req.headers.origin || null, cuerpo: Buffer.concat(t).toString() }));
      });
    });
    await new Promise((r) => web.listen(puertoWeb, "127.0.0.1", r));
    await new Promise((r) => setTimeout(r, 400)); // pasa la pausa de «sin conexión»
    const enLinea = await esperar(async () => {
      const r = await pedir(puerto, "/api/hola", { headers: { origin: `http://127.0.0.1:${puerto}` } });
      return r.headers["x-starseed-ruta"] === "web" ? r : null;
    });
    const j = JSON.parse(enLinea.body);
    assert.equal(j.quien, "web");
    assert.equal(j.host, `127.0.0.1:${puertoWeb}`);
    assert.equal(j.origin, `http://127.0.0.1:${puertoWeb}`);
    assert.deepEqual(enLinea.headers["set-cookie"], ["sb=1; Path=/"]);
    const postWeb = await pedir(puerto, "/api/eco", { method: "POST", body: "tres" });
    assert.equal(JSON.parse(postWeb.body).cuerpo, "tres");
    assert.equal(JSON.parse((await pedir(puerto, "/__starseed/red")).body).red, "en-linea");

    // La app se cierra: se cierra la entrada estándar y el envoltorio sale solo.
    const cerrado = new Promise((r) => hijo.once("exit", (c) => r(c)));
    hijo.stdin.end();
    const codigo = await Promise.race([cerrado, new Promise((r) => setTimeout(() => r("sigue-vivo"), 5000))]);
    assert.equal(codigo, 0, salida);
  } finally {
    if (web) web.close();
    if (hijo.exitCode === null) hijo.kill("SIGKILL");
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sale con código 3 si el puerto ya está ocupado", { timeout: 15_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-arranque-"));
  fs.writeFileSync(path.join(dir, "server.js"), SERVIDOR_DE_MENTIRA);
  fs.copyFileSync(ORIGEN, path.join(dir, "starseed-arranque.cjs"));
  const ocupado = net.createServer();
  await new Promise((r) => ocupado.listen(0, "127.0.0.1", r));
  try {
    const hijo = spawn(process.execPath, ["starseed-arranque.cjs"], {
      cwd: dir,
      stdio: ["pipe", "ignore", "ignore"],
      env: { ...process.env, STARSEED_PUERTO: String(ocupado.address().port), STARSEED_FIRMA: "x" },
    });
    const codigo = await new Promise((r) => hijo.once("exit", r));
    assert.equal(codigo, 3);
  } finally {
    ocupado.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
