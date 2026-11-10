"use strict";
// PTA1108A · puerta.cjs: tuberías de bytes, proxy CONNECT con TLS de punta a punta y fetch por la malla.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const tls = require("node:tls");
const { execFileSync } = require("node:child_process");
const P = require("../puerta.cjs");

const PRE = P.PREFIJO;

test("ipInterna: loopback, privadas, enlace local, CGNAT, multicast, mapeadas e IPv6 locales", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fd00::1", "::ffff:10.0.0.1", "::ffff:7f00:1", "no-es-ip"]) {
    assert.equal(P.ipInterna(ip), true, ip);
  }
  for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"]) assert.equal(P.ipInterna(ip), false, ip);
});

test("resolverSeguro: rechaza DNS que mezcla públicas y privadas y nombres locales", async () => {
  const mixto = async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.7", family: 4 }];
  await assert.rejects(P.resolverSeguro("raro.example", false, mixto), /destino-interno/);
  await assert.rejects(P.resolverSeguro("localhost", false), /destino-interno/);
  await assert.rejects(P.resolverSeguro("impresora.local", false), /destino-interno/);
  await assert.rejects(P.resolverSeguro("192.168.1.9", false), /destino-interno/);
  await assert.rejects(P.resolverSeguro("a b", false), /destino-no-valido/);
  const bien = await P.resolverSeguro("publico.example", false, async () => [{ address: "93.184.216.34", family: 4 }]);
  assert.equal(bien.ip, "93.184.216.34");
  assert.equal((await P.resolverSeguro("192.168.1.9", { cidrs: ["192.168.1.0/24"], hosts: [], puertos: [443] })).ip, "192.168.1.9"); // capa LAN concedida
});

function servidorDe(puerta) {
  return new Promise((res) => {
    const s = http.createServer((q, r) => puerta.manejar(q, r));
    s.listen(0, "127.0.0.1", () => res({ s, base: `http://127.0.0.1:${s.address().port}` }));
  });
}
const post = (base, accion, cuerpo, cab) => fetch(base + PRE + accion, { method: "POST", body: cuerpo === undefined ? undefined : typeof cuerpo === "string" || Buffer.isBuffer(cuerpo) ? cuerpo : JSON.stringify(cuerpo), headers: cab });

