// GEN1114A · catálogo público de chats en la puerta (architecture/astraura-chats-identidad-firma.md
// §2.4, §5.1 y §8.1). La puerta solo sirve lo que el contrato permite: nada de ids nativos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { abrirAlmacen } from "../src/almacen.mjs";
import { crearChatsGenesis } from "../src/chats-genesis.mjs";
import { filtrarCatalogo, validarCatalogo, sinIdsNativos } from "../src/chats-genesis-canon.mjs";
import { reloj } from "./ayudas.mjs";

const DUENO = "00000000-0000-4000-8000-00000000a1e7";
const DEV = "00000000-0000-4000-8000-0000000000ee";
const NADIE = "00000000-0000-4000-8000-0000000000bb";
const T = "2026-11-13T00:00:00Z";

function montar({ caido = false } = {}) {
  const db = abrirAlmacen(":memory:");
  const miembros = new Set([DUENO, DEV]);
  const cg = crearChatsGenesis({
    db, ahora: reloj(),
    esMetagenesis: async (c) => miembros.has(c),
    esMetagenesisDueno: async (c) => {
      if (caido) throw new Error("caído");
      return c === DUENO;
    },
  });
  const pedir = (metodo, id, cuerpo) => cg.atender({ metodo, ruta: "/v1/genesis/chats/canon", id, cuerpo });
  return { db, pedir };
}
const cuenta = (c) => ({ tipo: "cuenta", cuenta: c, jwt: "x" });
const MAC = { tipo: "ficha", nombre: "genesis-chats-mac", ambitos: ["genesis-mac"] };
const A1 = { tipo: "ficha", nombre: "genesis-chats-a1", ambitos: ["genesis-a1"] };
const ADMIN = { tipo: "ficha", nombre: "admin-mac", ambitos: ["admin"] };

// El catálogo público que sale del canon.json de ejemplo de §8.3 (sin refs ni versiones), con un
// medio por puente como lo publicaría la Mac (huella de 8 hex y @usuario, inventados).
const medio = (m, extra = {}) => ({ medio: m, nombreEnMedio: null, estadoNombre: "sin-comprobar", comprobado: null, huella: null, ...extra });
const chat = (id, nombre, tipo, fuente, alias, extra = {}) => ({
  v: 2, id, nombre, nombreProvisional: false, tipo, fuente, alias, medios: [medio("genesis-web")], version: 1, actualizado: T, ...extra,
});
const CATALOGO = () => ({
  v: 2, version: 7, t: T, chats: [
    chat("genesis", "GENESIS · StarSeed OS", "direccion", "direccion", ["direccion", "mando"]),
    chat("genesis.canal.hermes", "Hermes", "canal-director", null, [], { padre: "genesis" }),
    chat("telegram.ejemplo_a_bot", "Bot A de ejemplo", "puente-telegram", "puente:hermes-avisos", ["puente:hermes-avisos", "hermes-avisos", "Hermes y avisos"], {
      medios: [medio("telegram", { huella: "0a1b2c3d", usuario: "@ejemplo_a_bot", estadoNombre: "igual", comprobado: T, nombreEnMedio: "Bot A de ejemplo" }), medio("hermes")],
    }),
    chat("telegram.ejemplo_b_bot", "Bot B de ejemplo", "puente-telegram", "puente:peticiones", ["puente:peticiones", "peticiones", "Peticiones y encargos"], {
      medios: [medio("telegram", { huella: "12345678", usuario: "@ejemplo_b_bot" }), medio("a1-peticiones")],
    }),
    chat("telegram.ejemplo_c_bot", "Bot C de ejemplo", "puente-telegram", "puente:avisos-directores", ["puente:avisos-directores", "avisos-directores", "Avisos de los directores"], {
      medios: [medio("telegram", { huella: "deadbeef", usuario: "@ejemplo_c_bot" })],
    }),
  ],
});

