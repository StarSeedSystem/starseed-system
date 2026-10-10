// Lo que habla con fuera: caché semipública, réplica por lotes, es_metagenesis y Caddy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { abrirAlmacen } from "../src/almacen.mjs";
import { crearArriendo } from "../src/arriendo.mjs";
import { crearBus } from "../src/bus.mjs";
import { crearCache } from "../src/cache.mjs";
import { asegurarRutaCaddy, ID_RUTA } from "../src/caddy.mjs";
import { huella } from "../src/fichas.mjs";
import { crearMetricas } from "../src/metricas.mjs";
import { crearPresencia } from "../src/presencia.mjs";
import { crearReplica } from "../src/replica.mjs";
import { crearCacheMetagenesis, crearSupabase } from "../src/supabase.mjs";
import { CUENTA, fetchFalso, PROYECTO, reloj } from "./ayudas.mjs";

test("caché: una sola petición para muchas lecturas a la vez, TTL, obsoleto si Supabase cae", async () => {
  const ahora = reloj();
  let n = 0;
  let caido = false;
  const f = fetchFalso({
    "GET /rest/v1/os_estaciones": async () => {
      n += 1;
      await new Promise((r) => setTimeout(r, 20));
      return caido ? [503, { message: "caído" }] : [200, [{ id: "e1", titulo: "Omnifrecuencias" }]];
    },
  });
  const db = abrirAlmacen(":memory:");
  const met = crearMetricas(db, { ahora });
  const cache = crearCache(crearSupabase({ url: PROYECTO, anon: "anon-publica", fetch: f, metricas: met }), { ahora });
  const rs = await Promise.all(Array.from({ length: 10 }, () => cache.leer("estaciones")));
  assert.ok(rs.every((r) => r.ok && r.datos[0].id === "e1"));
  assert.equal(n, 1, "diez lecturas a la vez = UNA petición");
  await cache.leer("estaciones");
  assert.equal(n, 1, "dentro del TTL no se pregunta");
  ahora.avanzar(61_000);
  caido = true;
  const r = await cache.leer("estaciones");
  assert.equal(r.ok, true);
  assert.equal(r.obsoleto, true);
  assert.equal((await cache.leer("versiones")).codigo, 401, "versiones pide sesión");
  assert.equal((await cache.leer("perfiles")).codigo, 404, "solo recursos de la lista");
  assert.equal(met.delDia().grupos.cache.a_supabase, 2);
  // La petición fue con la clave pública, sin sesión.
  assert.equal(f.llamadas[0].init.headers.authorization, "Bearer anon-publica");
});

test("es_metagenesis: con la sesión de la cuenta, 10 min si sí, 2 min si no, y un fallo no concede", async () => {
  const ahora = reloj();
  let respuesta = [200, true];
  const f = fetchFalso({ "POST /rest/v1/rpc/es_metagenesis": () => respuesta });
  const es = crearCacheMetagenesis(crearSupabase({ url: PROYECTO, anon: "anon", fetch: f }), { ahora });
  assert.equal(await es(CUENTA, "jwt-de-la-cuenta"), true);
  assert.equal(f.llamadas[0].init.headers.authorization, "Bearer jwt-de-la-cuenta");
  await es(CUENTA, "jwt");
  assert.equal(f.llamadas.length, 1);
  ahora.avanzar(10 * 60_000 + 1);
  respuesta = [500, { message: "x" }];
  assert.equal(await es(CUENTA, "jwt"), false);
});

function montarReplica({ respuesta = () => [200, { ok: true }], tope = 1500, freno = false, llave = "llave-de-la-puerta-0123456789abcdef" } = {}) {
  const ahora = reloj();
  const db = abrirAlmacen(":memory:");
  const lotes = [];
  const f = fetchFalso({
    "POST /rest/v1/rpc/puerta_datos_replicar": (u, init) => {
      lotes.push(JSON.parse(init.body));
      return respuesta();
    },
  });
  const sb = crearSupabase({ url: PROYECTO, anon: "anon", fetch: f });
  const rep = crearReplica(db, sb, { ahora, llave, topeDia: tope, frenoActivo: () => freno });
  return { ahora, db, lotes, rep, bus: crearBus(db, { ahora }), pres: crearPresencia(db, { ahora }), ar: crearArriendo(db, { ahora }) };
}

test("réplica: un lote por pasada, solo lo no silencioso, marca al confirmar y nada dos veces", async () => {
  const m = montarReplica();
  for (let i = 0; i < 3; i++) m.bus.publicar({ quien: "enjambre", tipo: "integrada", texto: `T${i}` });
  m.bus.publicar({ quien: "nodo", tipo: "mg_latido", texto: "" });
  m.pres.latirNeurona(CUENTA, { neurona: "mac-1" });
  m.pres.marcarPresencia(CUENTA, {});
  m.ar.registrar("mac-a1b2c3", "mac", huella("k".repeat(40)));
  m.ar.latir({ nodo: "mac-a1b2c3", llave: "k".repeat(40), puntos: 300 });
  const r = await m.rep.pasada();
  assert.equal(r.hecho, true);
  assert.equal(m.lotes.length, 1);
  const lote = m.lotes[0]._lote;
  assert.equal(m.lotes[0]._llave, "llave-de-la-puerta-0123456789abcdef");
  assert.equal(lote.eventos.length, 3);
  assert.equal(lote.neuronas[0].cuenta, CUENTA);
  assert.equal(lote.presencia.length, 1);
  assert.equal(lote.arriendo.lider, "mac-a1b2c3");
  // Segunda pasada inmediata: nada nuevo (latidos sin 30 min de novedad, arriendo igual).
  m.pres.latirNeurona(CUENTA, { neurona: "mac-1" });
  m.ar.latir({ nodo: "mac-a1b2c3", llave: "k".repeat(40), puntos: 300 });
  assert.equal((await m.rep.pasada()).motivo, "nada que replicar");
  // 31 min después la neurona vuelve a viajar (resumen), el arriendo también (cada 30 min).
  m.ahora.avanzar(31 * 60_000);
  m.pres.latirNeurona(CUENTA, { neurona: "mac-1" });
  m.ar.latir({ nodo: "mac-a1b2c3", llave: "k".repeat(40), puntos: 300 });
  await m.rep.pasada();
  assert.equal(m.lotes.length, 2);
  assert.equal(m.lotes[1]._lote.eventos, undefined);
  assert.equal(m.lotes[1]._lote.neuronas.length, 1);
});

