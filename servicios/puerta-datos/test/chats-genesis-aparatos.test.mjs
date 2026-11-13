// GEN1114A · solicitudes de emparejar un aparato en la puerta (architecture/astraura-chats-identidad-firma.md
// §3.3, §5.2 y §8.1). Directas sobre el módulo (la identidad ya resuelta, como la deja servidor.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { abrirAlmacen } from "../src/almacen.mjs";
import { crearChatsGenesis } from "../src/chats-genesis.mjs";
import { validarSolicitud, huellaDeSpki, SOLICITUD_MS } from "../src/chats-genesis-aparatos.mjs";
import { reloj } from "./ayudas.mjs";

const DUENO = "00000000-0000-4000-8000-00000000a1e7";
const DEV = "00000000-0000-4000-8000-0000000000ee";
const NADIE = "00000000-0000-4000-8000-0000000000bb";

function montar() {
  const ahora = reloj();
  const db = abrirAlmacen(":memory:");
  const miembros = new Set([DUENO, DEV]);
  const cg = crearChatsGenesis({ db, ahora, esMetagenesis: async (c) => miembros.has(c), esMetagenesisDueno: async (c) => c === DUENO });
  const pedir = async (metodo, ruta, id, cuerpo, q = "") => cg.atender({ metodo, ruta, id, cuerpo, q: new URLSearchParams(q) });
  return { ahora, db, cg, pedir };
}
const cuenta = (c) => ({ tipo: "cuenta", cuenta: c, jwt: "x" });
const MAC = { tipo: "ficha", nombre: "genesis-chats-mac", ambitos: ["genesis-mac"] };
const A1 = { tipo: "ficha", nombre: "genesis-chats-a1", ambitos: ["genesis-a1"] };
const ADMIN = { tipo: "ficha", nombre: "admin-mac", ambitos: ["admin"] };
const NADA = { tipo: "nadie" };

function clave(curva = "P-256") {
  const { publicKey } = curva === "rsa" ? generateKeyPairSync("rsa", { modulusLength: 1024 }) : generateKeyPairSync("ec", { namedCurve: curva });
  const der = publicKey.export({ format: "der", type: "spki" });
  return { spki: der.toString("base64url"), huella: createHash("sha256").update(der).digest("hex") };
}
const solicitud = (k = clave(), extra = {}) => ({ spki: k.spki, nombre: "iPhone de Alex", plataforma: "navegador", ...extra });
const R = "/v1/genesis/aparatos/";

test("solicitar: 201 con número, caducidad de 15 min y la huella que calcula la puerta (sha256 de la SPKI)", async () => {
  const { pedir, ahora } = montar();
  const k = clave();
  const r = await pedir("POST", `${R}solicitud`, cuenta(DUENO), solicitud(k));
  assert.equal(r.estado, 201);
  assert.deepEqual([typeof r.cuerpo.solicitud, r.cuerpo.huella], ["number", k.huella]);
  assert.equal(Date.parse(r.cuerpo.caduca) - ahora(), SOLICITUD_MS);
  assert.equal(huellaDeSpki(Buffer.from(k.spki, "base64url")), k.huella);
  // La cuenta sale de la sesión: una «cuenta» en el cuerpo no cuenta.
  const l = await pedir("GET", `${R}solicitudes`, MAC);
  assert.deepEqual(l.cuerpo.solicitudes.map((s) => [s.id, s.cuenta, s.nombre, s.plataforma]), [[r.cuerpo.solicitud, DUENO, "iPhone de Alex", "navegador"]]);
  const otra = await pedir("POST", `${R}solicitud`, cuenta(DEV), solicitud(clave(), { cuenta: DUENO }));
  assert.equal(otra.estado, 201);
  assert.equal((await pedir("GET", `${R}solicitudes`, MAC)).cuerpo.solicitudes.at(-1).cuenta, DEV);
});

test("solicitar: solo miembros con sesión; ninguna ficha", async () => {
  const { pedir } = montar();
  assert.deepEqual([(await pedir("POST", `${R}solicitud`, cuenta(NADIE), solicitud())).cuerpo.codigo], ["no-miembro"]);
  assert.equal((await pedir("POST", `${R}solicitud`, NADA, solicitud())).estado, 401);
  assert.equal((await pedir("POST", `${R}solicitud`, MAC, solicitud())).estado, 403);
});

