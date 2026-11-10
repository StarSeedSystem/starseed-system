"use strict";
// PTA1110A · el proxy local de puerta.cjs de punta a punta: http simple, CONNECT a :80 y :8080, ws:// por upgrade y puerto refusado.
// La «página» (puente) hace de la malla: recibe host y puerto pedidos por el proxy y los lleva a un servidor local de prueba.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const net = require("node:net");
const P = require("../puerta.cjs");

const PRE = P.PREFIJO;
const post = (base, accion, cuerpo) => fetch(base + PRE + accion, { method: "POST", body: cuerpo === undefined ? undefined : typeof cuerpo === "string" || Buffer.isBuffer(cuerpo) ? cuerpo : JSON.stringify(cuerpo) });

function servidorDe(puerta) {
  return new Promise((res) => {
    const s = http.createServer((q, r) => puerta.manejar(q, r));
    s.listen(0, "127.0.0.1", () => res({ s, base: `http://127.0.0.1:${s.address().port}` }));
  });
}

/** Sitio de prueba: responde texto y acepta WebSocket (eco). */
function sitio() {
  const s = http.createServer((q, r) => r.end("hola:" + q.headers.host + q.url));
  s.on("upgrade", (q, socket) => {
    const acepta = crypto.createHash("sha1").update(q.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + acepta + "\r\n\r\n");
    socket.on("data", (b) => socket.write(b));
    socket.on("error", () => {});
  });
  return new Promise((res) => s.listen(0, "127.0.0.1", () => res(s)));
}

/** La página: lleva cada tubería pedida al sitio de prueba, y rechaza los puertos que `rechazar` diga (como la política de puertos). */
function puenteMalla(base, destino, pedidos, rechazar) {
  let vivo = true;
  const copiar = async (de, a) => {
    try {
      while (vivo) {
        const r = await post(base, `leer?id=${de}`);
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length) {
          const w = await post(base, `escribir?id=${a}`, b);
          if (w.status !== 200) return;
        }
        if (r.headers.get("x-puerta-cierre")) return void post(base, `cerrar?id=${a}`).catch(() => undefined);
      }
    } catch {
      /* cerrado */
    }
  };
  (async () => {
    while (vivo) {
      let j;
      try {
        j = await (await post(base, "pendientes")).json();
      } catch {
        return;
      }
      for (const t of j.tuberias || []) {
        pedidos.push({ host: t.host, port: t.port });
        if (rechazar(t.port)) {
          await post(base, `abierto?id=${t.id}`, { ok: false, m: "puerto-no-permitido" });
          continue;
        }
        const sal = await (await post(base, "tcp", { host: "127.0.0.1", port: destino, concedido: { cidrs: ["127.0.0.1/32"], puertos: [destino] } })).json();
        if (!sal.id) {
          await post(base, `abierto?id=${t.id}`, { ok: false, m: sal.error });
          continue;
        }
        await post(base, `abierto?id=${t.id}`, { ok: true });
        void copiar(t.id, sal.id);
        void copiar(sal.id, t.id);
      }
    }
  })().catch(() => undefined);
  return () => {
    vivo = false;
  };
}

async function montar(fn) {
  const web = await sitio();
  const puerta = P.crearPuertaLocal();
  const { s, base } = await servidorDe(puerta);
  const pedidos = [];
  const parar = puenteMalla(base, web.address().port, pedidos, (p) => p === 23);
  try {
    const m = await (await post(base, "modo", { activo: true })).json();
    assert.ok(m.proxy > 0);
    await new Promise((r) => setTimeout(r, 80));
    await fn({ proxy: m.proxy, pedidos });
  } finally {
    parar();
    puerta.parar();
    s.closeAllConnections();
    s.close();
    web.closeAllConnections();
    web.close();
  }
}

const connect = (proxy, destino) =>
  new Promise((res, rej) => {
    const q = http.request({ host: "127.0.0.1", port: proxy, method: "CONNECT", path: destino });
    q.on("connect", (r, sock) => res({ estado: r.statusCode, sock }));
    q.on("error", rej);
    q.end();
  });

test("http simple por el proxy: llega con su host y el puerto 80", () =>
  montar(async ({ proxy, pedidos }) => {
    const cuerpo = await new Promise((res, rej) => {
      http.get({ host: "127.0.0.1", port: proxy, path: "http://sitio.example/ruta?x=1", headers: { host: "sitio.example" } }, (r) => {
        const partes = [];
        r.on("data", (b) => partes.push(b));
        r.on("end", () => res(Buffer.concat(partes).toString()));
      }).on("error", rej);
    });
    assert.match(cuerpo, /^hola:sitio\.example\/ruta\?x=1/);
    assert.ok(pedidos.some((p) => p.host === "sitio.example" && p.port === 80));
  }));

test("CONNECT a :80 y a :8080 abren túnel con el host y el puerto pedidos", () =>
  montar(async ({ proxy, pedidos }) => {
    for (const puerto of [80, 8080]) {
      const { estado, sock } = await connect(proxy, `sitio.example:${puerto}`);
      assert.equal(estado, 200);
      const texto = await new Promise((res) => {
        sock.once("data", (b) => res(b.toString()));
        sock.write("GET /dentro HTTP/1.1\r\nhost: sitio.example\r\nconnection: close\r\n\r\n");
      });
      assert.match(texto, /hola:sitio\.example\/dentro/);
      sock.destroy();
      assert.ok(pedidos.some((p) => p.host === "sitio.example" && p.port === puerto), "puerto " + puerto);
    }
  }));

test("puerto refusado (23): el proxy contesta 502 con el motivo y no abre nada", () =>
  montar(async ({ proxy }) => {
    const r = await new Promise((res, rej) => {
      const q = http.request({ host: "127.0.0.1", port: proxy, method: "CONNECT", path: "sitio.example:23" });
      q.on("connect", (resp) => res(resp));
      q.on("error", rej);
      q.end();
    });
    assert.equal(r.statusCode, 502);
    assert.equal(r.headers["x-puerta-motivo"], "puerto-no-permitido");
  }));

test("ws:// por upgrade del proxy: apretón 101 y eco de bytes", () =>
  montar(async ({ proxy, pedidos }) => {
    const sock = net.connect(proxy, "127.0.0.1");
    await new Promise((r) => sock.once("connect", r));
    sock.write(
      "GET ws://sitio.example/socket HTTP/1.1\r\nHost: sitio.example\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
    );
    const cab = await new Promise((res) => {
      let acum = "";
      sock.on("data", function f(b) {
        acum += b.toString("latin1");
        if (acum.includes("\r\n\r\n")) {
          sock.off("data", f);
          res(acum);
        }
      });
    });
    assert.match(cab, /^HTTP\/1\.1 101/);
    const eco = await new Promise((res) => {
      sock.once("data", (b) => res(b.toString()));
      sock.write("ping-ws");
    });
    assert.equal(eco, "ping-ws");
    sock.destroy();
    assert.ok(pedidos.some((p) => p.host === "sitio.example" && p.port === 80));
  }));
