"use strict";
// PTA1110A · puerta.cjs: sonda propia solo web y pública, IA local declarada, destinos internos siguen cerrados.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const P = require("../puerta.cjs");

const PRE = P.PREFIJO;
function servidorDe(puerta) {
  return new Promise((res) => {
    const s = http.createServer((q, r) => puerta.manejar(q, r));
    s.listen(0, "127.0.0.1", () => res({ s, base: `http://127.0.0.1:${s.address().port}` }));
  });
}
const post = (base, accion, cuerpo) => fetch(base + PRE + accion, { method: "POST", body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
async function con(fn) {
  const puerta = P.crearPuertaLocal();
  const { s, base } = await servidorDe(puerta);
  try {
    await fn(base);
  } finally {
    puerta.parar();
    s.closeAllConnections();
    s.close();
  }
}

test("sonda: puertos no web se rechazan y los hosts internos no se sondean", () =>
  con(async (base) => {
    assert.equal((await post(base, "sonda", { host: "example.com", port: 9090 })).status, 400);
    const r = await (await post(base, "sonda", { host: "127.0.0.1", port: 443 })).json();
    assert.equal(r.ok, false);
    const r2 = await (await post(base, "sonda", { host: "192.168.1.5", port: 80 })).json();
    assert.equal(r2.ok, false);
  }));

test("estado devuelve la lista de puertos de IA local (array)", () =>
  con(async (base) => {
    const e = await (await post(base, "estado")).json();
    assert.ok(Array.isArray(e.ia));
  }));

test("un loopback sin concesión sigue cerrado aunque el puerto sea de IA", async () => {
  const srv = net.createServer((c) => c.end());
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  try {
    await con(async (base) => {
      const j = await (await post(base, "tcp", { host: "127.0.0.1", port: srv.address().port })).json();
      assert.equal(j.error, "destino-interno");
    });
  } finally {
    srv.close();
  }
});