test("validarSolicitud: SPKI P-256 válida ≤ 200 B; nombre 1..60 sin controles ni bidi; plataforma cerrada", async () => {
  const { pedir } = montar();
  const malas = [
    solicitud(clave("P-384")),
    solicitud(clave("rsa")),
    solicitud(undefined, { spki: "no es base64url!" }),
    solicitud(undefined, { spki: Buffer.from("hola").toString("base64url") }),
    solicitud(undefined, { spki: Buffer.alloc(201, 1).toString("base64url") }),
    solicitud(undefined, { spki: `${clave().spki}=` }),
    solicitud(undefined, { nombre: "" }),
    solicitud(undefined, { nombre: "   " }),
    solicitud(undefined, { nombre: "n".repeat(61) }),
    solicitud(undefined, { nombre: "iPhone\nde Alex" }),
    solicitud(undefined, { nombre: `iPhone ${String.fromCodePoint(0x202e)}xelA` }),
    solicitud(undefined, { plataforma: "otra" }),
    null,
  ];
  for (const c of malas) {
    const r = await pedir("POST", `${R}solicitud`, cuenta(DUENO), c);
    assert.deepEqual([r.estado, r.cuerpo.codigo], [400, "forma"], JSON.stringify(c)?.slice(0, 120));
  }
  assert.equal(validarSolicitud(solicitud(undefined, { nombre: "😀".repeat(60), plataforma: "app-nativa" })).plataforma, "app-nativa");
});

test("como mucho 3 pendientes por cuenta → 429 solicitud-limite; la misma clave repetida no gasta hueco", async () => {
  const { pedir } = montar();
  const k = clave();
  const a = await pedir("POST", `${R}solicitud`, cuenta(DUENO), solicitud(k));
  const a2 = await pedir("POST", `${R}solicitud`, cuenta(DUENO), solicitud(k));
  assert.equal(a2.cuerpo.solicitud, a.cuerpo.solicitud);
  assert.equal((await pedir("POST", `${R}solicitud`, cuenta(DUENO), solicitud())).estado, 201);
  assert.equal((await pedir("POST", `${R}solicitud`, cuenta(DUENO), solicitud())).estado, 201);
  const cuarta = await pedir("POST", `${R}solicitud`, cuenta(DUENO), solicitud());
  assert.deepEqual([cuarta.estado, cuarta.cuerpo.codigo], [429, "solicitud-limite"]);
  // Otra cuenta no se ve afectada.
  assert.equal((await pedir("POST", `${R}solicitud`, cuenta(DEV), solicitud())).estado, 201);
});

test("una solicitud caducada no se lista, su estado es «caducada» y libera el hueco", async () => {
  const { pedir, ahora } = montar();
  const ks = [clave(), clave(), clave()];
  for (const k of ks) await pedir("POST", `${R}solicitud`, cuenta(DUENO), solicitud(k));
  assert.equal((await pedir("GET", `${R}solicitudes`, MAC)).cuerpo.solicitudes.length, 3);
  ahora.avanzar(SOLICITUD_MS + 1000);
  assert.deepEqual((await pedir("GET", `${R}solicitudes`, MAC)).cuerpo.solicitudes, []);
  const e = await pedir("GET", `${R}estado`, cuenta(DUENO), undefined, `huella=${ks[0].huella}`);
  assert.equal(e.cuerpo.estado, "caducada");
  assert.equal((await pedir("POST", `${R}solicitud`, cuenta(DUENO), solicitud())).estado, 201);
});

test("solicitudes y resultado: solo la ficha con ámbito genesis-mac (ni la del A1, ni admin, ni una sesión)", async () => {
  const { pedir } = montar();
  for (const id of [A1, ADMIN, cuenta(DUENO)]) {
    assert.equal((await pedir("GET", `${R}solicitudes`, id)).estado, 403);
    assert.equal((await pedir("POST", `${R}resultado`, id, { huella: "a".repeat(64), estado: "revocado" })).estado, 403);
  }
  assert.equal((await pedir("GET", `${R}solicitudes`, NADA)).estado, 401);
});