test("la Mac publica (ficha genesis-mac) y la puerta lo guarda: {ok, version}", async () => {
  const { pedir } = montar();
  const r = await pedir("POST", MAC, { catalogo: CATALOGO() });
  assert.deepEqual([r.estado, r.cuerpo], [200, { ok: true, version: 7 }]);
  const d = await pedir("GET", cuenta(DUENO));
  assert.deepEqual(d.cuerpo.catalogo, CATALOGO(), "el dueño lo recibe entero, sin cambios");
});

test("sin catálogo publicado: {catalogo: null}", async () => {
  const { pedir } = montar();
  assert.deepEqual((await pedir("GET", cuenta(DUENO))).cuerpo, { catalogo: null });
});

test("el desarrollador no recibe los puentes A y B ni el `usuario` de ningún bot", async () => {
  const { pedir } = montar();
  await pedir("POST", MAC, { catalogo: CATALOGO() });
  const r = (await pedir("GET", cuenta(DEV))).cuerpo.catalogo;
  assert.deepEqual(r.chats.map((c) => c.id), ["genesis", "genesis.canal.hermes", "telegram.ejemplo_c_bot"]);
  assert.ok(!JSON.stringify(r).includes("usuario") && !JSON.stringify(r).includes("@ejemplo"));
  assert.equal(r.chats[2].medios[0].huella, "deadbeef", "la huella sí viaja");
  // Un puente sin fuente (mal publicado) también se trata como solo del dueño.
  const raro = CATALOGO();
  raro.chats.push(chat("telegram.otro_bot", "Otro", "puente-telegram", null, []));
  assert.ok(!filtrarCatalogo(raro, { dueno: false }).chats.some((c) => c.id === "telegram.otro_bot"));
  assert.equal(filtrarCatalogo(raro, { dueno: true }), raro);
});

test("la ficha genesis-a1 lee el catálogo entero y no puede escribirlo; admin y otras fichas, nada", async () => {
  const { pedir } = montar();
  await pedir("POST", MAC, { catalogo: CATALOGO() });
  const r = await pedir("GET", A1);
  assert.deepEqual([r.estado, r.cuerpo.catalogo.chats.length], [200, 5]);
  assert.ok(JSON.stringify(r.cuerpo).includes("@ejemplo_b_bot"));
  const w = await pedir("POST", A1, { catalogo: CATALOGO() });
  assert.equal(w.estado, 403);
  for (const id of [ADMIN, MAC]) assert.equal((await pedir("GET", id)).estado, 403);
  assert.equal((await pedir("POST", ADMIN, { catalogo: CATALOGO() })).estado, 403);
  assert.equal((await pedir("POST", cuenta(DUENO), { catalogo: CATALOGO() })).estado, 403, "una sesión (aunque sea dueña) no publica");
  assert.equal((await pedir("GET", { tipo: "nadie" })).estado, 401);
  assert.deepEqual([(await pedir("GET", cuenta(NADIE))).cuerpo.codigo], ["no-miembro"]);
});

test("rol sin comprobar (Supabase caído): 503, nunca el catálogo del dueño por error", async () => {
  const { pedir } = montar({ caido: true });
  await pedir("POST", MAC, { catalogo: CATALOGO() });
  const r = await pedir("GET", cuenta(DUENO));
  assert.deepEqual([r.estado, r.cuerpo.codigo], [503, "rol-sin-comprobar"]);
});

