// GEN1114A · entradas firmadas por el aparato en la puerta, por HTTP de verdad (127.0.0.1, puerto
// efímero). Contrato: architecture/astraura-chats-identidad-firma.md §3.4, §3.5.1, §3.6, §5.2 y §8.1.
// La puerta no es de confianza: solo comprueba la forma y pasa los bytes firmados SIN TOCARLOS.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAlmacen } from "../src/almacen.mjs";
import { crearArriendo } from "../src/arriendo.mjs";
import { crearBus } from "../src/bus.mjs";
import { crearCache } from "../src/cache.mjs";
import { AUD, riesgoDeEntrada, validarEntradaFirmada, b64urlEstricto } from "../src/chats-genesis-firma.mjs";
import { ErrorChats } from "../src/chats-genesis.mjs";
import { leerConfig } from "../src/config.mjs";
import { crearFichero, nuevaFicha } from "../src/fichas.mjs";
import { crearVerificador } from "../src/jwt.mjs";
import { crearMalla } from "../src/malla.mjs";
import { crearMetricas } from "../src/metricas.mjs";
import { crearPresencia } from "../src/presencia.mjs";
import { crearReplica } from "../src/replica.mjs";
import { crearServidor } from "../src/servidor.mjs";
import { crearCacheMetagenesis, crearSupabase } from "../src/supabase.mjs";
import { clavesEc, CUENTA, fetchFalso, OTRA, PROYECTO, reloj, sesion } from "./ayudas.mjs";

const DUENO = CUENTA;
const DEV = OTRA;
const SECRETO = "TEXTO-SECRETO-GEN1114A";
const ahora = reloj(Date.now());
const registros = [];
let k;
let fMac;
let fA1;
let abierto; // con PUERTA_GENESIS_A1_ESCRITURA=1
let cerrado; // sin la variable (fase 1a)