test("resultado: emparejado con nivel; la huella debe ser la de la solicitud; revocado por huella; estado lo refleja", async () => {
  const { pedir } = montar();
  const k = clave();
  const s = (await pedir("POST", `${R}solicitud`, cuenta(DUENO), solicitud(k))).cuerpo.solicitud;
  assert.equal((await pedir("GET", `${R}estado`, cuenta(DUENO), undefined, `huella=${k.huella}`)).cuerpo.estado, "pendiente");
  const mal = await pedir("POST", `${R}resultado`, MAC, { solicitud: s, huella: "b".repeat(64), estado: "emparejado" });
  assert.deepEqual([mal.estado, mal.cuerpo.codigo], [400, "forma"]);
  assert.equal((await pedir("POST", `${R}resultado`, MAC, { solicitud: 99999, huella: k.huella, estado: "emparejado" })).estado, 404);
  for (const c of [{ solicitud: s, huella: k.huella, estado: "hecho" }, { solicitud: s, huella: k.huella, estado: "emparejado", nivel: "todo" }, { huella: "x", estado: "revocado" }]) {
    assert.equal((await pedir("POST", `${R}resultado`, MAC, c)).estado, 400);
  }
  const ok = await pedir("POST", `${R}resultado`, MAC, { solicitud: s, huella: k.huella, estado: "emparejado", nivel: "completo" });
  assert.deepEqual([ok.estado, ok.cuerpo.ok], [200, true]);
  const e = (await pedir("GET", `${R}estado`, cuenta(DUENO), undefined, `huella=${k.huella}`)).cuerpo;
  assert.deepEqual([e.estado, e.nivel, typeof e.t], ["emparejado", "completo", "string"]);
  assert.deepEqual((await pedir("GET", `${R}solicitudes`, MAC)).cuerpo.solicitudes, [], "ya no está pendiente");
  // Sin nivel, la puerta apunta «texto» (el de por defecto).
  const k2 = clave();
  const s2 = (await pedir("POST", `${R}solicitud`, cuenta(DUENO), solicitud(k2))).cuerpo.solicitud;
  await pedir("POST", `${R}resultado`, MAC, { solicitud: s2, huella: k2.huella, estado: "emparejado" });
  assert.equal((await pedir("GET", `${R}estado`, cuenta(DUENO), undefined, `huella=${k2.huella}`)).cuerpo.nivel, "texto");
  // Retirada sin número de solicitud.
  assert.equal((await pedir("POST", `${R}resultado`, MAC, { huella: k.huella, estado: "revocado" })).cuerpo.ok, true);
  assert.equal((await pedir("GET", `${R}estado`, cuenta(DUENO), undefined, `huella=${k.huella}`)).cuerpo.estado, "revocado");
  assert.equal((await pedir("POST", `${R}resultado`, MAC, { huella: "c".repeat(64), estado: "revocado" })).cuerpo.ok, false);
});

test("estado: cada sesión pregunta solo por lo suyo; lo de otra cuenta es «desconocido»", async () => {
  const { pedir } = montar();
  const k = clave();
  await pedir("POST", `${R}solicitud`, cuenta(DUENO), solicitud(k));
  const ajena = await pedir("GET", `${R}estado`, cuenta(DEV), undefined, `huella=${k.huella}`);
  assert.deepEqual(ajena.cuerpo, { estado: "desconocido", t: null });
  assert.equal((await pedir("GET", `${R}estado`, cuenta(DUENO), undefined, "huella=corta")).estado, 400);
  assert.equal((await pedir("GET", `${R}estado`, MAC, undefined, `huella=${k.huella}`)).estado, 403);
  assert.equal((await pedir("GET", `${R}estado`, NADA, undefined, `huella=${k.huella}`)).estado, 401);
});

test("retención: las solicitudes se borran a los 30 días", async () => {
  const { pedir, ahora, cg, db } = montar();
  await pedir("POST", `${R}solicitud`, cuenta(DUENO), solicitud());
  ahora.avanzar(29 * 86_400_000);
  cg.podar();
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM genesis_aparatos_solicitudes").get().n), 1);
  ahora.avanzar(2 * 86_400_000);
  cg.podar();
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM genesis_aparatos_solicitudes").get().n), 0);
});