test("un catálogo con 7 o más cifras seguidas (un id nativo) → 400 ids-nativos; huella, version y fechas no cuentan", async () => {
  const { pedir } = montar();
  const conId = (f) => {
    const c = CATALOGO();
    f(c);
    return c;
  };
  for (const malo of [
    conId((c) => { c.chats[2].nombre = "Grupo 1234567"; }),
    conId((c) => { c.chats[2].alias.push("tg:-1001234567890"); }),
    conId((c) => { c.chats[3].medios[0].nombreEnMedio = "chat 9876543"; }),
    conId((c) => { c.chats[0].config = { chatId: 1234567890 }; }),
  ]) {
    const r = await pedir("POST", MAC, { catalogo: malo });
    assert.deepEqual([r.estado, r.cuerpo.codigo], [400, "ids-nativos"], JSON.stringify(malo).slice(0, 80));
  }
  // La huella «12345678» (toda cifras), la versión y las fechas no son ids.
  assert.ok(sinIdsNativos(CATALOGO()));
  const grande = conId((c) => { c.version = 12345678901; c.chats[0].version = 98765432; });
  assert.equal((await pedir("POST", MAC, { catalogo: grande })).estado, 200);
  assert.equal((await pedir("GET", cuenta(DUENO))).cuerpo.catalogo.version, 12345678901);
});

test("solo lo que dice el contrato: refs, versiones, permisos, instrucciones o un medio con el id nativo → 400 forma", async () => {
  const { pedir } = montar();
  const con = (f) => {
    const c = CATALOGO();
    f(c);
    return c;
  };
  for (const malo of [
    con((c) => { c.chats[2].refs = [{ medio: "telegram", clave: "TELEGRAM_CHAT_ID" }]; }),
    con((c) => { c.chats[0].versiones = {}; }),
    con((c) => { c.chats[0].permisos = {}; }),
    con((c) => { c.chats[0].contexto = { instrucciones: "secreto" }; }),
    con((c) => { c.chats[2].medios[0].id = "x"; }),
    con((c) => { c.chats[2].medios[0].chatId = "x"; }),
    con((c) => { c.chats[2].medios[0].huella = "0a1b2c3d4e"; }),
    con((c) => { c.chats[2].medios[0].huella = "ZZZZZZZZ"; }),
    con((c) => { c.chats[2].medios[0].usuario = "no vale espacios"; }),
    con((c) => { c.chats[2].medios[0].medio = "whatsapp"; }),
    con((c) => { c.sal = "x"; }),
    con((c) => { c.v = 1; }),
    con((c) => { c.chats[0].id = "Genesis"; }),
    con((c) => { c.chats[0].nombre = ""; }),
    con((c) => { c.chats[0].nombre = "n".repeat(81); }),
    con((c) => { c.chats[0].nombre = `GENESIS ${String.fromCodePoint(0x202e)}SO`; }),
    con((c) => { c.chats[0].tipo = "grupo"; }),
    con((c) => { c.chats[0].fuente = "puente:otro"; }),
    con((c) => { c.chats[1].id = "genesis"; }),
    con((c) => { c.chats[1].alias = ["mando"]; }),
    con((c) => { c.chats[1].alias = ["Bot A de ejemplo"]; }),
    con((c) => { c.chats[0].alias = Array.from({ length: 21 }, (_, i) => `a${i}`); }),
    null,
    "texto",
  ]) {
    const r = await pedir("POST", MAC, { catalogo: malo });
    assert.deepEqual([r.estado, r.cuerpo.codigo], [400, "forma"], JSON.stringify(malo)?.slice(0, 120));
  }
  const n = await pedir("GET", cuenta(DUENO));
  assert.equal(n.cuerpo.catalogo, null, "nada malo quedó guardado");
});

test("catálogo de más de 64 KB → 413 grande; validarCatalogo es pura y no cambia lo que recibe", async () => {
  const { pedir } = montar();
  const c = CATALOGO();
  for (let i = 0; i < 200 - 5; i++) c.chats.push(chat(`genesis.relleno-${String.fromCharCode(97 + (i % 26))}${i}`.replace(/\d/g, (d) => "abcdefghij"[d]), `Relleno ${"x".repeat(60)}`, "astraura", null, [], { medios: Array.from({ length: 3 }, () => medio("astraura")) }));
  const r = await pedir("POST", MAC, { catalogo: c });
  assert.deepEqual([r.estado, r.cuerpo.codigo], [413, "grande"]);
  const original = CATALOGO();
  const copia = structuredClone(original);
  validarCatalogo(original);
  assert.deepEqual(original, copia);
});