async function montar(extra) {
  const dir = mkdtempSync(join(tmpdir(), "puerta-gen14-"));
  const rutaFichas = join(dir, "tokens.json");
  const fichas = { mac: nuevaFicha(rutaFichas, "genesis-chats-mac", ["genesis-mac"]), a1: nuevaFicha(rutaFichas, "genesis-chats-a1", ["genesis-a1"]) };
  const duenos = new Set([DUENO]);
  const miembros = new Set([DUENO, DEV]);
  const rol = (c) => (u, init) => [200, c.has(JSON.parse(init.body)._uid)];
  const f = fetchFalso({
    "GET /auth/v1/.well-known/jwks.json": () => [200, { keys: [k.jwk] }],
    "POST /rest/v1/rpc/es_metagenesis": rol(miembros),
    "POST /rest/v1/rpc/es_metagenesis_dueno": rol(duenos),
  });
  const config = { ...leerConfig({ SUPABASE_URL: PROYECTO, SUPABASE_ANON_KEY: "anon", PUERTA_FICHAS: rutaFichas }), puerto: 0 };
  const db = abrirAlmacen(join(dir, "puerta.db"));
  const metricas = crearMetricas(db);
  const supabase = crearSupabase({ url: PROYECTO, anon: "anon", fetch: f, metricas });
  const servidor = crearServidor({
    db, supabase, config, metricas, ahora,
    malla: crearMalla(db), verificador: crearVerificador({ supabaseUrl: PROYECTO, fetch: f }), fichero: crearFichero(rutaFichas),
    bus: crearBus(db), arriendo: crearArriendo(db), presencia: crearPresencia(db), cache: crearCache(supabase),
    replica: crearReplica(db, supabase, { llave: "" }), esMetagenesis: crearCacheMetagenesis(supabase),
    estadoCaddy: () => ({ ok: true }), registrar: (r) => registros.push(r), ...extra,
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return { servidor, db, fichas, base: `http://127.0.0.1:${servidor.address().port}` };
}

before(async () => {
  delete process.env.PUERTA_GENESIS_A1_ESCRITURA;
  k = clavesEc();
  abierto = await montar({ genesisA1Escritura: () => true });
  cerrado = await montar({});
  fMac = abierto.fichas.mac;
  fA1 = abierto.fichas.a1;
});
after(() => {
  abierto?.servidor.close();
  cerrado?.servidor.close();
});

async function pedirTexto(p, ruta, { metodo = "GET", cred = null, cuerpo } = {}) {
  const headers = {};
  if (cred) headers.authorization = `Bearer ${cred}`;
  if (cuerpo !== undefined) headers["content-type"] = "application/json";
  const body = cuerpo === undefined ? undefined : typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  const r = await fetch(`${p.base}${ruta}`, { method: metodo, headers, body });
  const texto = await r.text();
  return { estado: r.status, texto, j: texto ? JSON.parse(texto) : null };
}
const pedir = (ruta, op) => pedirTexto(abierto, ruta, op);

// ── Un aparato de prueba que firma como lo hará la web (§3.4) ────────────────────────────────────
function nuevoAparato() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const spki = publicKey.export({ format: "der", type: "spki" });
  return { privateKey, publicKey, huella: createHash("sha256").update(spki).digest("hex"), seq: 0 };
}
const ap = nuevoAparato();
const nonce = () => randomBytes(16).toString("base64url");
const entrada = (extra = {}) => ({ v: 1, nonce: nonce(), t: new Date(ahora()).toISOString(), fuente: "direccion", accion: "decir", texto: "hola", ...extra });
const ordenA = (nombre, args = [], extra = {}) => entrada({ fuente: "puente:hermes-avisos", accion: "orden", texto: undefined, orden: { nombre, args }, ...extra });
const destinoDe = (f) => (f === "puente:peticiones" ? "a1" : "mac");

function cargaDe(sub, e, extra = {}) {
  const t = ahora();
  return {
    aud: AUD, cuenta: sub, aparato: ap.huella, seq: ++ap.seq, t: new Date(t).toISOString(),
    caduca: new Date(t + 30 * 60_000).toISOString(), destino: destinoDe(e.fuente), chat: "genesis",
    chatNombre: "GENESIS · StarSeed OS", entrada: e, ...extra,
  };
}
/** Sobre firmado a partir de los BYTES dados (así una prueba controla cada byte de la carga). */
function sobre(bytes, aparato = ap) {
  const firma = sign("sha256", bytes, { key: aparato.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return { v: 2, carga: Buffer.from(bytes).toString("base64url"), firma, aparato: aparato.huella };
}
const firmada = (sub, e, extra) => sobre(Buffer.from(JSON.stringify(cargaDe(sub, e, extra)), "utf8"));
const enviar = (sub, cuerpo, p = abierto) => pedirTexto(p, "/v1/genesis/chats/entrada", { metodo: "POST", cred: sesion(k, { sub }), cuerpo });
const cuantas = (p = abierto) => {
  try {
    return Number(p.db.prepare("SELECT count(*) AS n FROM genesis_entradas").get().n);
  } catch {
    return 0; // la tabla se crea con la primera petición a Genesis
  }
};

async function vaciarMac() {
  const l = await pedir("/v1/genesis/chats/entrada?destino=mac", { cred: fMac });
  for (const e of l.j.entradas) await pedir("/v1/genesis/chats/acuse", { metodo: "POST", cred: fMac, cuerpo: { id: e.id, estado: "hecho" } });
}

test("una entrada sin sobre de firma (v1) → 400 sin-firma para todos los roles, y no se encola", async () => {
  const n = cuantas();
  for (const sub of [DUENO, DEV]) {
    for (const cuerpo of [entrada(), { ...entrada(), v: undefined }, ordenA("estado")]) {
      const r = await enviar(sub, cuerpo);
      assert.deepEqual([r.estado, r.j.codigo], [400, "sin-firma"], JSON.stringify(cuerpo));
    }
  }
  // Ni aunque el cuerpo traiga una carga suelta o diga v:1 con campos de v2.
  const raro = { ...firmada(DUENO, entrada()), v: 1 };
  assert.deepEqual([(await enviar(DUENO, raro)).j.codigo], ["sin-firma"]);
  assert.equal(cuantas(), n);
});

test("v2 con carga.cuenta distinta de la sesión → 403 firma-cuenta", async () => {
  const r = await enviar(DEV, firmada(DUENO, entrada()));
  assert.deepEqual([r.estado, r.j.codigo], [403, "firma-cuenta"]);
  const r2 = await enviar(DUENO, firmada(DEV, entrada()));
  assert.deepEqual([r2.estado, r2.j.codigo], [403, "firma-cuenta"]);
});

test("la carga llega a la Mac BYTE A BYTE igual: ni reordenada, ni normalizada, ni vuelta a codificar", async () => {
  await vaciarMac();
  // JSON escrito a mano a propósito: campos en un orden raro, espacios, escapes \u y \/, un emoji y
  // canales repetidos (GEN1113 los quitaba con un Set). Cualquier JSON rehecho daría otros bytes.
  const e = { v: 1, nonce: nonce(), t: new Date(ahora()).toISOString() };
  const t = new Date(ahora()).toISOString();
  const caduca = new Date(ahora() + 60_000 * 10).toISOString();
  const texto =
    `{ "entrada" : {"texto":"caf\\u00e9 \\/ 😀 ${SECRETO}", "canales":["mando","mando"], "accion":"decir","fuente":"direccion",` +
    `"t":"${e.t}","nonce":"${e.nonce}","v":1},\n  "chatNombre":"GENESIS \\u00b7 StarSeed OS","chat":"genesis","destino":"mac",` +
    `"caduca":"${caduca}","t":"${t}","seq":${++ap.seq},"aparato":"${ap.huella}","cuenta":"${DUENO}","aud":"${AUD}" }`;
  const bytes = Buffer.from(texto, "utf8");
  assert.notEqual(JSON.stringify(JSON.parse(texto)), texto, "la prueba usa bytes que un JSON rehecho cambiaría");
  const s = sobre(bytes);
  const r = await enviar(DUENO, s);
  assert.equal(r.estado, 201, r.texto);
  const l = await pedir("/v1/genesis/chats/entrada?destino=mac", { cred: fMac });
  const fila = l.j.entradas.find((x) => x.id === r.j.id);
  assert.equal(fila.carga, s.carga, "la cadena carga es la misma");
  assert.ok(l.texto.includes(`"carga":"${s.carga}"`), "y viaja tal cual en la respuesta");
  assert.ok(Buffer.from(fila.carga, "base64url").equals(bytes), "los bytes decodificados son los firmados");
  assert.deepEqual([fila.firma, fila.aparato], [s.firma, s.aparato]);
  assert.ok(verify("sha256", Buffer.from(fila.carga, "base64url"), { key: ap.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(fila.firma, "base64url")));
  // Lo guardado en SQLite también es la cadena recibida.
  assert.equal(abierto.db.prepare("SELECT carga FROM genesis_entradas WHERE id = ?").get(r.j.id).carga, s.carga);
});

test("base64url no canónico (relleno, bits sobrantes, otro alfabeto) → 400 forma: una sola escritura por carga", async () => {
  const s = firmada(DUENO, entrada());
  const sinCanon = (c) => {
    // Cambia el último carácter por otro que decodifica a los mismos bytes (bits de cola distintos).
    const ultimo = c.at(-1);
    const alfa = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (const x of alfa) {
      const otra = c.slice(0, -1) + x;
      if (x !== ultimo && Buffer.from(otra, "base64url").equals(Buffer.from(c, "base64url"))) return otra;
    }
    return null;
  };
  const variantes = [`${s.carga}==`, s.carga.replace(/-/g, "+").replace(/_/g, "/") + (s.carga.includes("-") || s.carga.includes("_") ? "" : "+"), sinCanon(s.carga)].filter(Boolean);
  assert.ok(variantes.length >= 2);
  for (const c of variantes) {
    const r = await enviar(DUENO, { ...s, carga: c });
    assert.deepEqual([r.estado, r.j.codigo], [400, "forma"], c.slice(-6));
  }
  assert.equal(b64urlEstricto(s.carga)?.toString("base64url"), s.carga);
});

test("la fila entregada lleva solo lo que puso la puerta y el sobre: nada de fuente, accion, texto ni orden en primer nivel", async () => {
  await vaciarMac();
  const r = await enviar(DUENO, firmada(DUENO, ordenA("aprobar", ["T1"])));
  assert.equal(r.estado, 201);
  const l = await pedir("/v1/genesis/chats/entrada?destino=mac", { cred: fMac });
  const fila = l.j.entradas.find((x) => x.id === r.j.id);
  assert.deepEqual(Object.keys(fila).sort(), ["aparato", "carga", "cuenta", "destino", "firma", "id", "recibido", "rol", "v"]);
  for (const c of ["fuente", "accion", "texto", "orden", "nonce", "datos"]) assert.equal(fila[c], undefined, c);
  assert.deepEqual([fila.v, fila.cuenta, fila.rol, fila.destino], [2, DUENO, "dueño", "mac"]);
});

test("reglas de rol sobre la carga: un desarrollador con `aprobar` firmado → 403 solo-dueno; texto al hilo sí", async () => {
  const r = await enviar(DEV, firmada(DEV, ordenA("aprobar", ["X1"])));
  assert.deepEqual([r.estado, r.j.codigo], [403, "solo-dueno"]);
  const t = await enviar(DEV, firmada(DEV, entrada({ fuente: "puente:hermes-avisos", accion: "texto" })));
  assert.deepEqual([t.estado, t.j.codigo], [403, "solo-dueno"]);
  assert.equal((await enviar(DEV, firmada(DEV, entrada({ canales: ["mando"] })))).estado, 201);
});

test("nonce repetido dentro de la carga → 409 aunque cambien seq y firma", async () => {
  const e = entrada();
  assert.equal((await enviar(DUENO, firmada(DUENO, e))).estado, 201);
  const r = await enviar(DUENO, firmada(DUENO, e));
  assert.deepEqual([r.estado, r.j.codigo], [409, "nonce-repetido"]);
});

test("tamaños [REV]: un texto de 8.000 caracteres de 4 bytes (~43 KB) entra; 49 KB → 413 grande; carga > 32 KB → 413; > 64 KB → 413", async () => {
  const s = firmada(DUENO, entrada({ texto: "😀".repeat(8000) }));
  const cuerpo = JSON.stringify(s);
  assert.ok(Buffer.byteLength(cuerpo) > 40 * 1024 && Buffer.byteLength(cuerpo) <= 48 * 1024, `${Buffer.byteLength(cuerpo)}`);
  const ok = await enviar(DUENO, cuerpo);
  assert.equal(ok.estado, 201, ok.texto);
  // 49 KB de cuerpo (el sobre con relleno): el tope es del cuerpo crudo.
  const grande = JSON.stringify({ ...firmada(DUENO, entrada({ texto: "😀".repeat(8000) })), relleno: "x".repeat(6 * 1024) });
  assert.ok(Buffer.byteLength(grande) > 48 * 1024 && Buffer.byteLength(grande) < 50 * 1024);
  const g = await enviar(DUENO, grande);
  assert.deepEqual([g.estado, g.j.codigo], [413, "grande"]);
  // Carga de 33 KB decodificada (cuerpo < 48 KB).
  const c33 = firmada(DUENO, entrada({ texto: "x".repeat(7900), relleno: "y".repeat(25 * 1024) }));
  assert.ok(Buffer.byteLength(JSON.stringify(c33)) < 48 * 1024);
  const g2 = await enviar(DUENO, c33);
  assert.deepEqual([g2.estado, g2.j.codigo], [413, "grande"]);
  // Más de 64 KB: lo corta servidor.mjs, también con código claro.
  let g3;
  try {
    g3 = await enviar(DUENO, JSON.stringify({ ...s, relleno: "z".repeat(70 * 1024) }));
  } catch {
    g3 = null; // si la conexión se corta antes de leer la respuesta, el cliente no ve nada
  }
  if (g3) assert.deepEqual([g3.estado, g3.j.codigo], [413, "grande"]);
  const reg = registros.filter((x) => x.codigo === 413 && x.ruta === "/v1/genesis/chats/entrada");
  // Los tres (49 KB, carga de 33 KB y > 64 KB) quedan en el registro como 413 `grande`, aunque el
  // cliente no llegue a leer la respuesta del último.
  assert.ok(reg.length >= 3 && reg.every((x) => x.motivo === "grande"), JSON.stringify(reg));
});

test("forma de la carga: aud, aparato, destino, chat, chatNombre, seq y plazos → 400 forma", async () => {
  const e = () => entrada();
  const casos = [
    firmada(DUENO, e(), { aud: "otro.uso" }),
    firmada(DUENO, e(), { aparato: "0".repeat(64) }),
    firmada(DUENO, e(), { destino: "a1" }),
    firmada(DUENO, e(), { chat: "Genesis Con Espacios" }),
    firmada(DUENO, e(), { chatNombre: "" }),
    firmada(DUENO, e(), { chatNombre: "n".repeat(81) }),
    firmada(DUENO, e(), { seq: 0 }),
    firmada(DUENO, e(), { seq: 1.5 }),
    firmada(DUENO, e(), { t: new Date(ahora() + 6 * 60_000).toISOString() }),
    firmada(DUENO, e(), { caduca: new Date(ahora() - 1000).toISOString() }),
    firmada(DUENO, e(), { entrada: { ...e(), v: 2 } }),
    firmada(DUENO, e(), { entrada: { ...e(), fuente: "puente:avisos-directores", accion: "texto" } }),
    sobre(Buffer.from("[1,2,3]")),
    sobre(Buffer.from([0xff, 0xfe, 0x7b, 0x7d])),
    { ...firmada(DUENO, e()), firma: "x".repeat(85) },
    { ...firmada(DUENO, e()), aparato: "ABC" },
    { v: 2 },
  ];
  for (const c of casos) {
    const r = await enviar(DUENO, c);
    assert.deepEqual([r.estado, r.j.codigo], [400, "forma"], JSON.stringify(c).slice(0, 160));
  }
  // 80 caracteres de 4 bytes caben (se cuentan caracteres, no unidades UTF-16).
  assert.equal((await enviar(DUENO, firmada(DUENO, e(), { chatNombre: "😀".repeat(80) }))).estado, 201);
});

test("[REV] revocarme y revocar-aparato pasan la forma; revocar-aparato de un desarrollador → 403 solo-dueno", async () => {
  const base = () => ({ v: 1, nonce: nonce(), t: new Date(ahora()).toISOString(), fuente: "direccion" });
  assert.equal((await enviar(DUENO, firmada(DUENO, { ...base(), accion: "revocarme" }))).estado, 201);
  assert.equal((await enviar(DEV, firmada(DEV, { ...base(), accion: "revocarme" }))).estado, 201, "retirarse a uno mismo no da poder: cualquier rol");
  assert.equal((await enviar(DUENO, firmada(DUENO, { ...base(), accion: "revocar-aparato", huella: "a".repeat(64) }))).estado, 201);
  const d = await enviar(DEV, firmada(DEV, { ...base(), accion: "revocar-aparato", huella: "a".repeat(64) }));
  assert.deepEqual([d.estado, d.j.codigo], [403, "solo-dueno"]);
  for (const malo of [
    { ...base(), accion: "revocar-aparato" },
    { ...base(), accion: "revocar-aparato", huella: "A".repeat(64) },
    { ...base(), accion: "revocarme", texto: "colado" },
    { ...base(), accion: "revocarme", fuente: "puente:hermes-avisos" },
  ]) {
    const r = await enviar(DUENO, firmada(DUENO, malo, malo.fuente === "direccion" ? {} : { destino: "mac" }));
    assert.deepEqual([r.estado, r.j.codigo], [400, "forma"], JSON.stringify(malo));
  }
  const otroChat = await enviar(DUENO, firmada(DUENO, { ...base(), accion: "revocarme" }, { chat: "genesis.canal.hermes" }));
  assert.deepEqual([otroChat.estado, otroChat.j.codigo], [400, "forma"]);
});

test("[REV] fase 1a: sin PUERTA_GENESIS_A1_ESCRITURA, destino a1 → 403 destino-cerrado y nada en cola; con =1, entra", async () => {
  const pet = () => entrada({ fuente: "puente:peticiones", accion: "texto", texto: "busca X" });
  const n = cuantas(cerrado);
  const r = await enviar(DUENO, firmada(DUENO, pet()), cerrado);
  assert.deepEqual([r.estado, r.j.codigo], [403, "destino-cerrado"]);
  assert.equal(cuantas(cerrado), n);
  // La Mac sí se escribe con la puerta cerrada al A1.
  assert.equal((await enviar(DUENO, firmada(DUENO, entrada()), cerrado)).estado, 201);
  // La variable se lee al momento (sin reiniciar), y solo «1» abre.
  process.env.PUERTA_GENESIS_A1_ESCRITURA = "si";
  assert.equal((await enviar(DUENO, firmada(DUENO, pet()), cerrado)).estado, 403);
  process.env.PUERTA_GENESIS_A1_ESCRITURA = "1";
  try {
    assert.equal((await enviar(DUENO, firmada(DUENO, pet()), cerrado)).estado, 201);
  } finally {
    delete process.env.PUERTA_GENESIS_A1_ESCRITURA;
  }
  const a = await enviar(DUENO, firmada(DUENO, pet()));
  assert.deepEqual([a.estado, a.j.destino], [201, "a1"]);
});

// La tabla de riesgo de §3.6, escrita aquí a partir del contrato (la misma lista que usan las pruebas
// de Python y de TS).
const TABLA_RIESGO = [
  ["dirección decir a mando sin modelo", { fuente: "direccion", accion: "decir", texto: "x" }, "bajo"],
  ["dirección decir con canales [mando]", { fuente: "direccion", accion: "decir", texto: "x", canales: ["mando"] }, "bajo"],
  ["dirección decir con modelo", { fuente: "direccion", accion: "decir", texto: "x", modelo: "director-presidente/auto" }, "alto"],
  ["dirección decir a otro canal", { fuente: "direccion", accion: "decir", texto: "x", canales: ["hermes"] }, "alto"],
  ["dirección decir a mando y otro", { fuente: "direccion", accion: "decir", texto: "x", canales: ["mando", "ide"] }, "alto"],
  ["dirección responder", { fuente: "direccion", accion: "responder", respondeA: "md-1762990000000-a1b2" }, "alto"],
  ["dirección reenviar", { fuente: "direccion", accion: "reenviar", reenviar: "md-1762990000000-a1b2", canales: ["mando"] }, "alto"],
  ...["estado", "olas", "cola", "puertas", "agentes", "ayuda"].map((o) => [`puente A ${o}`, { fuente: "puente:hermes-avisos", accion: "orden", orden: { nombre: o, args: [] } }, "bajo"]),
  ["puente A texto suelto (Hermes)", { fuente: "puente:hermes-avisos", accion: "texto", texto: "x" }, "alto"],
  ...["decir", "a", "aprobar", "rechazar", "soltar", "reasignar"].map((o) => [`puente A ${o}`, { fuente: "puente:hermes-avisos", accion: "orden", orden: { nombre: o, args: [] } }, "alto"]),
  ...["estado", "ayuda"].map((o) => [`puente B ${o}`, { fuente: "puente:peticiones", accion: "orden", orden: { nombre: o, args: [] } }, "bajo"]),
  ["puente B texto suelto", { fuente: "puente:peticiones", accion: "texto", texto: "x" }, "alto"],
  ...["encargos", "pausa", "sigue", "cancela"].map((o) => [`puente B ${o}`, { fuente: "puente:peticiones", accion: "orden", orden: { nombre: o, args: [] } }, "alto"]),
  ["revocarme", { fuente: "direccion", accion: "revocarme" }, "bajo"],
  ["revocar-aparato", { fuente: "direccion", accion: "revocar-aparato", huella: "a".repeat(64) }, "bajo"],
  ["puente C (sin entradas)", { fuente: "puente:avisos-directores", accion: "texto", texto: "x" }, "alto"],
  ["otra cosa", { fuente: "rara", accion: "x" }, "alto"],
  ["nada", null, "alto"],
];

test("[REV] riesgoDeEntrada da lo de la tabla de §3.6", () => {
  for (const [nombre, e, esperado] of TABLA_RIESGO) assert.equal(riesgoDeEntrada(e), esperado, nombre);
});

test("[REV] una fila v2 «alto» caduca a los 30 min en la puerta (también el texto a Hermes); una «bajo» no", async () => {
  await vaciarMac();
  const alto = await enviar(DUENO, firmada(DUENO, entrada({ fuente: "puente:hermes-avisos", accion: "texto", texto: "haz algo" })));
  const decir = await enviar(DUENO, firmada(DUENO, ordenA("decir", [], { texto: "hola Hermes" })));
  const bajo = await enviar(DUENO, firmada(DUENO, ordenA("estado")));
  const hilo = await enviar(DUENO, firmada(DUENO, entrada({ texto: "al hilo" })));
  const fila = (id) => abierto.db.prepare("SELECT cambia FROM genesis_entradas WHERE id = ?").get(id).cambia;
  assert.deepEqual([fila(alto.j.id), fila(decir.j.id), fila(bajo.j.id), fila(hilo.j.id)].map(Number), [1, 1, 0, 0]);
  ahora.avanzar(31 * 60_000);
  const l = await pedir("/v1/genesis/chats/entrada?destino=mac", { cred: fMac });
  assert.deepEqual(l.j.entradas.map((x) => x.id).sort((a, b) => a - b), [bajo.j.id, hilo.j.id]);
  const a = await pedir(`/v1/genesis/chats/acuses?ids=${alto.j.id},${decir.j.id}`, { cred: sesion(k, { sub: DUENO }) });
  assert.deepEqual(a.j.acuses.map((x) => x.estado), ["caducado", "caducado"]);
});

test("los registros no llevan la carga, la firma ni el texto; sí el motivo de cada rechazo", async () => {
  const s = firmada(DUENO, entrada({ texto: SECRETO }));
  assert.equal((await enviar(DUENO, s)).estado, 201);
  await enviar(DUENO, entrada({ texto: SECRETO })); // v1 → sin-firma
  await enviar(DEV, firmada(DUENO, entrada({ texto: SECRETO }))); // firma-cuenta
  const todo = JSON.stringify(registros);
  for (const prohibido of [SECRETO, s.carga.slice(0, 40), s.firma, s.aparato, DUENO, "eyJ", "pd_"]) assert.ok(!todo.includes(prohibido), prohibido.slice(0, 12));
  const motivos = new Set(registros.map((x) => x.motivo).filter(Boolean));
  for (const m of ["sin-firma", "firma-cuenta"]) assert.ok(motivos.has(m), m);
  const ok = registros.filter((x) => x.ruta === "/v1/genesis/chats/entrada" && x.codigo === 201);
  assert.ok(ok.every((x) => Object.keys(x).sort().join() === "codigo,cuenta8,ms,ruta"));
});

test("validarEntradaFirmada pura: devuelve carga, entrada validada y riesgo; lanza ErrorChats", () => {
  const t = ahora();
  const s = firmada(DUENO, ordenA("estado"));
  const r = validarEntradaFirmada(s, DUENO, t);
  assert.deepEqual([r.entrada.fuente, r.entrada.orden.nombre, r.riesgo, r.carga.cuenta], ["puente:hermes-avisos", "estado", "bajo", DUENO]);
  assert.throws(() => validarEntradaFirmada({ v: 1 }, DUENO, t), (e) => e instanceof ErrorChats && e.codigoError === "sin-firma");
  assert.throws(() => validarEntradaFirmada(s, DEV, t), (e) => e instanceof ErrorChats && e.codigoError === "firma-cuenta");
});
