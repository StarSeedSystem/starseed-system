// De punta a punta por HTTP de verdad (puerto efímero en 127.0.0.1).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAlmacen } from "../src/almacen.mjs";
import { crearArriendo } from "../src/arriendo.mjs";
import { crearBus } from "../src/bus.mjs";
import { crearCache } from "../src/cache.mjs";
import { leerConfig } from "../src/config.mjs";
import { crearFichero, huella, nuevaFicha } from "../src/fichas.mjs";
import { crearVerificador } from "../src/jwt.mjs";
import { crearMalla } from "../src/malla.mjs";
import { crearMetricas } from "../src/metricas.mjs";
import { crearPresencia } from "../src/presencia.mjs";
import { crearReplica } from "../src/replica.mjs";
import { crearServidor } from "../src/servidor.mjs";
import { crearCacheMetagenesis, crearSupabase } from "../src/supabase.mjs";
import { clavesEc, CUENTA, fetchFalso, OTRA, PROYECTO, sesion } from "./ayudas.mjs";

let servidor;
let base;
let k;
let fichaAstraura;
let fichaBus;
let fichaAdmin;
let miembros;
const registros = [];

before(async () => {
  k = clavesEc();
  miembros = new Set([CUENTA]);
  const dir = mkdtempSync(join(tmpdir(), "puerta-e2e-"));
  const rutaFichas = join(dir, "tokens.json");
  fichaAstraura = nuevaFicha(rutaFichas, "astraura-mac", ["malla", "astraura"]);
  fichaBus = nuevaFicha(rutaFichas, "enjambre-mac", ["bus", "latidos"]);
  fichaAdmin = nuevaFicha(rutaFichas, "admin-mac", ["admin"]);
  const f = fetchFalso({
    "GET /auth/v1/.well-known/jwks.json": () => [200, { keys: [k.jwk] }],
    "POST /rest/v1/rpc/es_metagenesis": (u, init) => [200, miembros.has(JSON.parse(init.body)._uid)],
    "GET /rest/v1/os_freno": () => [200, [{ activo: false }]],
  });
  const config = { ...leerConfig({ SUPABASE_URL: PROYECTO, SUPABASE_ANON_KEY: "anon", PUERTA_FICHAS: rutaFichas }), puerto: 0 };
  const db = abrirAlmacen(join(dir, "puerta.db"));
  const metricas = crearMetricas(db);
  const supabase = crearSupabase({ url: PROYECTO, anon: "anon", fetch: f, metricas });
  const malla = crearMalla(db);
  servidor = crearServidor({
    config,
    metricas,
    malla,
    verificador: crearVerificador({ supabaseUrl: PROYECTO, fetch: f, alPedir: () => metricas.aSupabase("jwks") }),
    fichero: crearFichero(rutaFichas),
    bus: crearBus(db),
    arriendo: crearArriendo(db),
    presencia: crearPresencia(db),
    cache: crearCache(supabase),
    replica: crearReplica(db, supabase, { llave: "" }),
    esMetagenesis: crearCacheMetagenesis(supabase),
    estadoCaddy: () => ({ ok: true }),
    registrar: (r) => registros.push(r),
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor?.close());

async function pedir(ruta, { metodo = "GET", cred = null, cuerpo, origen } = {}) {
  const headers = {};
  if (cred) headers.authorization = `Bearer ${cred}`;
  if (cuerpo !== undefined) headers["content-type"] = "application/json";
  if (origen) headers.origin = origen;
  const r = await fetch(`${base}${ruta}`, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const texto = await r.text();
  return { estado: r.status, j: texto ? JSON.parse(texto) : null, h: r.headers };
}

test("/salud sin credencial y sin secretos", async () => {
  const r = await pedir("/salud");
  assert.equal(r.estado, 200);
  assert.equal(r.j.ok, true);
  const texto = JSON.stringify(r.j);
  assert.ok(!/anon|pd_|supabase\.co|sslip/.test(texto), texto);
  assert.equal(r.h.get("x-content-type-options"), "nosniff");
});

test("sesión verificada en local: neuronas y presencia solo de esa cuenta", async () => {
  const yo = sesion(k);
  const otra = sesion(k, { sub: OTRA });
  assert.equal((await pedir("/v1/neuronas")).estado, 401);
  assert.equal((await pedir("/v1/neuronas/latido", { metodo: "POST", cred: yo, cuerpo: { neurona: "mac-1", medio: "web" } })).estado, 200);
  await pedir("/v1/neuronas/latido", { metodo: "POST", cred: otra, cuerpo: { neurona: "movil-2" } });
  const mias = await pedir("/v1/neuronas", { cred: yo });
  assert.deepEqual(mias.j.neuronas.map((n) => n.neurona), ["mac-1"]);
  const caducada = sesion(k, { exp: Math.floor(Date.now() / 1000) - 600 });
  assert.equal((await pedir("/v1/neuronas", { cred: caducada })).estado, 401);
  const r = await pedir("/v1/yo", { cred: yo });
  assert.deepEqual([r.j.tipo, r.j.cuenta, r.j.es_metagenesis], ["cuenta", CUENTA, true]);
});

test("bus: ficha o sesión; espera larga; una ficha sin ámbito no publica", async () => {
  assert.equal((await pedir("/v1/bus/eventos", { metodo: "POST", cuerpo: { quien: "x", tipo: "y" } })).estado, 401);
  assert.equal((await pedir("/v1/bus/eventos", { metodo: "POST", cred: fichaAstraura, cuerpo: { quien: "x", tipo: "y" } })).estado, 403);
  const p = await pedir("/v1/bus/eventos", { metodo: "POST", cred: fichaBus, cuerpo: { quien: "enjambre", tipo: "integrada", texto: "T1" } });
  assert.equal(p.estado, 200);
  const l = await pedir("/v1/bus/eventos?limite=10", { cred: sesion(k) });
  assert.ok(l.j.eventos.some((e) => e.texto === "T1"));
  const t0 = Date.now();
  const espera = pedir(`/v1/bus/eventos?desde=${l.j.ultimo}&esperar=5`, { cred: fichaBus });
  setTimeout(() => pedir("/v1/bus/eventos", { metodo: "POST", cred: fichaBus, cuerpo: { quien: "vigia", tipo: "aviso", texto: "ya" } }), 100);
  const r = await espera;
  assert.equal(r.j.eventos[0].texto, "ya");
  assert.ok(Date.now() - t0 < 3000);
  assert.equal((await pedir("/v1/bus/eventos", { metodo: "POST", cred: fichaBus, cuerpo: { quien: "x".repeat(50), tipo: "y" } })).estado, 400);
});

test("malla y estado de Astraura solo con ficha; claves de memoria no admitidas", async () => {
  assert.equal((await pedir("/v1/malla/nodos", { cred: sesion(k) })).estado, 403);
  assert.equal((await pedir("/v1/malla/nodos", { metodo: "POST", cred: fichaAstraura, cuerpo: { node_id: "mac-1", url: "https://n" } })).estado, 200);
  assert.equal((await pedir("/v1/malla/nodos", { cred: fichaAstraura })).j.nodos.length, 1);
  assert.equal((await pedir("/v1/astraura/estado/mem0", { metodo: "PUT", cred: fichaAstraura, cuerpo: { data: {} } })).estado, 404);
  assert.equal((await pedir("/v1/astraura/estado/destino_fijo", { metodo: "PUT", cred: fichaAstraura, cuerpo: { data: { url: "https://d" } } })).estado, 200);
  assert.equal((await pedir("/v1/astraura/estado/destino_fijo", { cred: fichaAstraura })).j.data.url, "https://d");
  assert.equal((await pedir("/v1/astraura/estado/destino_fijo", { cred: sesion(k) })).estado, 403);
});

test("MetaGenesis: nodo con su llave, órdenes solo de miembros", async () => {
  const llave = "n".repeat(48);
  assert.equal((await pedir("/v1/admin/nodos", { metodo: "POST", cred: fichaBus, cuerpo: { nodo: "mac-a1b2c3", medio: "mac", huella: huella(llave) } })).estado, 403);
  assert.equal((await pedir("/v1/admin/nodos", { metodo: "POST", cred: fichaAdmin, cuerpo: { nodo: "mac-a1b2c3", medio: "mac", huella: huella(llave) } })).estado, 200);
  const l = await pedir("/v1/metagenesis/latir", { metodo: "POST", cuerpo: { nodo: "mac-a1b2c3", llave, puntos: 300 } });
  assert.equal(l.j.arriendo.lider, "mac-a1b2c3");
  assert.equal((await pedir("/v1/metagenesis/latir", { metodo: "POST", cuerpo: { nodo: "mac-a1b2c3", llave: "x".repeat(48) } })).estado, 403);
  assert.equal((await pedir("/v1/metagenesis/ordenes", { metodo: "POST", cred: sesion(k, { sub: OTRA }), cuerpo: { accion: "continuar" } })).estado, 403);
  const o = await pedir("/v1/metagenesis/ordenes", { metodo: "POST", cred: sesion(k), cuerpo: { accion: "revisar_bloqueadas" } });
  assert.equal(o.estado, 200);
  const l2 = await pedir("/v1/metagenesis/latir", { metodo: "POST", cuerpo: { nodo: "mac-a1b2c3", llave, puntos: 300 } });
  assert.deepEqual(l2.j.ordenes.map((x) => x.accion), ["revisar_bloqueadas"]);
  const vista = await pedir("/v1/metagenesis/arriendo", { cred: sesion(k) });
  assert.equal(vista.j.arriendo.lider, "mac-a1b2c3");
  assert.equal((await pedir("/v1/metagenesis/arriendo", { cred: sesion(k, { sub: OTRA }) })).estado, 403);
});

test("freno empujado por la vigía; caché semipública; métricas con ahorro", async () => {
  const ficha = fichaAdmin;
  const antes = await pedir("/v1/freno");
  assert.equal(antes.j.fuente, "supabase");
  assert.equal((await pedir("/v1/freno", { metodo: "PUT", cred: ficha, cuerpo: { activo: true, motivo: "tope" } })).estado, 200);
  const despues = await pedir("/v1/freno");
  assert.deepEqual([despues.j.fuente, despues.j.freno.activo], ["vigia", true]);
  const m = await pedir("/v1/metricas", { cred: ficha });
  assert.equal(m.estado, 200);
  assert.ok(m.j.hoy.servidas > 0);
  assert.ok(m.j.hoy.grupos.jwks.a_supabase >= 1);
  assert.equal((await pedir("/v1/metricas", { cred: sesion(k, { sub: OTRA }) })).estado, 403);
});

test("CORS solo para orígenes del OS, sin cookies; JSON obligatorio; cuerpo con tope; rutas desconocidas", async () => {
  const pre = await fetch(`${base}/v1/neuronas`, { method: "OPTIONS", headers: { origin: "https://starseed-os.vercel.app" } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), "https://starseed-os.vercel.app");
  assert.equal(pre.headers.get("access-control-allow-credentials"), null);
  assert.equal((await pedir("/salud", { origen: "https://malicioso.example" })).estado, 403);
  const sinJson = await fetch(`${base}/v1/presencia`, { method: "POST", headers: { authorization: `Bearer ${sesion(k)}`, "content-type": "text/plain" }, body: "x" });
  assert.equal(sinJson.status, 415);
  const grande = await pedir("/v1/bus/eventos", { metodo: "POST", cred: fichaBus, cuerpo: { quien: "a", tipo: "b", texto: "x".repeat(70_000) } });
  assert.equal(grande.estado, 413);
  assert.equal((await pedir("/no-existe")).estado, 404);
  assert.equal((await pedir("/v1/neuronas", { metodo: "PUT", cred: sesion(k), cuerpo: {} })).estado, 405);
  assert.equal((await pedir("/v1/neuronas", { cred: "pd_" + "x".repeat(43) })).estado, 401);
  // Ningún registro lleva fichas ni sesiones.
  assert.ok(registros.every((r) => !JSON.stringify(r).includes("pd_") && !JSON.stringify(r).includes("eyJ")));
});

test("límite por identidad: 120/min por cuenta", async () => {
  const s = sesion(k, { sub: "00000000-0000-4000-8000-0000000000aa" });
  let ultimo = 0;
  for (let i = 0; i < 125; i++) ultimo = (await pedir("/v1/neuronas", { cred: s })).estado;
  assert.equal(ultimo, 429);
});