test("réplica: un fallo no marca nada, espera creciente; sin migración espera 6 h; tope diario", async () => {
  let estado = 503;
  const m = montarReplica({ respuesta: () => [estado, { message: "x", code: estado === 404 ? "PGRST202" : "X" }], tope: 3 });
  m.bus.publicar({ quien: "a", tipo: "aviso", texto: "1" });
  assert.equal((await m.rep.pasada()).hecho, false);
  assert.equal(m.rep.pendientes().eventos, 1, "lo fallido sigue en la cola");
  assert.equal((await m.rep.pasada()).motivo, "esperando tras un fallo");
  m.ahora.avanzar(5 * 60_000 + 1);
  estado = 404;
  await m.rep.pasada();
  assert.equal(m.rep.estado().sin_migracion, true);
  m.ahora.avanzar(60 * 60_000);
  assert.equal((await m.rep.pasada()).motivo, "esperando tras un fallo");
  estado = 200;
  await m.rep.pasada({ forzar: true });
  assert.equal(m.rep.pendientes().eventos, 0);
  m.bus.publicar({ quien: "a", tipo: "aviso", texto: "2" });
  assert.equal((await m.rep.pasada()).motivo, "tope del día alcanzado");
});

test("réplica: con el freno puesto solo viaja lo esencial; sin llave no sale nada", async () => {
  const m = montarReplica({ freno: true });
  m.bus.publicar({ quien: "a", tipo: "aviso", texto: "1" });
  m.pres.marcarPresencia(CUENTA, {});
  await m.rep.pasada();
  assert.equal(m.lotes[0]._lote.eventos, undefined);
  assert.equal(m.lotes[0]._lote.presencia.length, 1);
  const s = montarReplica({ llave: "" });
  s.bus.publicar({ quien: "a", tipo: "aviso", texto: "1" });
  assert.equal((await s.rep.pasada()).motivo, "sin llave de réplica");
  assert.equal(s.lotes.length, 0);
});

test("Caddy: añade la ruta si falta, no la duplica y la corrige si cambió", async () => {
  let ruta = null;
  const servidores = { srv0: { listen: [":443"], routes: [{ match: [{ host: ["bitnet.x.sslip.io"] }] }] } };
  const admin = "http://localhost:2019";
  const f = fetchFalso({
    [`GET /id/${ID_RUTA}`]: () => (ruta ? [200, ruta] : [404, { error: "unknown object ID" }]),
    [`PATCH /id/${ID_RUTA}`]: (u, init) => {
      ruta = JSON.parse(init.body);
      return [200, {}];
    },
    "GET /config/apps/http/servers": () => [200, servidores],
    "POST /config/apps/http/servers/srv0/routes": (u, init) => {
      ruta = JSON.parse(init.body);
      return [200, {}];
    },
  });
  let r = await asegurarRutaCaddy({ admin, host: "datos.x.sslip.io", puerto: 8791, fetch: f });
  assert.deepEqual([r.ok, r.accion], [true, "anadida"]);
  assert.equal(ruta.match[0].host[0], "datos.x.sslip.io");
  assert.ok(JSON.stringify(ruta).includes("127.0.0.1:8791"));
  r = await asegurarRutaCaddy({ admin, host: "datos.x.sslip.io", puerto: 8791, fetch: f });
  assert.equal(r.accion, "ya-estaba");
  r = await asegurarRutaCaddy({ admin, host: "datos.y.sslip.io", puerto: 8791, fetch: f });
  assert.equal(r.accion, "anadida");
  assert.equal(ruta.match[0].host[0], "datos.y.sslip.io");
  assert.equal((await asegurarRutaCaddy({ admin, host: "", puerto: 8791, fetch: f })).accion, "sin-host");
});

test("Caddy: pedirAdmin habla HTTP sin cabeceras de navegador (Caddy rechaza Sec-Fetch-Mode sin origen)", async () => {
  const { createServer } = await import("node:http");
  const { pedirAdmin } = await import("../src/caddy.mjs");
  let cabeceras = null;
  const srv = createServer((req, res) => {
    cabeceras = req.headers;
    let cuerpo = "";
    req.on("data", (t) => (cuerpo += t));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ metodo: req.method, cuerpo }));
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  try {
    const r = await pedirAdmin(`http://127.0.0.1:${srv.address().port}/config/`, { method: "POST", headers: { "content-type": "application/json" }, body: "{\"a\":1}" });
    assert.equal(r.ok, true);
    assert.deepEqual(await r.json(), { metodo: "POST", cuerpo: "{\"a\":1}" });
    assert.equal(cabeceras["sec-fetch-mode"], undefined);
    assert.equal(cabeceras.origin, undefined);
  } finally {
    srv.close();
  }
});
