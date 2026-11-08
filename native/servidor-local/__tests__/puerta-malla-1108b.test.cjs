"use strict";
// PTA1108B · las /api/* relativas de la app hacia la web publicada salen por la malla cuando no hay red propia.
// (1) `agenteMalla` de puerta.cjs  (2) `destino` con porMalla  (3) de punta a punta con el arranque real en un proceso.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const P = require("../puerta.cjs");
const A = require("../starseed-arranque.cjs");

const PRE = P.PREFIJO;

/** Un certificado propio para `nombres` (DNS) y 127.0.0.1; null si no hay openssl. */
function certificado(nombres) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pta-1108b-"));
  try {
    const san = nombres.map((n) => `DNS:${n}`).concat("IP:127.0.0.1").join(",");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "k.pem"), "-out", path.join(dir, "c.pem"), "-days", "2", "-subj", `/CN=${nombres[0]}`, "-addext", `subjectAltName=${san}`], { stdio: "ignore" });
    return { key: fs.readFileSync(path.join(dir, "k.pem")), cert: fs.readFileSync(path.join(dir, "c.pem")), ruta: path.join(dir, "c.pem"), dir };
  } catch {
    fs.rmSync(dir, { recursive: true, force: true });
    return null;
  }
}

function pedir(puerto, ruta, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const p = http.request({ host: "127.0.0.1", port: puerto, path: ruta, method, headers }, (r) => {
      const t = [];
      r.on("data", (c) => t.push(c));
      r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, buf: Buffer.concat(t), body: Buffer.concat(t).toString("utf8") }));
    });
    p.on("error", reject);
    p.end(body);
  });
}

