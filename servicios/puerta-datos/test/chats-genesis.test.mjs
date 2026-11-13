// GEN1113A · chats de Genesis en la puerta, de punta a punta por HTTP de verdad (puerto efímero en
// 127.0.0.1), más unas pruebas directas del módulo (retención con 60.000 filas, caché del rol).
// Contrato: architecture/astraura-chats-genesis.md §4.1–§4.5, §5.2 y §7.1.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAlmacen } from "../src/almacen.mjs";
import { crearArriendo } from "../src/arriendo.mjs";
import { crearBus } from "../src/bus.mjs";
import { crearCache } from "../src/cache.mjs";
import { crearChatsGenesis, validarEntrada, requiereDueno, caduca, destinoDe } from "../src/chats-genesis.mjs";
import { leerConfig } from "../src/config.mjs";
import { crearFichero, nuevaFicha } from "../src/fichas.mjs";
import { crearVerificador } from "../src/jwt.mjs";
import { crearMalla } from "../src/malla.mjs";
import { crearMetricas } from "../src/metricas.mjs";
import { crearPresencia } from "../src/presencia.mjs";
import { crearReplica } from "../src/replica.mjs";
import { crearServidor } from "../src/servidor.mjs";
import { crearCacheMetagenesis, crearCacheMetagenesisDueno, crearSupabase } from "../src/supabase.mjs";
import { clavesEc, CUENTA, fetchFalso, OTRA, PROYECTO, reloj, sesion } from "./ayudas.mjs";

const DUENO = CUENTA;
const DEV = OTRA;
const NADIE = "00000000-0000-4000-8000-0000000000bb";
const DUENO2 = "00000000-0000-4000-8000-0000000000cc";
const FRESCA = "00000000-0000-4000-8000-0000000000dd";
const SECRETO = "TEXTO-SECRETO-GEN1113A";

let servidor;
let base;
let k;
let db;
let comp;
let fMac;
let fA1;
let fAdmin;
let fBus;
let caido = false;
const duenos = new Set([DUENO, DUENO2, FRESCA]);
const miembros = new Set([DUENO, DEV, DUENO2, FRESCA]);
const registros = [];
const ahora = reloj(Date.now());