/** La «página»: copia entre una tubería de ENTRADA y una de SALIDA hacia el destino real (como el túnel de la malla). */
function paginaPuente(base, destino, visto) {
  let vivo = true;
  const bombear = async (de, a) => {
    try {
      await bombearSinRed(de, a);
    } catch {
      /* el servidor de la prueba ya se cerró */
    }
  };
  const bombearSinRed = async (de, a) => {
    while (vivo) {
      let r;
      try {
        r = await post(base, `leer?id=${de}`);
      } catch {
        return;
      }
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length) {
        visto && visto.push(b);
        const w = await post(base, `escribir?id=${a}`, b);
        if (w.status !== 200) return;
      }
      if (r.headers.get("x-puerta-cierre")) return void post(base, `cerrar?id=${a}`).catch(() => undefined);
    }
  };
  (async () => {
    while (vivo) {
      let r;
      try {
        r = await post(base, "pendientes");
      } catch {
        return;
      }
      const { tuberias } = await r.json().catch(() => ({ tuberias: [] }));
      for (const t of tuberias) {
        try {
        const sal = await (await post(base, "tcp", { host: "127.0.0.1", port: destino, concedido: { cidrs: ["127.0.0.1/32"], puertos: [destino] } })).json();
        if (!sal.id) {
          await post(base, `abierto?id=${t.id}`, { ok: false, m: sal.error });
          continue;
        }
        await post(base, `abierto?id=${t.id}`, { ok: true });
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

function certificado() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pta-cert-"));
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "k.pem"), "-out", path.join(dir, "c.pem"), "-days", "2", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
    const r = { key: fs.readFileSync(path.join(dir, "k.pem")), cert: fs.readFileSync(path.join(dir, "c.pem")) };
    return r;
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("solo POST y la salida rechaza destinos privados salvo permiso del dueño", async () => {
  const puerta = P.crearPuertaLocal();
  const { s, base } = await servidorDe(puerta);
  try {
    assert.equal((await fetch(base + PRE + "estado")).status, 405);
    assert.deepEqual(await (await post(base, "tcp", { host: "127.0.0.1", port: 9 })).json(), { error: "destino-interno" });
    assert.deepEqual(await (await post(base, "tcp", { host: "metadata.internal", port: 443 })).json(), { error: "destino-interno" });
    assert.equal((await post(base, "leer?id=nada")).status, 404);
  } finally {
    puerta.parar();
    s.closeAllConnections();
    s.close();
  }
});

test("salida: bytes de ida y vuelta por la tubería (con permiso para la LAN)", async () => {
  const eco = net.createServer((c) => c.on("data", (b) => c.write(Buffer.concat([Buffer.from("eco:"), b]))));
  await new Promise((r) => eco.listen(0, "127.0.0.1", r));
  const puerta = P.crearPuertaLocal();
  const { s, base } = await servidorDe(puerta);
  try {
    const { id } = await (await post(base, "tcp", { host: "127.0.0.1", port: eco.address().port, concedido: { cidrs: ["127.0.0.1/32"], puertos: [eco.address().port] } })).json();
    assert.ok(id);
    assert.equal((await post(base, `escribir?id=${id}`, Buffer.from("hola"))).status, 200);
    const r = await post(base, `leer?id=${id}`);
    assert.equal(Buffer.from(await r.arrayBuffer()).toString(), "eco:hola");
    await post(base, `cerrar?id=${id}`);
    const fin = await post(base, `leer?id=${id}`);
    assert.equal(fin.headers.get("x-puerta-cierre"), "fin");
  } finally {
    puerta.parar();
    s.closeAllConnections();
    s.close();
    eco.close();
  }
});

test("proxy CONNECT: el TLS va de punta a punta y la «malla» solo ve bytes cifrados", async (t) => {
  const cert = certificado();
  if (!cert) return t.skip("sin openssl");
  const web = https.createServer(cert, (q, r) => r.end("hola-desde-el-sitio:" + q.url));
  await new Promise((r) => web.listen(0, "127.0.0.1", r));
  const puerta = P.crearPuertaLocal();
  const { s, base } = await servidorDe(puerta);
  const visto = [];
  const parar = paginaPuente(base, web.address().port, visto);
  try {
    // Apagado: el proxy no existe / responde 503.
    const m = await (await post(base, "modo", { activo: true })).json();
    assert.ok(m.proxy > 0);
    const socket = await new Promise((res, rej) => {
      const q = http.request({ host: "127.0.0.1", port: m.proxy, method: "CONNECT", path: `localhost:${web.address().port}` });
      q.on("connect", (r, sock) => (r.statusCode === 200 ? res(sock) : rej(new Error("connect " + r.statusCode))));
      q.on("error", rej);
      q.end();
    });
    const cuerpo = await new Promise((res, rej) => {
      const c = tls.connect({ socket, servername: "localhost", ca: cert.cert }, () => c.write("GET /secreto-123 HTTP/1.1\r\nhost: localhost\r\nconnection: close\r\n\r\n"));
      let acc = "";
      c.on("data", (b) => (acc += b));
      c.on("end", () => res(acc));
      c.on("error", rej);
    });
    assert.match(cuerpo, /hola-desde-el-sitio:\/secreto-123/);
    const todo = Buffer.concat(visto).toString("latin1");
    assert.equal(todo.includes("secreto-123"), false, "la malla no debe ver la ruta ni el contenido");
    assert.equal(todo.includes("hola-desde-el-sitio"), false);
    assert.ok(Buffer.concat(visto).length > 500);
    // Apagado de nuevo: 503.
    await post(base, "modo", { activo: false });
  } finally {
    parar();
    puerta.parar();
    s.closeAllConnections();
    s.close();
    web.close();
  }
});

test("fetch: la petición de la app sale por la tubería con TLS de Node de punta a punta", async (t) => {
  const cert = certificado();
  if (!cert) return t.skip("sin openssl");
  const web = https.createServer(cert, (q, r) => {
    const partes = [];
    q.on("data", (b) => partes.push(b));
    q.on("end", () => {
      r.writeHead(201, { "x-prueba": "si", "content-type": "application/json" });
      r.end(JSON.stringify({ metodo: q.method, ruta: q.url, cuerpo: Buffer.concat(partes).toString(), apikey: q.headers.apikey || null, cookie: q.headers.cookie || null, ae: q.headers["accept-encoding"] }));
    });
  });
  await new Promise((r) => web.listen(0, "127.0.0.1", r));
  const puerta = P.crearPuertaLocal({ tlsOpciones: { ca: cert.cert }, permitirPuertoFetch: true });
  const { s, base } = await servidorDe(puerta);
  const visto = [];
  const parar = paginaPuente(base, web.address().port, visto);
  try {
    await post(base, "modo", { activo: true, proxy: false });
    await new Promise((r) => setTimeout(r, 60));
    const peticion = { url: `https://localhost:${web.address().port}/rest/v1/perfiles?select=*`, metodo: "POST", cabeceras: [["apikey", "clave-1"], ["cookie", "no-debe-pasar"], ["accept-encoding", "gzip"]] };
    const r = await post(base, "fetch", '{"a":1}', { "x-puerta-peticion": encodeURIComponent(JSON.stringify(peticion)) });
    assert.equal(r.status, 200, await r.clone().text());
    const meta = JSON.parse(decodeURIComponent(r.headers.get("x-puerta-respuesta")));
    assert.equal(meta.status, 201);
    assert.deepEqual(meta.cabeceras.find((c) => c[0] === "x-prueba"), ["x-prueba", "si"]);
    const j = JSON.parse(await r.text());
    assert.equal(j.metodo, "POST");
    assert.equal(j.ruta, "/rest/v1/perfiles?select=*");
    assert.equal(j.cuerpo, '{"a":1}');
    assert.equal(j.apikey, "clave-1");
    assert.equal(j.cookie, null);
    assert.equal(j.ae, "identity");
    assert.equal(Buffer.concat(visto).toString("latin1").includes("perfiles"), false, "la malla no ve la ruta");
    // PTA1110A: http ya viaja (puerto 80); otros esquemas, credenciales y otros puertos se rechazan
    for (const url of ["ftp://x.test/", "https://u:p@x.test/"]) {
      const m = await post(base, "fetch", undefined, { "x-puerta-peticion": encodeURIComponent(JSON.stringify({ url, metodo: "GET" })) });
      assert.equal(m.status, 400);
    }
  } finally {
    parar();
    puerta.parar();
    s.closeAllConnections();
    s.close();
    web.close();
  }
});

test("sin la página al otro lado, el proxy y el fetch responden 503 sin colgarse", async () => {
  const puerta = P.crearPuertaLocal();
  const { s, base } = await servidorDe(puerta);
  try {
    const m = await (await post(base, "modo", { activo: true })).json();
    const codigo = await new Promise((res) => {
      const q = http.request({ host: "127.0.0.1", port: m.proxy, method: "CONNECT", path: "example.com:443" });
      q.on("connect", (r, sock) => (sock.destroy(), res(r.statusCode)));
      q.on("response", (r) => res(r.statusCode));
      q.on("error", () => res(0));
      q.end();
    });
    assert.equal(codigo, 503);
    const f = await post(base, "fetch", undefined, { "x-puerta-peticion": encodeURIComponent(JSON.stringify({ url: "https://example.com/", metodo: "GET" })) });
    assert.equal(f.status, 503);
  } finally {
    puerta.parar();
    s.closeAllConnections();
    s.close();
  }
});

test("STARSEED_PUERTA=0 la apaga", () => {
  assert.equal(P.habilitada({ STARSEED_PUERTA: "0" }), false);
  assert.equal(P.habilitada({}), true);
});

/* ───────── PTA1108C · capas concedidas y DNS rebinding ───────── */

test("PTA1108C concesión: solo lo concedido, incluidos IP literal fuera de rango y rangos no concedibles", async () => {
  const lan = { cidrs: ["192.168.1.0/24"], hosts: [], puertos: [443] };
  assert.equal((await P.resolverSeguro("192.168.1.20", lan)).ip, "192.168.1.20");
  await assert.rejects(P.resolverSeguro("192.168.2.20", lan), /destino-interno/); // otra subred
  await assert.rejects(P.resolverSeguro("192.168.1.1.", { cidrs: [], hosts: [], puertos: [443] }), /destino-interno/); // sin rango
  await assert.rejects(P.resolverSeguro("169.254.169.254", { cidrs: ["169.254.0.0/16"], hosts: [], puertos: [80] }), /destino-interno/); // metadatos de la nube: nunca concedible
  await assert.rejects(P.resolverSeguro("::1", lan), /destino-interno/);
  await assert.rejects(P.resolverSeguro("fd00::5", lan), /destino-interno/);
  assert.equal(P.dentroDeConcesion("::ffff:192.168.1.7", lan, () => []), true); // mapeada en IPv4 dentro del rango
  assert.equal(P.dentroDeConcesion("10.0.0.1", lan, () => []), false);
});

test("PTA1108C DNS rebinding: un nombre concedido que resuelve fuera de la concesión se rechaza", async () => {
  const concesion = { hosts: ["nas.casa.lan"], cidrs: ["192.168.1.50/32"], puertos: [443] };
  const buena = async () => [{ address: "192.168.1.50", family: 4 }];
  assert.equal((await P.resolverSeguro("nas.casa.lan", concesion, buena)).ip, "192.168.1.50");
  // El mismo nombre ahora apunta a otra máquina de la LAN, al propio equipo o a los metadatos de la nube.
  for (const ip of ["192.168.1.1", "127.0.0.1", "169.254.169.254", "10.0.0.9"]) {
    await assert.rejects(P.resolverSeguro("nas.casa.lan", concesion, async () => [{ address: ip, family: 4 }]), /destino-interno/, ip);
  }
  // Mezcla pública + privada fuera de la concesión.
  await assert.rejects(P.resolverSeguro("nas.casa.lan", concesion, async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }]), /destino-interno/);
  // Un nombre público NO concedido que de pronto resuelve a la LAN (rebinding clásico).
  await assert.rejects(P.resolverSeguro("malo.example", concesion, async () => [{ address: "192.168.1.50", family: 4 }]), /destino-interno/);
  // Nombre local sin concesión.
  await assert.rejects(P.resolverSeguro("nas.casa.local", null, buena), /destino-interno/);
});

test("PTA1108C subredes de las interfaces: solo privadas, no internas ni públicas", () => {
  const falsas = () => ({
    lo: [{ family: "IPv4", address: "127.0.0.1", netmask: "255.0.0.0", internal: true }],
    en0: [{ family: "IPv4", address: "192.168.1.20", netmask: "255.255.255.0", internal: false }, { family: "IPv6", address: "fe80::1", netmask: "ffff:ffff:ffff:ffff::", internal: false }],
    en1: [{ family: "IPv4", address: "8.8.4.4", netmask: "255.255.255.0", internal: false }],
  });
  assert.deepEqual(P.subredesLocales(falsas), ["192.168.1.20/24"]);
  const c = { hosts: ["impresora.lan"], cidrs: [], puertos: [443], subredes: true };
  assert.equal(P.dentroDeConcesion("192.168.1.99", c, () => P.subredesLocales(falsas)), true);
  assert.equal(P.dentroDeConcesion("192.168.7.99", c, () => P.subredesLocales(falsas)), false);
});

test("PTA1108C tcp: puerto fuera de la concesión y concesión mal formada", async () => {
  const eco = net.createServer((c) => c.on("data", (b) => c.write(b)));
  await new Promise((r) => eco.listen(0, "127.0.0.1", r));
  const puerta = P.crearPuertaLocal();
  const { s, base } = await servidorDe(puerta);
  try {
    const p = eco.address().port;
    const otroPuerto = await (await post(base, "tcp", { host: "127.0.0.1", port: p, concedido: { cidrs: ["127.0.0.1/32"], puertos: [p + 1] } })).json();
    assert.equal(otroPuerto.error, "puerto-no-permitido");
    const sin = await (await post(base, "tcp", { host: "127.0.0.1", port: p, permitirPrivadas: true })).json(); // el viejo interruptor ya no abre nada
    assert.equal(sin.error, "destino-interno");
    const mala = await (await post(base, "tcp", { host: "127.0.0.1", port: p, concedido: { cidrs: ["0.0.0.0/0"], puertos: [p] } })).json();
    assert.ok(mala.id); // 127.0.0.1 sí es concedible y cae en 0.0.0.0/0...
    await post(base, `cerrar?id=${mala.id}`);
    const nube = await (await post(base, "tcp", { host: "169.254.169.254", port: 80, concedido: { cidrs: ["0.0.0.0/0"], puertos: [80] } })).json();
    assert.equal(nube.error, "destino-interno"); // ...pero los metadatos de la nube nunca
  } finally {
    puerta.parar();
    s.closeAllConnections();
    s.close();
    eco.close();
  }
});
