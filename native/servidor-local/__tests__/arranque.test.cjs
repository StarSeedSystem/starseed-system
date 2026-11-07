/*
 * Pruebas del envoltorio del servidor local (APP1107A). Sin Next ni red de verdad:
 *   node --test native/servidor-local/__tests__/
 * La prueba de punta a punta monta un «standalone de mentira» (un server.js diminuto) en una carpeta
 * temporal, lanza el envoltorio como lo lanza la app (entrada estándar en tubería) y comprueba la
 * salud con firma, el reparto local/web, la vuelta a local sin red, las cookies y que sale solo al
 * cerrarse su entrada. (SEG1107A · T11) Y la guarda de punta a punta: pase por la entrada estándar,
 * /__starseed/entrar, otras webs, DNS rebinding, CORS, el Next interno y los WebSocket. La lógica
 * pura de la guarda tiene sus propias pruebas: guarda.test.cjs.
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
  assert.equal(A.destino("/__starseed/entrar?t=x&a=/", cfgBase, red, 1), "entrar");
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
  // (SEG1107A) El pase de la ventana y el testigo interno no salen hacia la web publicada.
  const p = A.cabecerasHaciaWeb({ host: "127.0.0.1:47610", cookie: `sb=1; starseed_pase=${"a".repeat(64)}; z=2`, "x-starseed-interna": "t" }, "https://web.example");
  assert.equal(p.cookie, "sb=1; z=2");
  assert.equal(p["x-starseed-interna"], undefined);
  const solo = A.cabecerasHaciaWeb({ host: "127.0.0.1:47610", cookie: `starseed_pase=${"a".repeat(64)}` }, "https://web.example");
  assert.equal("cookie" in solo, false);
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
  // (SEG1107A) Dice SI tiene pase (nunca cuál) y si el Next interno quedó envuelto.
  const j = JSON.parse(A.cuerpoSalud({ firma: "abc", listo: true, red: { sinConexionHasta: 0, ultimaRespuesta: 0 }, pase: "b".repeat(64), interna: "protegida" }, 1));
  assert.equal(j.pase, true);
  assert.equal(j.interna, "protegida");
  assert.ok(!JSON.stringify(j).includes("b".repeat(64)));
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
const s = http.createServer((req, res) => {
  const t = [];
  req.on("data", (c) => t.push(c));
  req.on("end", () => {
    // CORS abierto a propósito: la puerta no debe dejarlo salir.
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-credentials": "true", "access-control-allow-private-network": "true" });
    res.end(JSON.stringify({
      quien: "next-local", ruta: req.url, metodo: req.method, cuerpo: Buffer.concat(t).toString(), host: req.headers.host,
      env: process.env.HOSTNAME, cookie: req.headers.cookie || null, testigo: req.headers["x-starseed-interna"] || null,
      testigoCrudo: req.rawHeaders.some((x, i) => i % 2 === 0 && /^x-starseed-interna$/i.test(x)),
      paseEnEntorno: Object.keys(process.env).some((k) => /PASE/.test(k)),
    }));
  });
});
s.on("upgrade", (req, socket) => socket.end("HTTP/1.1 101 Switching Protocols\\r\\nupgrade: websocket\\r\\nconnection: Upgrade\\r\\n\\r\\n"));
s.listen(Number(process.env.PORT), process.env.HOSTNAME);
`;

const PASE = "0123456789abcdef".repeat(4);
const OTRO = "fedcba9876543210".repeat(4);

/** Un «upgrade» (WebSocket): resuelve con el código (101 si pasó, el de la guarda si no). */
function actualizar(puerto, ruta, headers) {
  return new Promise((resolve, reject) => {
    const p = http.request({ host: "127.0.0.1", port: puerto, path: ruta, headers: { connection: "Upgrade", upgrade: "websocket", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", ...headers } });
    p.on("upgrade", (r, socket) => {
      socket.destroy();
      resolve({ status: r.statusCode, headers: r.headers });
    });
    p.on("response", (r) => {
      r.resume();
      resolve({ status: r.statusCode, headers: r.headers });
    });
    p.on("error", reject);
    p.end();
  });
}

test("de punta a punta con un standalone de mentira", { timeout: 30_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-arranque-"));
  fs.writeFileSync(path.join(dir, "server.js"), SERVIDOR_DE_MENTIRA);
  fs.copyFileSync(ORIGEN, path.join(dir, "starseed-arranque.cjs"));
  fs.copyFileSync(path.join(__dirname, "..", "guarda.cjs"), path.join(dir, "guarda.cjs"));
  const puerto = await puertoLibre();
  const puertoWeb = await puertoLibre(); // nadie escucha: «sin internet»
  const env = { ...process.env, STARSEED_PUERTO: String(puerto), STARSEED_FIRMA: "firma-1", STARSEED_WEB_PUBLICADA: `http://127.0.0.1:${puertoWeb}`, STARSEED_PAUSA_RED_MS: "300" };
  delete env.STARSEED_PASE_VENTANA;
  const hijo = spawn(process.execPath, ["starseed-arranque.cjs"], { cwd: dir, stdio: ["pipe", "pipe", "pipe"], env });
  // Como la app: el pase, primera línea de la entrada estándar (que sigue abierta).
  hijo.stdin.write(`pase:${PASE}\n`);
  let salida = "";
  hijo.stdout.on("data", (c) => (salida += c));
  hijo.stderr.on("data", (c) => (salida += c));
  let web = null;
  try {
    const salud = await esperar(async () => {
      const r = await pedir(puerto, "/__starseed/salud");
      const j = JSON.parse(r.body);
      return j.listo && j.interna !== "comprobando" ? j : null;
    });
    assert.equal(salud.servidor, "starseed-os-local");
    assert.equal(salud.firma, "firma-1");
    assert.equal(salud.pase, true);
    assert.equal(salud.interna, "protegida");
    const LOCAL = `http://127.0.0.1:${puerto}`;

    // (SEG1107A) La entrada de la ventana: con otro pase nada; con el suyo, cookie y a la ruta pedida.
    const mala = await pedir(puerto, `/__starseed/entrar?t=${OTRO}`);
    assert.equal(mala.status, 403);
    assert.equal(JSON.parse(mala.body).motivo, "pase-malo");
    assert.equal(mala.headers["set-cookie"], undefined);
    const ent = await pedir(puerto, `/__starseed/entrar?t=${PASE}&a=${encodeURIComponent("/__starseed/migracion")}`, { headers: { "sec-fetch-site": "none", "sec-fetch-mode": "navigate" } });
    assert.equal(ent.status, 303);
    assert.equal(ent.headers.location, "/__starseed/migracion");
    assert.equal(ent.headers["cache-control"], "no-store");
    assert.deepEqual(ent.headers["set-cookie"], [`starseed_pase=${PASE}; Path=/; HttpOnly; SameSite=Strict`]);
    const COOKIE = `starseed_pase=${PASE}`;
    const propio = { origin: LOCAL, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", cookie: COOKIE };

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
    const mando = await pedir(puerto, "/api/mando/grafo", { headers: propio });
    assert.equal(mando.status, 404);
    assert.equal(JSON.parse(mando.body).error, "solo-mac");
    assert.equal(mando.headers["x-starseed-ruta"], undefined);
    // Y sin pase, ni eso: la guarda va antes.
    assert.equal((await pedir(puerto, "/api/mando/grafo")).status, 403);

    // Una página: llega al Next local sin cookie, sin el testigo interno (ni en las crudas) y sin CORS abierto.
    const pagina = await pedir(puerto, "/escritorios", { headers: { "sec-fetch-site": "none", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } });
    assert.equal(pagina.status, 200);
    assert.equal(pagina.headers["x-starseed-ruta"], "local");
    const jp = JSON.parse(pagina.body);
    assert.equal(jp.env, "127.0.0.1");
    assert.equal(jp.host, `127.0.0.1:${puerto}`);
    assert.equal(jp.testigo, null);
    assert.equal(jp.testigoCrudo, false);
    assert.equal(jp.paseEnEntorno, false, "el pase no está en el entorno que ve Next");
    for (const k of ["access-control-allow-origin", "access-control-allow-credentials", "access-control-allow-private-network"]) {
      assert.equal(pagina.headers[k], undefined, k);
    }
    // Navegar desde otra web a una página (un enlace, la vuelta de OAuth) sigue funcionando.
    const fuera = await pedir(puerto, "/auth/callback?code=x", { headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } });
    assert.equal(fuera.status, 200);

    // Sin web: /api cae a local, también un POST con cuerpo (se repite la copia). Next ve la cookie.
    const api = await pedir(puerto, "/api/hola", { headers: propio });
    assert.equal(api.headers["x-starseed-ruta"], "local");
    assert.equal(JSON.parse(api.body).cookie, COOKIE);
    const post = await pedir(puerto, "/api/eco", { method: "POST", body: "uno-dos", headers: { ...propio, "content-type": "text/plain" } });
    assert.equal(JSON.parse(post.body).cuerpo, "uno-dos");
    const red = JSON.parse((await pedir(puerto, "/__starseed/red")).body);
    assert.equal(red.red, "sin-conexion");

    // T11: lo que no viene de la ventana de la app no pasa (y no llega ni a Next ni a la web).
    const ataques = [
      ["/api/hola", {}, "GET", 403, "sin-pase"],
      ["/api/eco", { origin: "https://evil.example", "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors", "content-type": "text/plain" }, "POST", 403, "origen-ajeno"],
      ["/api/eco", { "content-type": "text/plain" }, "POST", 403, "sin-pase"],
      ["/api/eco", { ...propio, cookie: `starseed_pase=${OTRO}` }, "POST", 403, "pase-malo"],
      ["/api/eco", { ...propio, "sec-fetch-site": "cross-site" }, "POST", 403, "sitio-ajeno"],
      ["/escritorios", { origin: LOCAL }, "POST", 403, "sin-pase"],
      ["/api/hola", { ...propio, host: `evil.example:${puerto}`, origin: `http://evil.example:${puerto}` }, "GET", 421, "host-ajeno"],
      ["/", { host: `evil.example:${puerto}` }, "GET", 421, "host-ajeno"],
      ["/__starseed/salud", { host: `evil.example:${puerto}` }, "GET", 421, "host-ajeno"],
      ["/_next/static/a.js", { "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "script" }, "GET", 403, "recurso-ajeno"],
      ["/", { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" }, "GET", 403, "marco-ajeno"],
      ["/API/%68ola", {}, "GET", 403, "sin-pase"],
      ["/api/eco", { origin: "https://evil.example", "access-control-request-method": "POST", "access-control-request-private-network": "true" }, "OPTIONS", 403, "origen-ajeno"],
    ];
    for (const [ruta, headers, method, status, motivo] of ataques) {
      const r = await pedir(puerto, ruta, { method, headers, body: method === "POST" ? "x" : undefined });
      assert.equal(r.status, status, `${method} ${ruta} ${JSON.stringify(headers)} → ${r.status} ${r.body}`);
      assert.equal(JSON.parse(r.body).motivo, motivo, ruta);
      assert.equal(r.headers["x-starseed-guarda"], motivo);
      assert.equal(r.headers["x-starseed-ruta"], undefined, "no llegó a ninguna parte");
      assert.equal(r.headers["access-control-allow-origin"], undefined);
      assert.ok(!r.body.includes(PASE));
    }

    // El Next interno (puerto al azar) no se deja hablar sin pasar por la puerta.
    const interno = salud.puertoInterno;
    assert.ok(interno);
    const directo = await pedir(interno, "/api/hola", { method: "POST", body: "x", headers: { "content-type": "text/plain" } });
    assert.equal(directo.status, 403);
    assert.equal(directo.headers["x-starseed-guarda"], "interna");
    assert.equal((await pedir(interno, "/", { headers: { "x-starseed-interna": OTRO } })).status, 403);
    // …salvo con la cookie del pase (Next se llama a sí mismo así tras una server action).
    const conPase = await pedir(interno, "/escritorios", { headers: { cookie: COOKIE } });
    assert.equal(conPase.status, 200);
    assert.equal(JSON.parse(conPase.body).quien, "next-local");
    assert.equal((await actualizar(interno, "/", { origin: LOCAL })).status, 403);

    // WebSocket: solo desde la ventana con su pase.
    assert.equal((await actualizar(puerto, "/canal", { origin: "https://evil.example" })).status, 403);
    assert.equal((await actualizar(puerto, "/canal", { origin: LOCAL })).status, 403);
    assert.equal((await actualizar(puerto, "/canal", { origin: `http://evil.example:${puerto}`, host: `evil.example:${puerto}`, cookie: COOKIE })).status, 421);
    assert.equal((await actualizar(puerto, "/canal", { origin: LOCAL, cookie: COOKIE })).status, 101);

    // Vuelve la web: /api va a ella, con su host, sus cookies valen aquí y el pase NO viaja.
    web = http.createServer((req, res) => {
      const t = [];
      req.on("data", (c) => t.push(c));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json", "set-cookie": "sb=1; Domain=web.example; Secure; Path=/", "access-control-allow-origin": "*" });
        res.end(JSON.stringify({ quien: "web", host: req.headers.host, origin: req.headers.origin || null, cookie: req.headers.cookie || null, testigo: req.headers["x-starseed-interna"] || null, cuerpo: Buffer.concat(t).toString() }));
      });
    });
    await new Promise((r) => web.listen(puertoWeb, "127.0.0.1", r));
    await new Promise((r) => setTimeout(r, 400)); // pasa la pausa de «sin conexión»
    const enLinea = await esperar(async () => {
      const r = await pedir(puerto, "/api/hola", { headers: { ...propio, cookie: `sb=1; ${COOKIE}` } });
      return r.headers["x-starseed-ruta"] === "web" ? r : null;
    });
    const j = JSON.parse(enLinea.body);
    assert.equal(j.quien, "web");
    assert.equal(j.host, `127.0.0.1:${puertoWeb}`);
    assert.equal(j.origin, `http://127.0.0.1:${puertoWeb}`);
    assert.equal(j.cookie, "sb=1");
    assert.equal(j.testigo, null);
    assert.deepEqual(enLinea.headers["set-cookie"], ["sb=1; Path=/"]);
    assert.equal(enLinea.headers["access-control-allow-origin"], undefined);
    const postWeb = await pedir(puerto, "/api/eco", { method: "POST", body: "tres", headers: propio });
    assert.equal(JSON.parse(postWeb.body).cuerpo, "tres");
    assert.equal(JSON.parse(postWeb.body).cookie, null);
    // Con la web en línea, un POST de otra web sigue sin pasar (ni hacia la web).
    const ajenoWeb = await pedir(puerto, "/api/eco", { method: "POST", body: "x", headers: { origin: "https://evil.example", "content-type": "text/plain" } });
    assert.equal(ajenoWeb.status, 403);
    assert.equal(JSON.parse((await pedir(puerto, "/__starseed/red")).body).red, "en-linea");

    // El pase no aparece en el registro del envoltorio.
    assert.ok(!salida.includes(PASE), "el pase salió en el registro");
    assert.match(salida, /pase de la app recibido/);

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

test("sin un pase válido de la app: arranca, las páginas sirven y /api responde 403", { timeout: 20_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-arranque-"));
  fs.writeFileSync(path.join(dir, "server.js"), SERVIDOR_DE_MENTIRA);
  fs.copyFileSync(ORIGEN, path.join(dir, "starseed-arranque.cjs"));
  fs.copyFileSync(path.join(__dirname, "..", "guarda.cjs"), path.join(dir, "guarda.cjs"));
  const puerto = await puertoLibre();
  const env = { ...process.env, STARSEED_PUERTO: String(puerto), STARSEED_FIRMA: "f", STARSEED_API_REMOTA: "nunca" };
  delete env.STARSEED_PASE_VENTANA;
  // Una línea que no es un pase: igual que si no llegara (sin esperar al tope).
  const hijo = spawn(process.execPath, ["starseed-arranque.cjs"], { cwd: dir, stdio: ["pipe", "ignore", "ignore"], env });
  hijo.stdin.write("pase:NO-ES-HEX\n");
  try {
    const salud = await esperar(async () => {
      const j = JSON.parse((await pedir(puerto, "/__starseed/salud")).body);
      return j.listo ? j : null;
    });
    assert.equal(salud.pase, false);
    assert.equal((await pedir(puerto, "/")).status, 200);
    const api = await pedir(puerto, "/api/hola", { headers: { cookie: "starseed_pase=NO-ES-HEX" } });
    assert.equal(api.status, 403);
    assert.equal(JSON.parse(api.body).motivo, "sin-pase-configurado");
    assert.equal((await pedir(puerto, "/__starseed/entrar?t=NO-ES-HEX")).status, 403);
  } finally {
    hijo.stdin.end();
    await new Promise((r) => (hijo.exitCode !== null ? r() : hijo.once("exit", r)));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sale con código 3 si el puerto ya está ocupado", { timeout: 15_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-arranque-"));
  fs.writeFileSync(path.join(dir, "server.js"), SERVIDOR_DE_MENTIRA);
  fs.copyFileSync(ORIGEN, path.join(dir, "starseed-arranque.cjs"));
  fs.copyFileSync(path.join(__dirname, "..", "guarda.cjs"), path.join(dir, "guarda.cjs"));
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