function puertoLibre() {
  return new Promise((r) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
}

/** La «página»: copia entre cada tubería de ENTRADA y una SALIDA hacia `destino` (el túnel de la malla en memoria). */
function paginaPuente(post, destino, visto) {
  let vivo = true;
  const json = async (r) => JSON.parse(r.body || "{}");
  const bombear = async (de, a) => {
    try {
      while (vivo) {
        const r = await post(`leer?id=${de}`);
        if (r.buf.length) {
          visto && visto.push(r.buf);
          const w = await post(`escribir?id=${a}`, r.buf);
          if (w.status !== 200) return;
        }
        if (r.headers["x-puerta-cierre"]) return void post(`cerrar?id=${a}`).catch(() => undefined);
      }
    } catch {
      /* el servidor de la prueba ya se cerró */
    }
  };
  (async () => {
    while (vivo) {
      let j;
      try {
        j = await json(await post("pendientes"));
      } catch {
        return;
      }
      for (const t of j.tuberias || []) {
        try {
          const sal = await json(await post("tcp", JSON.stringify({ host: "127.0.0.1", port: destino, permitirPrivadas: true })));
          if (!sal.id) {
            await post(`abierto?id=${t.id}`, JSON.stringify({ ok: false, m: sal.error }));
            continue;
          }
          await post(`abierto?id=${t.id}`, JSON.stringify({ ok: true }));
          void bombear(t.id, sal.id);
          void bombear(sal.id, t.id);
        } catch {
          return;
        }
      }
    }
  })().catch(() => undefined);
  return () => {
    vivo = false;
  };
}

function servidorDe(puerta) {
  return new Promise((res) => {
    const s = http.createServer((q, r) => puerta.manejar(q, r));
    s.listen(0, "127.0.0.1", () => {
      const puerto = s.address().port;
      res({ s, puerto, post: (accion, cuerpo) => pedir(puerto, PRE + accion, { method: "POST", body: cuerpo, headers: { "content-type": "application/octet-stream" } }) });
    });
  });
}

test("destino: con una puerta de la malla, /api/* sigue yendo a la web aunque no haya red propia", () => {
  const cfg = A.leerConfig({ STARSEED_PUERTO: "47610", STARSEED_FIRMA: "f", STARSEED_WEB_PUBLICADA: "https://web.example" });
  const caida = { sinConexionHasta: 10, ultimaRespuesta: 0 };
  assert.equal(A.destino("/api/x", cfg, caida, 5), "local", "sin malla: como siempre");
  assert.equal(A.destino("/api/x", cfg, caida, 5, false), "local");
  assert.equal(A.destino("/api/x", cfg, caida, 5, true), "web", "con malla: a la web, por el túnel");
  assert.equal(A.destino("/escritorios", cfg, caida, 5, true), "local", "las páginas siguen en local");
  assert.equal(A.destino("/api/mando/x", cfg, caida, 5, true), "solo-mac");
  assert.equal(A.destino("/api/x", A.leerConfig({ STARSEED_API_REMOTA: "nunca" }), caida, 5, true), "local");
  assert.equal(A.destino("/api/x", cfg, { sinConexionHasta: 0, ultimaRespuesta: 0 }, 5, true), "web");
});

test("agenteMalla: una petición https sale por el túnel, una sola vez, y la malla no ve su contenido", async (t) => {
  const cert = certificado(["localhost"]);
  if (!cert) return t.skip("sin openssl");
  let golpes = 0;
  const web = https.createServer({ key: cert.key, cert: cert.cert }, (q, r) => {
    golpes++;
    const partes = [];
    q.on("data", (b) => partes.push(b));
    q.on("end", () => {
      r.writeHead(200, { "content-type": "application/json" });
      r.end(JSON.stringify({ metodo: q.method, ruta: q.url, cuerpo: Buffer.concat(partes).toString() }));
    });
  });
  await new Promise((r) => web.listen(0, "127.0.0.1", r));
  const puerta = P.crearPuertaLocal({ tlsOpciones: { ca: cert.cert } });
  const { s, post } = await servidorDe(puerta);
  const visto = [];
  let parar = () => undefined;
  try {
    // Sin la página al otro lado (modo apagado): el error es de red y NADA salió.
    const e0 = await new Promise((res) => {
      const q = https.request({ host: "localhost", port: web.address().port, path: "/api/x", method: "POST", agent: puerta.agenteMalla() }, () => res(null));
      q.on("error", res);
      q.end("x");
    });
    assert.equal(e0.code, "ENETUNREACH");
    assert.equal(e0.starseedNoEnviado, true);
    assert.equal(e0.starseedRed, true);
    assert.equal(golpes, 0);

    await post("modo", JSON.stringify({ activo: true, proxy: false }));
    parar = paginaPuente(post, web.address().port, visto);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(puerta.disponibleMalla(), true);
    const r = await new Promise((res, rej) => {
      const q = https.request({ host: "localhost", port: web.address().port, path: "/api/secreta-777?x=1", method: "POST", agent: puerta.agenteMalla() }, (rr) => {
        const t2 = [];
        rr.on("data", (c) => t2.push(c));
        rr.on("end", () => res(JSON.parse(Buffer.concat(t2).toString())));
      });
      q.on("error", rej);
      q.end("cuerpo-unico");
    });
    assert.deepEqual(r, { metodo: "POST", ruta: "/api/secreta-777?x=1", cuerpo: "cuerpo-unico" });
    assert.equal(golpes, 1, "el envío llegó UNA vez");
    const todo = Buffer.concat(visto).toString("latin1");
    assert.equal(todo.includes("secreta-777") || todo.includes("cuerpo-unico"), false, "la malla solo ve bytes cifrados");
    // Apagar el modo: sin salida otra vez.
    await post("modo", JSON.stringify({ activo: false }));
    assert.equal(puerta.disponibleMalla(), false);
  } finally {
    parar();
    puerta.parar();
    s.closeAllConnections();
    s.close();
    web.close();
    fs.rmSync(cert.dir, { recursive: true, force: true });
  }
});

const SERVIDOR_DE_MENTIRA = `
const http = require("node:http");
const s = http.createServer((req, res) => {
  const t = [];
  req.on("data", (c) => t.push(c));
  req.on("end", () => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ quien: "next-local", ruta: req.url, metodo: req.method, cuerpo: Buffer.concat(t).toString() }));
  });
});
s.listen(Number(process.env.PORT), process.env.HOSTNAME);
`;

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

test("de punta a punta: sin red propia, las /api/* de la app llegan a la web publicada por el túnel (sin duplicar envíos)", { timeout: 40_000 }, async (t) => {
  const cert = certificado(["web.invalid"]);
  if (!cert) return t.skip("sin openssl");
  const PASE = "0123456789abcdef".repeat(4);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-arranque-malla-"));
  fs.writeFileSync(path.join(dir, "server.js"), SERVIDOR_DE_MENTIRA);
  for (const f of ["starseed-arranque.cjs", "guarda.cjs", "puerta.cjs"]) fs.copyFileSync(path.join(__dirname, "..", f), path.join(dir, f));
  const recibidos = [];
  const web = https.createServer({ key: cert.key, cert: cert.cert }, (q, r) => {
    const partes = [];
    q.on("data", (b) => partes.push(b));
    q.on("end", () => {
      recibidos.push(`${q.method} ${q.url} ${Buffer.concat(partes).toString()}`);
      r.writeHead(200, { "content-type": "application/json" });
      r.end(JSON.stringify({ quien: "web-publicada", ruta: q.url, cuerpo: Buffer.concat(partes).toString(), host: q.headers.host }));
    });
  });
  await new Promise((r) => web.listen(0, "127.0.0.1", r));
  const puerto = await puertoLibre();
  // `web.invalid` no resuelve (RFC 6761): «sin internet». NODE_EXTRA_CA_CERTS = el certificado de la web de la prueba.
  const env = { ...process.env, STARSEED_PUERTO: String(puerto), STARSEED_FIRMA: "firma-1", STARSEED_WEB_PUBLICADA: "https://web.invalid", STARSEED_PAUSA_RED_MS: "120000", NODE_EXTRA_CA_CERTS: cert.ruta };
  delete env.STARSEED_PASE_VENTANA;
  const hijo = spawn(process.execPath, ["starseed-arranque.cjs"], { cwd: dir, stdio: ["pipe", "pipe", "pipe"], env });
  hijo.stdin.write(`pase:${PASE}\n`);
  let salida = "";
  hijo.stdout.on("data", (c) => (salida += c));
  hijo.stderr.on("data", (c) => (salida += c));
  const LOCAL = `http://127.0.0.1:${puerto}`;
  const propio = { origin: LOCAL, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", cookie: `starseed_pase=${PASE}` };
  const postPuerta = (accion, cuerpo) => pedir(puerto, PRE + accion, { method: "POST", body: cuerpo, headers: { ...propio, "content-type": "application/octet-stream" } });
  let parar = () => undefined;
  try {
    await esperar(async () => {
      const j = JSON.parse((await pedir(puerto, "/__starseed/salud")).body);
      return j.listo && j.interna !== "comprobando";
    });

    // 1 · Sin malla: como siempre, a la copia local (también un POST, repetido en local); la web no recibe nada.
    const l = await pedir(puerto, "/api/datos", { headers: propio });
    assert.equal(l.headers["x-starseed-ruta"], "local");
    assert.equal(JSON.parse(l.body).quien, "next-local");
    assert.equal(recibidos.length, 0);

    // 2 · La página enciende el modo y atiende los túneles.
    assert.equal((await postPuerta("modo", JSON.stringify({ activo: true, proxy: false }))).status, 200);
    parar = paginaPuente((accion, cuerpo) => postPuerta(accion, cuerpo), web.address().port, []);
    await new Promise((r) => setTimeout(r, 150));

    // 3 · Un GET va a la web publicada por el túnel.
    const g = await pedir(puerto, "/api/os/versiones?x=1", { headers: propio });
    assert.equal(g.status, 200, g.body + salida);
    assert.equal(g.headers["x-starseed-ruta"], "web-malla");
    assert.equal(JSON.parse(g.body).quien, "web-publicada");
    assert.equal(JSON.parse(g.body).host, "web.invalid");

    // 4 · Un POST va UNA vez, con su cuerpo.
    const p = await pedir(puerto, "/api/eco", { method: "POST", body: "uno-dos", headers: { ...propio, "content-type": "text/plain" } });
    assert.equal(p.headers["x-starseed-ruta"], "web-malla");
    assert.equal(JSON.parse(p.body).cuerpo, "uno-dos");
    assert.deepEqual(recibidos, ["GET /api/os/versiones?x=1 ", "POST /api/eco uno-dos"], "ni un envío duplicado");

    // 5 · El resto (páginas) sigue en local.
    const pag = await pedir(puerto, "/escritorios", { headers: { "sec-fetch-site": "none", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } });
    assert.equal(pag.headers["x-starseed-ruta"], "local");

    // 6 · Se apaga el modo: vuelve a la copia local y la web no recibe más.
    assert.equal((await postPuerta("modo", JSON.stringify({ activo: false }))).status, 200);
    const fin = await pedir(puerto, "/api/datos", { headers: propio });
    assert.equal(fin.headers["x-starseed-ruta"], "local");
    assert.equal(recibidos.length, 2);
  } finally {
    parar();
    hijo.stdin.end();
    hijo.kill("SIGTERM");
    web.close();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(cert.dir, { recursive: true, force: true });
  }
});