before(async () => {
  k = clavesEc();
  const dir = mkdtempSync(join(tmpdir(), "puerta-gen-"));
  const rutaFichas = join(dir, "tokens.json");
  fMac = nuevaFicha(rutaFichas, "genesis-mac", ["genesis-mac"]);
  fA1 = nuevaFicha(rutaFichas, "genesis-a1", ["genesis-a1"]);
  fAdmin = nuevaFicha(rutaFichas, "admin-mac", ["admin"]);
  fBus = nuevaFicha(rutaFichas, "enjambre-mac", ["bus"]);
  const rol = (conjunto) => (u, init) => (caido ? [500, { message: "caído" }] : [200, conjunto.has(JSON.parse(init.body)._uid)]);
  const f = fetchFalso({
    "GET /auth/v1/.well-known/jwks.json": () => [200, { keys: [k.jwk] }],
    "POST /rest/v1/rpc/es_metagenesis": rol(miembros),
    "POST /rest/v1/rpc/es_metagenesis_dueno": rol(duenos),
  });
  const config = { ...leerConfig({ SUPABASE_URL: PROYECTO, SUPABASE_ANON_KEY: "anon", PUERTA_FICHAS: rutaFichas }), puerto: 0 };
  db = abrirAlmacen(join(dir, "puerta.db"));
  const metricas = crearMetricas(db);
  const supabase = crearSupabase({ url: PROYECTO, anon: "anon", fetch: f, metricas });
  // Sin `chatsGenesis` ni `esMetagenesisDueno`: el bloque GEN1113A de servidor.mjs los crea solo,
  // como en producción (bin/puerta-datos.mjs pasa `db` y `supabase`).
  comp = {
    db, supabase, config, metricas, ahora,
    malla: crearMalla(db),
    verificador: crearVerificador({ supabaseUrl: PROYECTO, fetch: f }),
    fichero: crearFichero(rutaFichas),
    bus: crearBus(db),
    arriendo: crearArriendo(db),
    presencia: crearPresencia(db),
    cache: crearCache(supabase),
    replica: crearReplica(db, supabase, { llave: "" }),
    esMetagenesis: crearCacheMetagenesis(supabase),
    estadoCaddy: () => ({ ok: true }),
    registrar: (r) => registros.push(r),
    genesisA1Escritura: true, // GEN1114A: estas pruebas escriben también al A1 (fase 1b)
  };
  servidor = crearServidor(comp);
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor?.close());

async function pedir(ruta, { metodo = "GET", cred = null, cuerpo } = {}) {
  const headers = {};
  if (cred) headers.authorization = `Bearer ${cred}`;
  if (cuerpo !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(`${base}${ruta}`, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const texto = await r.text();
  return { estado: r.status, j: texto ? JSON.parse(texto) : null };
}

const nonce = () => randomBytes(16).toString("base64url");
const entrada = (extra = {}) => ({ v: 1, nonce: nonce(), t: new Date().toISOString(), fuente: "direccion", accion: "decir", texto: "hola", ...extra });

// GEN1114A: desde la segunda ola la puerta solo acepta entradas firmadas por un aparato (v2, §3.4 de
// architecture/astraura-chats-identidad-firma.md). Estas pruebas de GEN1113 siguen comprobando lo
// mismo (rol, forma, nonce, límites, caducidad, fichas), pero cada EntradaChat va dentro de una carga
// firmada con una clave de prueba, como hará la web. La puerta no verifica la firma (lo hace la Mac).
const aparatoPrueba = (() => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const huellaA = createHash("sha256").update(publicKey.export({ format: "der", type: "spki" })).digest("hex");
  return { privateKey, huella: huellaA, seq: 0 };
})();
function firmada(sub, e) {
  const t = ahora();
  const carga = {
    aud: "starseed.genesis.chats.v1", cuenta: sub, aparato: aparatoPrueba.huella, seq: ++aparatoPrueba.seq,
    t: new Date(t).toISOString(), caduca: new Date(t + 7 * 86_400_000).toISOString(),
    destino: destinoDe(e.fuente), chat: "genesis", chatNombre: "GENESIS · StarSeed OS", entrada: e,
  };
  const bytes = Buffer.from(JSON.stringify(carga), "utf8");
  const firma = sign("sha256", bytes, { key: aparatoPrueba.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return { v: 2, carga: bytes.toString("base64url"), firma, aparato: aparatoPrueba.huella };
}
const deCarga = (fila) => JSON.parse(Buffer.from(fila.carga, "base64url").toString("utf8"));
const enviar = (sub, cuerpo) => pedir("/v1/genesis/chats/entrada", { metodo: "POST", cred: sesion(k, { sub }), cuerpo: cuerpo?.v === 1 ? firmada(sub, cuerpo) : cuerpo });
const orden = (nombre, args = [], extra = {}) => entrada({ fuente: "puente:hermes-avisos", accion: "orden", texto: undefined, orden: { nombre, args }, ...extra });
const cuantas = () => Number(db.prepare("SELECT count(*) AS n FROM genesis_entradas").get().n);

test("sin sesión 401; cuenta que no es miembro 403 no-miembro (leer y escribir)", async () => {
  assert.equal((await pedir("/v1/genesis/chats/feed?fuente=direccion")).estado, 401);
  assert.equal((await pedir("/v1/genesis/chats/entrada", { metodo: "POST", cuerpo: entrada() })).estado, 401);
  const f = await pedir("/v1/genesis/chats/feed?fuente=direccion", { cred: sesion(k, { sub: NADIE }) });
  assert.deepEqual([f.estado, f.j.codigo], [403, "no-miembro"]);
  const e = await enviar(NADIE, entrada());
  assert.deepEqual([e.estado, e.j.codigo], [403, "no-miembro"]);
  // Una ficha (aunque sea admin) no lee el feed ni escribe entradas: eso es de personas.
  assert.equal((await pedir("/v1/genesis/chats/feed?fuente=direccion", { cred: fAdmin })).estado, 403);
  assert.equal((await pedir("/v1/genesis/chats/entrada", { metodo: "POST", cred: fMac, cuerpo: entrada() })).estado, 403);
});

test("desarrollador: texto al hilo sí (201); todo lo que pone a un agente a trabajar, 403 solo-dueno", async () => {
  const ok = await enviar(DEV, entrada({ canales: ["mando"] }));
  assert.equal(ok.estado, 201);
  assert.deepEqual([ok.j.destino, ok.j.estado, typeof ok.j.id], ["mac", "en-cola", "number"]);
  assert.equal((await enviar(DEV, entrada())).estado, 201); // sin canales = solo el hilo
  for (const malo of [
    entrada({ canales: ["hermes"] }),
    entrada({ canales: ["mando", "director-presidente"] }),
    entrada({ modelo: "director-presidente" }),
    entrada({ accion: "responder", respondeA: "md-1762990000000-a1b2" }),
    entrada({ accion: "reenviar", texto: undefined, reenviar: "md-1762990000000-a1b2", canales: ["hermes"] }),
    orden("aprobar", ["X1"]),
    orden("estado"),
    entrada({ fuente: "puente:hermes-avisos", accion: "texto" }),
    entrada({ fuente: "puente:peticiones", accion: "texto" }),
  ]) {
    const r = await enviar(DEV, malo);
    assert.deepEqual([r.estado, r.j.codigo], [403, "solo-dueno"], JSON.stringify(malo));
  }
  // Leer: la dirección y los avisos de los directores sí; los puentes A y B, no.
  assert.equal((await pedir("/v1/genesis/chats/feed?fuente=direccion", { cred: sesion(k, { sub: DEV }) })).estado, 200);
  assert.equal((await pedir("/v1/genesis/chats/feed?fuente=puente:avisos-directores", { cred: sesion(k, { sub: DEV }) })).estado, 200);
  for (const f of ["puente:hermes-avisos", "puente:peticiones"]) {
    const r = await pedir(`/v1/genesis/chats/feed?fuente=${f}`, { cred: sesion(k, { sub: DEV }) });
    assert.deepEqual([r.estado, r.j.codigo], [403, "solo-dueno"]);
  }
});

test("dueño: órdenes y motores (201), destino por fuente; forma estricta (400); nonce repetido 409", async () => {
  const a = await enviar(DUENO, orden("aprobar", ["ola-12", "T_3.b"]));
  assert.deepEqual([a.estado, a.j.destino], [201, "mac"]);
  const b = await enviar(DUENO, entrada({ fuente: "puente:peticiones", accion: "texto", texto: "busca X" }));
  assert.deepEqual([b.estado, b.j.destino], [201, "a1"]);
  assert.equal((await enviar(DUENO, entrada({ modelo: "director-presidente", canales: ["director-presidente"] }))).estado, 201);
  for (const malo of [
    orden("borrar-todo"),
    orden("aprobar", ["; rm"]),
    orden("reasignar", ["X1"]),
    orden("olas", ["muchas"]),
    entrada({ fuente: "puente:peticiones", accion: "orden", texto: undefined, orden: { nombre: "aprobar", args: ["X1"] } }),
    entrada({ fuente: "puente:avisos-directores", accion: "texto" }),
    entrada({ nonce: "corto" }),
    entrada({ v: 2 }),
    entrada({ canales: ["otro"] }),
    entrada({ modelo: "Modelo Con Espacios" }),
    entrada({ texto: "x".repeat(8001) }),
    entrada({ accion: "responder", respondeA: "no-es-un-id" }),
    entrada({ fuente: "puente:hermes-avisos", accion: "texto", modelo: "hermes" }),
  ]) {
    const r = await enviar(DUENO, malo);
    assert.deepEqual([r.estado, r.j.codigo], [400, "forma"], JSON.stringify(malo).slice(0, 200));
  }
  const repetida = entrada();
  assert.equal((await enviar(DUENO, repetida)).estado, 201);
  const otra = await enviar(DUENO, repetida);
  assert.deepEqual([otra.estado, otra.j.codigo], [409, "nonce-repetido"]);
  // El mismo nonce de OTRA cuenta no choca (único por cuenta).
  assert.equal((await enviar(DEV, repetida)).estado, 201);
  // GEN1114A: el tope pasa de 16 KB a 48 KB de cuerpo y 32 KB de carga (§3.4 [REV]).
  const grande = await enviar(DUENO, entrada({ texto: "x".repeat(7000), relleno: "y".repeat(30_000) }));
  assert.deepEqual([grande.estado, grande.j.codigo], [413, "grande"]);
});

test("`cuenta` y `rol` del cuerpo se ignoran: los pone la puerta desde la sesión y Supabase", async () => {
  const falsa = await enviar(DEV, entrada({ cuenta: DUENO, rol: "dueño", canales: ["hermes"] }));
  assert.deepEqual([falsa.estado, falsa.j.codigo], [403, "solo-dueno"]);
  const r = await enviar(DEV, entrada({ cuenta: DUENO, rol: "dueño", destino: "a1", id: 999999 }));
  assert.equal(r.estado, 201);
  const l = await pedir("/v1/genesis/chats/entrada?destino=mac", { cred: fMac });
  const mia = l.j.entradas.find((e) => e.id === r.j.id);
  assert.deepEqual([mia.cuenta, mia.rol, mia.destino], [DEV, "desarrollador", "mac"]);
  // GEN1114A: la fila entregada lleva el sobre firmado, no la entrada en primer nivel (§5.2 [REV]).
  assert.ok(typeof mia.recibido === "string" && mia.v === 2 && mia.texto === undefined && deCarga(mia).entrada.texto === "hola");
});

test("fichas: genesis-a1 no lee lo de la Mac ni escribe la dirección; cada una acusa solo lo suyo", async () => {
  const leerMac = await pedir("/v1/genesis/chats/entrada?destino=mac", { cred: fA1 });
  assert.equal(leerMac.estado, 403);
  const espejoDir = await pedir("/v1/genesis/chats/espejo", { metodo: "POST", cred: fA1, cuerpo: { fuente: "direccion", registros: [] } });
  assert.equal(espejoDir.estado, 403);
  assert.equal((await pedir("/v1/genesis/chats/espejo", { metodo: "POST", cred: fA1, cuerpo: { fuente: "puente:hermes-avisos", registros: [] } })).estado, 403);
  assert.equal((await pedir("/v1/genesis/chats/espejo", { metodo: "POST", cred: fMac, cuerpo: { fuente: "puente:peticiones", registros: [] } })).estado, 403);
  assert.equal((await pedir("/v1/genesis/chats/entrada?destino=a1", { cred: fMac })).estado, 403);
  // Ni el admin ni otra ficha entran por estas rutas: ámbito explícito.
  assert.equal((await pedir("/v1/genesis/chats/entrada?destino=mac", { cred: fAdmin })).estado, 403);
  assert.equal((await pedir("/v1/genesis/chats/entrada?destino=mac", { cred: fBus })).estado, 403);
  assert.equal((await pedir("/v1/genesis/chats/entrada?destino=mac")).estado, 401);
  // La del A1 sí lee lo suyo y acusa; la de la Mac no puede acusar una entrada del A1.
  const a1 = await pedir("/v1/genesis/chats/entrada?destino=a1", { cred: fA1 });
  assert.equal(a1.estado, 200);
  // GEN1114A: la fuente viaja dentro de la carga firmada, no en primer nivel.
  assert.ok(a1.j.entradas.length >= 1 && a1.j.entradas.every((e) => e.destino === "a1" && e.fuente === undefined && deCarga(e).entrada.fuente === "puente:peticiones"));
  const idA1 = a1.j.entradas[0].id;
  assert.equal((await pedir("/v1/genesis/chats/acuse", { metodo: "POST", cred: fMac, cuerpo: { id: idA1, estado: "hecho" } })).estado, 404);
  const ok = await pedir("/v1/genesis/chats/acuse", { metodo: "POST", cred: fA1, cuerpo: { id: idA1, estado: "hecho", detalle: "contestado" } });
  assert.deepEqual([ok.estado, ok.j.ok], [200, true]);
  assert.equal((await pedir("/v1/genesis/chats/acuse", { metodo: "POST", cred: fA1, cuerpo: { id: idA1, estado: "rara" } })).estado, 400);
  // Ya cerrada: no vuelve a cambiar ni a entregarse.
  assert.equal((await pedir("/v1/genesis/chats/acuse", { metodo: "POST", cred: fA1, cuerpo: { id: idA1, estado: "fallo" } })).j.ok, false);
  const otra = await pedir("/v1/genesis/chats/entrada?destino=a1", { cred: fA1 });
  assert.ok(!otra.j.entradas.some((e) => e.id === idA1));
});

test("acuses: cada cuenta ve solo los de sus entradas", async () => {
  const mia = await enviar(DUENO, entrada({ texto: "para acusar" }));
  const ajena = await enviar(DEV, entrada());
  await pedir("/v1/genesis/chats/acuse", { metodo: "POST", cred: fMac, cuerpo: { id: mia.j.id, estado: "entregado" } });
  const r = await pedir(`/v1/genesis/chats/acuses?ids=${mia.j.id},${ajena.j.id}`, { cred: sesion(k, { sub: DUENO }) });
  assert.equal(r.estado, 200);
  assert.deepEqual(r.j.acuses.map((a) => [a.id, a.estado]), [[mia.j.id, "entregado"]]);
  assert.equal((await pedir("/v1/genesis/chats/acuses?ids=1", { cred: fMac })).estado, 403);
  assert.equal((await pedir(`/v1/genesis/chats/acuses?ids=${Array.from({ length: 51 }, (_, i) => i + 1).join(",")}`, { cred: sesion(k, { sub: DUENO }) })).estado, 400);
});

test("espejo: la Mac escribe, el miembro lee por cursor; un registro que vuelve se mueve al final; latido", async () => {
  const sinLatido = await pedir("/v1/genesis/chats/feed?fuente=puente:avisos-directores", { cred: sesion(k, { sub: DEV }) });
  assert.equal(sinLatido.j.latido, null);
  const regs = [1, 2, 3].map((i) => ({ id: `md-176299000000${i}-000${i}`, t: new Date().toISOString(), de: "alex", rol: "alex", tipo: "mensaje", texto: `m${i}`, canal: "mando", fuente: "falsa", cursor: 77 }));
  const e = await pedir("/v1/genesis/chats/espejo", { metodo: "POST", cred: fMac, cuerpo: { fuente: "direccion", registros: regs } });
  assert.deepEqual([e.estado, e.j.ok, e.j.n], [200, true, 3]);
  const f = await pedir("/v1/genesis/chats/feed?fuente=direccion", { cred: sesion(k, { sub: DEV }) });
  assert.deepEqual(f.j.registros.map((r) => [r.texto, r.fuente]), [["m1", "direccion"], ["m2", "direccion"], ["m3", "direccion"]]);
  assert.equal(f.j.cursor, e.j.cursor);
  assert.equal(f.j.latido.de, "mac");
  const cambio = await pedir("/v1/genesis/chats/espejo", { metodo: "POST", cred: fMac, cuerpo: { fuente: "direccion", registros: [{ ...regs[0], entregas: { hermes: { estado: "respondido" } } }] } });
  const g = await pedir(`/v1/genesis/chats/feed?fuente=direccion&desde=${f.j.cursor}`, { cred: sesion(k, { sub: DEV }) });
  assert.deepEqual(g.j.registros.map((r) => [r.id, r.entregas.hermes.estado]), [[regs[0].id, "respondido"]]);
  assert.equal(g.j.cursor, cambio.j.cursor);
  // Latido solo (sin registros) también cuenta; la fuente del A1 tiene su propio latido.
  assert.equal((await pedir("/v1/genesis/chats/espejo", { metodo: "POST", cred: fA1, cuerpo: { fuente: "puente:peticiones", registros: [], latido: true } })).j.n, 0);
  const p = await pedir("/v1/genesis/chats/feed?fuente=puente:peticiones", { cred: sesion(k, { sub: DUENO }) });
  assert.deepEqual([p.estado, p.j.latido.de, p.j.registros.length], [200, "a1", 0]);
  assert.equal((await pedir("/v1/genesis/chats/espejo", { metodo: "POST", cred: fMac, cuerpo: { fuente: "direccion", registros: [{ texto: "sin id" }] } })).estado, 400);
  assert.equal((await pedir("/v1/genesis/chats/feed?fuente=otra", { cred: sesion(k, { sub: DEV }) })).estado, 400);
});

test("espera larga: la entrada y el espejo responden en cuanto llega algo", async () => {
  const antes = await pedir("/v1/genesis/chats/entrada?destino=mac", { cred: fMac });
  const ultimo = Math.max(0, ...antes.j.entradas.map((e) => e.id));
  let t0 = Date.now();
  const espera = pedir(`/v1/genesis/chats/entrada?destino=mac&desde=${ultimo}&esperar=10`, { cred: fMac });
  setTimeout(() => enviar(DUENO, entrada({ texto: "llega ya" })), 150);
  const r = await espera;
  assert.equal(r.j.entradas.length, 1);
  assert.equal(deCarga(r.j.entradas[0]).entrada.texto, "llega ya");
  assert.ok(Date.now() - t0 < 3000, `tardó ${Date.now() - t0} ms`);

  const f = await pedir("/v1/genesis/chats/feed?fuente=direccion", { cred: sesion(k, { sub: DEV }) });
  t0 = Date.now();
  const esperaFeed = pedir(`/v1/genesis/chats/feed?fuente=direccion&desde=${f.j.cursor}&esperar=10`, { cred: sesion(k, { sub: DEV }) });
  setTimeout(() => pedir("/v1/genesis/chats/espejo", { metodo: "POST", cred: fMac, cuerpo: { fuente: "direccion", registros: [{ id: "md-1762990009999-ffff", texto: "nuevo" }] } }), 150);
  const g = await esperaFeed;
  assert.deepEqual(g.j.registros.map((x) => x.texto), ["nuevo"]);
  assert.ok(Date.now() - t0 < 3000);
  // Sin nada nuevo, vuelve vacía al acabar la espera (corta aquí: 1 s).
  const vacia = await pedir(`/v1/genesis/chats/feed?fuente=direccion&desde=${g.j.cursor}&esperar=1`, { cred: sesion(k, { sub: DEV }) });
  assert.deepEqual([vacia.j.registros.length, vacia.j.cursor], [0, g.j.cursor]);
});

test("rol sin comprobar (Supabase caído): 503 rol-sin-comprobar y nada en cola", async () => {
  const n = cuantas();
  caido = true;
  try {
    const r = await enviar(FRESCA, orden("aprobar", ["X1"]));
    assert.deepEqual([r.estado, r.j.codigo], [503, "rol-sin-comprobar"]);
    const t = await enviar(FRESCA, entrada());
    assert.equal(t.estado, 503);
    const f = await pedir("/v1/genesis/chats/feed?fuente=puente:hermes-avisos", { cred: sesion(k, { sub: FRESCA }) });
    assert.equal(f.estado, 503);
    const d = await pedir("/v1/genesis/chats/feed?fuente=direccion", { cred: sesion(k, { sub: FRESCA }) });
    assert.equal(d.estado, 503, "un «no» de la caché de miembros se confirma con el rol: caída = 503, no 403");
  } finally {
    caido = false;
  }
  assert.equal(cuantas(), n);
});

test("caducidad: una orden que cambia algo y nadie recogió en 30 min no se entrega y queda caducada; un texto no caduca", async () => {
  // Se vacía lo pendiente de la Mac para empezar limpio.
  const prev = await pedir("/v1/genesis/chats/entrada?destino=mac", { cred: fMac });
  for (const e of prev.j.entradas) await pedir("/v1/genesis/chats/acuse", { metodo: "POST", cred: fMac, cuerpo: { id: e.id, estado: "hecho" } });
  const o = await enviar(DUENO, orden("soltar", ["T9"]));
  // GEN1114A [REV §3.6]: un texto a Hermes (`decir`) ya es «alto» y caduca a los 30 min; lo que no
  // caduca es lo «bajo», como `/estado`.
  const t = await enviar(DUENO, orden("estado"));
  const hermes = await enviar(DUENO, orden("decir", [], { texto: "hola Hermes" }));
  const motor = await enviar(DUENO, entrada({ modelo: "hermes/predeterminado", canales: ["hermes"] }));
  ahora.avanzar(31 * 60_000);
  const l = await pedir("/v1/genesis/chats/entrada?destino=mac", { cred: fMac });
  assert.deepEqual(l.j.entradas.map((e) => e.id), [t.j.id]);
  const a = await pedir(`/v1/genesis/chats/acuses?ids=${o.j.id},${motor.j.id},${t.j.id},${hermes.j.id}`, { cred: sesion(k, { sub: DUENO }) });
  const porId = Object.fromEntries(a.j.acuses.map((x) => [x.id, x.estado]));
  assert.deepEqual([porId[o.j.id], porId[motor.j.id], porId[t.j.id], porId[hermes.j.id]], ["caducado", "caducado", "en-cola", "caducado"]);
  // Una orden ya recogida por la Mac antes de los 30 min no la caduca la puerta: la Mac decide.
  const o2 = await enviar(DUENO, orden("rechazar", ["T8"]));
  await pedir("/v1/genesis/chats/entrada?destino=mac", { cred: fMac });
  ahora.avanzar(31 * 60_000);
  const ok = await pedir("/v1/genesis/chats/acuse", { metodo: "POST", cred: fMac, cuerpo: { id: o2.j.id, estado: "hecho" } });
  assert.equal(ok.j.ok, true);
});

test("límite: 30 entradas por minuto por cuenta → 429", async () => {
  let ultimo = 0;
  for (let i = 0; i < 31; i++) ultimo = (await enviar(DUENO2, entrada())).estado;
  assert.equal(ultimo, 429);
  ahora.avanzar(61_000);
  assert.equal((await enviar(DUENO2, entrada())).estado, 201);
});

test("retención por HTTP: espejo 30 días, entradas y acuses 7 días", async () => {
  const e = await enviar(DUENO, entrada({ texto: "vieja" }));
  ahora.avanzar(8 * 86_400_000);
  comp.chatsGenesis.podar();
  const a = await pedir(`/v1/genesis/chats/acuses?ids=${e.j.id}`, { cred: sesion(k, { sub: DUENO }) });
  assert.deepEqual(a.j.acuses, []);
  const antes = await pedir("/v1/genesis/chats/feed?fuente=direccion", { cred: sesion(k, { sub: DEV }) });
  assert.ok(antes.j.registros.length > 0);
  ahora.avanzar(23 * 86_400_000);
  comp.chatsGenesis.podar();
  const despues = await pedir("/v1/genesis/chats/feed?fuente=direccion", { cred: sesion(k, { sub: DEV }) });
  assert.equal(despues.j.registros.length, 0);
});

test("registro sin contenido: ruta, código, ms y 8 caracteres de la cuenta; nunca texto, fichas ni sesiones", async () => {
  const r = await enviar(DUENO, entrada({ texto: SECRETO }));
  assert.equal(r.estado, 201);
  await pedir("/v1/genesis/chats/espejo", { metodo: "POST", cred: fMac, cuerpo: { fuente: "direccion", registros: [{ id: "md-1762990001111-abcd", texto: SECRETO }] } });
  await enviar(DEV, entrada({ texto: SECRETO, canales: ["hermes"] }));
  const todo = JSON.stringify(registros);
  assert.ok(!todo.includes(SECRETO));
  assert.ok(!todo.includes("pd_") && !todo.includes("eyJ"));
  assert.ok(!todo.includes(DUENO), "la cuenta entera no va al registro");
  const mio = registros.filter((x) => x.ruta === "/v1/genesis/chats/entrada" && x.codigo === 201);
  assert.ok(mio.length > 0 && mio.every((x) => Object.keys(x).sort().join() === "codigo,cuenta8,ms,ruta"));
  assert.equal(mio.at(-1).cuenta8, DUENO.slice(0, 8));
});

// ── Directas del módulo ──────────────────────────────────────────────────────────────────────────

test("reglas puras: requiereDueno, caduca y validarEntrada descarta lo que no es del contrato", () => {
  const base = { v: 1, nonce: "a".repeat(22), t: "2026-11-13T10:00:00Z" };
  const decir = validarEntrada({ ...base, fuente: "direccion", accion: "decir", texto: "x", cuenta: "otra", rol: "dueño", extra: 1 });
  assert.deepEqual(Object.keys(decir).sort(), ["accion", "fuente", "nonce", "t", "texto", "v"]);
  assert.equal(requiereDueno(decir), false);
  assert.equal(requiereDueno({ ...decir, canales: ["mando"] }), false);
  assert.equal(requiereDueno({ ...decir, canales: ["ide"] }), true);
  assert.equal(caduca(decir), false);
  assert.equal(caduca({ fuente: "puente:hermes-avisos", accion: "orden", orden: { nombre: "aprobar", args: ["x1"] } }), true);
  assert.equal(caduca({ fuente: "puente:hermes-avisos", accion: "orden", orden: { nombre: "estado", args: [] } }), false);
  assert.equal(caduca({ fuente: "puente:hermes-avisos", accion: "texto", texto: "x" }), false);
  assert.equal(caduca({ fuente: "puente:peticiones", accion: "orden", orden: { nombre: "cancela", args: [] } }), true);
});

test("retención del espejo por tamaño: como mucho 60.000 registros", () => {
  const dbm = abrirAlmacen(":memory:");
  const t = Date.now();
  const cg = crearChatsGenesis({ db: dbm, esMetagenesis: async () => false, esMetagenesisDueno: async () => false, ahora: () => t });
  const ins = dbm.prepare("INSERT INTO genesis_espejo (fuente, rid, t, datos) VALUES ('direccion', ?, ?, '{}')");
  dbm.exec("BEGIN");
  for (let i = 0; i < 60_010; i++) ins.run(`r${i}`, t);
  dbm.exec("COMMIT");
  cg.podar(t);
  const n = Number(dbm.prepare("SELECT count(*) AS n FROM genesis_espejo").get().n);
  assert.equal(n, 60_000);
  assert.equal(dbm.prepare("SELECT rid FROM genesis_espejo ORDER BY cursor LIMIT 1").get().rid, "r10");
});

test("esMetagenesisDueno: caché de 60 s para sí y no; un fallo lanza (nunca concede) y no se cachea como «no»", async () => {
  const t = reloj();
  let llamadas = 0;
  let respuesta = { ok: true, datos: true };
  const sb = { rpc: async (nombre, cuerpo) => { llamadas += 1; assert.equal(nombre, "es_metagenesis_dueno"); assert.equal(cuerpo._uid, DUENO); return respuesta; } };
  const esDueno = crearCacheMetagenesisDueno(sb, { ahora: t });
  assert.equal(await esDueno(DUENO, "jwt"), true);
  assert.equal(await esDueno(DUENO, "jwt"), true);
  assert.equal(llamadas, 1);
  t.avanzar(61_000);
  respuesta = { ok: true, datos: false };
  assert.equal(await esDueno(DUENO, "jwt"), false);
  assert.equal(llamadas, 2);
  t.avanzar(61_000);
  respuesta = { ok: false, estado: 0, datos: null };
  await assert.rejects(esDueno(DUENO, "jwt"));
  await assert.rejects(esDueno(DUENO, "jwt"), "durante la pausa tras el fallo sigue lanzando");
  assert.equal(llamadas, 3);
  t.avanzar(6_000);
  respuesta = { ok: true, datos: true };
  assert.equal(await esDueno(DUENO, "jwt"), true);
  assert.equal(llamadas, 4);
});

test("GEN1113INT: /decir y /a llevan el texto en «texto» (como la pestaña); «responder» no pide texto; «reenviar» pide canales", async () => {
  const largo = "x".repeat(500); // más de 120: no cabría en `args`
  assert.equal((await enviar(DUENO, orden("decir", [], { texto: largo }))).estado, 201);
  assert.equal((await enviar(DUENO, orden("a", ["claude"], { texto: largo }))).estado, 201);
  assert.equal((await enviar(DUENO, entrada({ accion: "responder", texto: undefined, respondeA: "md-1762990000000-a1b2", modelo: "hermes/predeterminado" }))).estado, 201);
  for (const malo of [
    orden("decir", []),                                   // sin texto
    orden("decir", ["hola"], { texto: "hola" }),          // el texto va en «texto», no en args
    orden("a", ["claude"]),                               // sin texto
    orden("a", ["no vale"], { texto: "hola" }),           // agente con espacios
    orden("aprobar", ["X1"], { texto: "colado" }),        // las demás órdenes no llevan texto
    entrada({ accion: "reenviar", texto: undefined, reenviar: "md-1762990000000-a1b2" }),
  ]) {
    const r = await enviar(DUENO, malo);
    assert.deepEqual([r.estado, r.j.codigo], [400, "forma"], JSON.stringify(malo).slice(0, 200));
  }
});
