// Chats de Genesis en la puerta (GEN1113A · architecture/astraura-chats-genesis.md §7.1).
//
// Llevan órdenes que pueden poner a trabajar a un agente en la Mac de Alex, así que lo que importa
// aquí son los permisos (§4.1–§4.3.1):
//   · la cuenta y el rol salen SOLO de la sesión verificada y de Supabase; el cuerpo no los declara;
//   · un desarrollador escribe texto al hilo (`mando`); todo lo que pone a un agente a trabajar
//     exige dueño (403 `solo-dueno`); sin respuesta de Supabase para el rol, 503 y nada en cola;
//   · nonce único por cuenta (409), 30 entradas/min y 300/día por cuenta, cuerpo ≤ 16 KB;
//   · las fichas `genesis-mac` y `genesis-a1` solo ven y escriben lo suyo;
//   · una orden que cambia algo y nadie recogió en 30 min se marca `caducada` y no se entrega (§4.5);
//   · nada de esto escribe texto en el registro: el registro lo pone servidor.mjs sin contenido.
// Retención (§5.2): espejo 30 días o 60.000 registros; entradas y acuses 7 días.

import { enTransaccion, escribirKv, leerKv, parsear, tamanoJson } from "./almacen.mjs";

export const FUENTES = Object.freeze(["direccion", "puente:hermes-avisos", "puente:peticiones", "puente:avisos-directores"]);
export const CANALES = Object.freeze(["mando", "director-presidente", "claude-cowork", "claude-mac", "hermes", "telegram", "chatgpt", "antigravity", "ide", "terminal"]);
export const ORDENES = Object.freeze({
  "puente:hermes-avisos": Object.freeze(["estado", "olas", "cola", "puertas", "agentes", "ayuda", "aprobar", "rechazar", "soltar", "reasignar", "decir", "a"]),
  "puente:peticiones": Object.freeze(["estado", "ayuda", "encargos", "pausa", "sigue", "cancela"]),
});
export const CAMBIAN = Object.freeze(["aprobar", "rechazar", "soltar", "reasignar", "pausa", "sigue", "cancela"]);
export const ESTADOS_ACUSE = Object.freeze(["entregado", "hecho", "rechazado", "caducado", "fallo"]);
const FINALES = new Set(["hecho", "rechazado", "caducado", "fallo"]);
export const CADUCIDAD_MS = 30 * 60_000;
export const ESPERA_MAX_S = 25;
const DIA = 86_400_000;
const POR_MIN = 30;
const POR_DIA = 300;

const RE = {
  nonce: /^[A-Za-z0-9_-]{22,32}$/,
  modelo: /^[a-z0-9._/:-]{3,120}$/,
  md: /^md-\d{10,16}-[0-9a-f]{4}$/,
  idOrden: /^[A-Za-z0-9_.-]{2,40}$/,
  numero: /^\d{1,4}$/,
};

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS genesis_espejo (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT, fuente TEXT NOT NULL, rid TEXT NOT NULL, t INTEGER NOT NULL,
  datos TEXT NOT NULL, UNIQUE (fuente, rid)
);
CREATE INDEX IF NOT EXISTS genesis_espejo_fuente ON genesis_espejo (fuente, cursor);
CREATE TABLE IF NOT EXISTS genesis_entradas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, cuenta TEXT NOT NULL, rol TEXT NOT NULL, destino TEXT NOT NULL,
  nonce TEXT NOT NULL, datos TEXT NOT NULL, cambia INTEGER NOT NULL, recibido INTEGER NOT NULL,
  entregada INTEGER, estado TEXT NOT NULL, detalle TEXT, actualizado INTEGER NOT NULL,
  UNIQUE (cuenta, nonce)
);
CREATE INDEX IF NOT EXISTS genesis_entradas_destino ON genesis_entradas (destino, estado, id);
CREATE INDEX IF NOT EXISTS genesis_entradas_cuenta ON genesis_entradas (cuenta, recibido);
`;

/** Error con su estado HTTP y un `codigo` estable que la interfaz traduce (§4.5). */
export class ErrorChats extends Error {
  constructor(estado, codigo, mensaje) {
    super(mensaje);
    this.estado = estado;
    this.codigoError = codigo;
  }
}
const fallo = (estado, codigo, mensaje) => new ErrorChats(estado, codigo, mensaje);
const forma = (mensaje) => fallo(400, "forma", mensaje);

export const destinoDe = (fuente) => (fuente === "puente:peticiones" ? "a1" : "mac");

/** Fuentes del espejo que puede escribir una ficha (§7.1). */
export function fuentesDeFicha(ambitos = []) {
  const s = new Set();
  if (ambitos.includes("genesis-mac")) for (const f of FUENTES) if (f !== "puente:peticiones") s.add(f);
  if (ambitos.includes("genesis-a1")) s.add("puente:peticiones");
  return s;
}

function textoOpcional(v, nombre, max) {
  if (v == null) return undefined;
  if (typeof v !== "string") throw forma(`«${nombre}» debe ser texto`);
  if (v.length > max) throw forma(`«${nombre}» pasa de ${max} caracteres`);
  return v;
}

// GEN1113INT: el texto libre de `decir` y `a` viaja en `texto` (≤ 8000), no en `args` (≤ 120 cada
// uno): `decir` lleva `args: []` y `a` lleva `args: [<agente>]`. Las demás órdenes no llevan `texto`.
const CON_TEXTO = new Set(["decir", "a"]);
const RE_AGENTE = /^[A-Za-z0-9_.-]{1,40}$/;

function validarOrden(fuente, o, texto) {
  if (!o || typeof o !== "object" || Array.isArray(o)) throw forma("falta «orden»");
  const nombre = String(o.nombre ?? "");
  if (!ORDENES[fuente]?.includes(nombre)) throw forma("orden no permitida");
  const args = o.args ?? [];
  if (!Array.isArray(args) || args.length > 10 || args.some((a) => typeof a !== "string" || a.length > 120)) {
    throw forma("«orden.args»: hasta 10 textos de ≤ 120");
  }
  const ids = (xs) => xs.length > 0 && xs.every((a) => RE.idOrden.test(a));
  if (["aprobar", "rechazar", "soltar"].includes(nombre) && !ids(args)) throw forma("ids de la orden no válidos");
  if (nombre === "reasignar" && !(args.length === 2 && RE.idOrden.test(args[0]) && RE.modelo.test(args[1]))) throw forma("uso: reasignar <id> <modelo>");
  if (nombre === "olas" && !(args.length === 0 || (args.length === 1 && RE.numero.test(args[0])))) throw forma("uso: olas [n]");
  const conTexto = typeof texto === "string" && texto.trim() !== "";
  if (CON_TEXTO.has(nombre) && !conTexto) throw forma(nombre === "a" ? "uso: a <agente> <texto>" : "uso: decir <texto>");
  if (!CON_TEXTO.has(nombre) && texto != null) throw forma("esta orden no lleva «texto»");
  if (nombre === "decir" && args.length !== 0) throw forma("uso: decir <texto> (el texto va en «texto»)");
  if (nombre === "a" && !(args.length === 1 && RE_AGENTE.test(args[0]))) throw forma("uso: a <agente> <texto> (el texto va en «texto»)");
  return { nombre, args: [...args] };
}

/**
 * Valida una EntradaChat y devuelve SOLO los campos del contrato (lo demás, `cuenta` y `rol`
 * incluidos, se descarta). Lanza ErrorChats 400.
 */
export function validarEntrada(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) throw forma("entrada vacía");
  if (c.v !== 1) throw forma("«v» debe ser 1");
  if (typeof c.nonce !== "string" || !RE.nonce.test(c.nonce)) throw forma("«nonce» no válido (22–32 de A-Z a-z 0-9 _ -)");
  if (typeof c.t !== "string" || c.t.length < 10 || c.t.length > 40) throw forma("«t» debe ser una fecha ISO");
  if (!["direccion", "puente:hermes-avisos", "puente:peticiones"].includes(c.fuente)) throw forma("«fuente» no admite entradas");
  const e = { v: 1, nonce: c.nonce, t: c.t, fuente: c.fuente, accion: c.accion };
  const texto = textoOpcional(c.texto, "texto", 8000);
  if (texto !== undefined) e.texto = texto;
  const esDireccion = c.fuente === "direccion";
  const acciones = esDireccion ? ["decir", "responder", "reenviar"] : ["texto", "orden"];
  if (!acciones.includes(c.accion)) throw forma(`«accion» no válida para ${c.fuente}`);
  const soloDireccion = ["modelo", "canales", "respondeA", "reenviar"].filter((k) => c[k] != null);
  if (!esDireccion && soloDireccion.length) throw forma(`«${soloDireccion[0]}» solo vale en dirección`);
  if (esDireccion && c.orden != null) throw forma("«orden» solo vale en los puentes");
  if (c.modelo != null) {
    if (typeof c.modelo !== "string" || !RE.modelo.test(c.modelo)) throw forma("«modelo» no válido");
    e.modelo = c.modelo;
  }
  if (c.canales != null) {
    if (!Array.isArray(c.canales) || c.canales.length > CANALES.length || c.canales.some((x) => !CANALES.includes(x))) throw forma("«canales» no válidos");
    e.canales = [...new Set(c.canales)];
  }
  for (const k of ["respondeA", "reenviar"]) {
    if (c[k] == null) continue;
    if (typeof c[k] !== "string" || !RE.md.test(c[k])) throw forma(`«${k}» no válido`);
    e[k] = c[k];
  }
  const conTexto = () => {
    if (!e.texto || !e.texto.trim()) throw forma("falta «texto»");
  };
  if (c.accion === "decir" || c.accion === "texto") conTexto();
  // GEN1113INT: «responder» pide a un modelo que conteste a un mensaje: la ruta local de la Mac
  // no usa texto (lo arma con el original), así que aquí no se exige.
  if (c.accion === "responder" && !e.respondeA) throw forma("falta «respondeA»");
  if (c.accion === "reenviar") {
    if (!e.reenviar) throw forma("falta «reenviar»");
    if (!e.canales?.length) throw forma("«reenviar» necesita al menos un canal");
  }
  if (c.accion === "orden") e.orden = validarOrden(c.fuente, c.orden, e.texto);
  return e;
}

/** ¿Pone a trabajar a un agente o cambia algo? (§4.2, última columna). Entonces solo dueño. */
export function requiereDueno(e) {
  if (e.fuente !== "direccion") return true;
  if (e.accion !== "decir") return true;
  if (e.modelo) return true;
  return (e.canales ?? []).some((x) => x !== "mando");
}

/** ¿Caduca a los 30 min? (§4.5): órdenes que cambian algo y dirección con motor; un texto no. */
export function caduca(e) {
  if (e.orden) return CAMBIAN.includes(e.orden.nombre);
  return e.fuente === "direccion" && requiereDueno(e);
}

function entero(v, defecto, min, max) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defecto;
}

/**
 * @param {object} op db (SQLite de la puerta), esMetagenesis(cuenta, jwt) → bool,
 *   esMetagenesisDueno(cuenta, jwt) → bool | lanza (sin respuesta de Supabase), ahora
 */
export function crearChatsGenesis({ db, esMetagenesis, esMetagenesisDueno, ahora = () => Date.now() }) {
  db.exec(ESQUEMA);
  const esperas = new Set();
  const avisar = () => {
    for (const despertar of [...esperas]) despertar();
  };
  let ultimaPoda = 0;

  function podar(t = ahora()) {
    ultimaPoda = t;
    db.prepare("DELETE FROM genesis_espejo WHERE t < ?").run(t - 30 * DIA);
    const max = db.prepare("SELECT max(cursor) AS m FROM genesis_espejo").get()?.m ?? 0;
    if (max > 60_000) db.prepare("DELETE FROM genesis_espejo WHERE cursor <= ?").run(max - 60_000);
    db.prepare("DELETE FROM genesis_entradas WHERE recibido < ?").run(t - 7 * DIA);
  }
  const quizaPodar = () => {
    if (ahora() - ultimaPoda >= 3_600_000) podar();
  };

  /** Espera hasta `s` segundos a que `hay()` sea cierto (o se corte la petición). */
  async function esperarA(hay, s, senal) {
    const espera = Math.max(0, Math.min(ESPERA_MAX_S, Number(s) || 0));
    if (espera === 0 || hay() || senal?.aborted) return;
    await new Promise((resolver) => {
      let hecho = false;
      const fin = () => {
        if (hecho) return;
        hecho = true;
        clearTimeout(t);
        esperas.delete(despertar);
        senal?.removeEventListener?.("abort", fin);
        resolver();
      };
      const despertar = () => {
        if (hay()) fin();
      };
      const t = setTimeout(fin, espera * 1000);
      esperas.add(despertar);
      senal?.addEventListener?.("abort", fin);
    });
  }

  // ── Identidad y rol (siempre del servidor) ─────────────────────────────────────────────────────
  function exigirCuenta(id) {
    if (id.tipo === "cuenta") return;
    throw fallo(id.tipo === "nadie" ? 401 : 403, "sin-sesion", "hace falta la sesión de una cuenta");
  }

  async function dueno(id) {
    try {
      return (await esMetagenesisDueno(id.cuenta, id.jwt)) === true;
    } catch {
      throw fallo(503, "rol-sin-comprobar", "no se pudo comprobar tu permiso; no se envió nada");
    }
  }

  /** «dueño» | «desarrollador» | null. Si Supabase no responde, 503 (nunca se concede por error). */
  async function rolDe(id) {
    if (await dueno(id)) return "dueño";
    return (await esMetagenesis(id.cuenta, id.jwt)) === true ? "desarrollador" : null;
  }

  /** Solo miembro: primero la caché de 10 min; un «no» se confirma con el rol (así una caída da 503, no 403). */
  async function exigirMiembro(id) {
    if ((await esMetagenesis(id.cuenta, id.jwt)) === true) return;
    if (await dueno(id)) return;
    throw fallo(403, "no-miembro", "solo miembros de MetaGenesis");
  }

  async function exigirDueno(id) {
    const rol = await rolDe(id);
    if (rol === "dueño") return;
    throw rol ? fallo(403, "solo-dueno", "esto solo lo puede hacer un dueño de MetaGenesis") : fallo(403, "no-miembro", "solo miembros de MetaGenesis");
  }

  function exigirFicha(id, ambito) {
    if (id.tipo === "ficha" && id.ambitos.includes(ambito)) return;
    throw fallo(id.tipo === "nadie" ? 401 : 403, "sin-ficha", `hace falta una ficha con el ámbito «${ambito}»`);
  }

  // ── Espejo ─────────────────────────────────────────────────────────────────────────────────────
  const latidoClave = (de) => `genesis.chats.latido.${de}`;
  function latido(de) {
    const k = leerKv(db, latidoClave(de));
    return k ? { t: new Date(Number(k.valor?.t ?? k.actualizado)).toISOString(), de } : null;
  }
  const maxCursor = (fuente) => Number(db.prepare("SELECT max(cursor) AS m FROM genesis_espejo WHERE fuente = ?").get(fuente)?.m ?? 0);

  function escribirEspejo(id, cuerpo) {
    if (id.tipo !== "ficha") throw fallo(id.tipo === "nadie" ? 401 : 403, "sin-ficha", "el espejo solo lo escribe una ficha de Genesis");
    const fuente = cuerpo.fuente;
    if (!FUENTES.includes(fuente)) throw forma("«fuente» no válida");
    if (!fuentesDeFicha(id.ambitos).has(fuente)) throw fallo(403, "sin-ficha", `esta ficha no escribe «${fuente}»`);
    const registros = cuerpo.registros ?? [];
    if (!Array.isArray(registros) || registros.length > 200) throw forma("«registros»: lista de ≤ 200");
    const limpios = registros.map((r) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) throw forma("registro vacío");
      if (typeof r.id !== "string" || r.id.length < 1 || r.id.length > 120) throw forma("registro sin «id»");
      const { fuente: _f, cursor: _c, ...resto } = r;
      if (tamanoJson(resto) > 48 * 1024) throw forma("registro de más de 48 KB");
      return resto;
    });
    const t = ahora();
    const borrar = db.prepare("DELETE FROM genesis_espejo WHERE fuente = ? AND rid = ?");
    const insertar = db.prepare("INSERT INTO genesis_espejo (fuente, rid, t, datos) VALUES (?, ?, ?, ?)");
    enTransaccion(db, () => {
      // Un registro que vuelve (p. ej. con sus entregas al día) se mueve al final: así quien lee
      // por cursor ve el cambio. El cliente reemplaza por `id`.
      for (const r of limpios) {
        borrar.run(fuente, r.id);
        insertar.run(fuente, r.id, t, JSON.stringify(r));
      }
      escribirKv(db, latidoClave(destinoDe(fuente)), { t }, t);
    });
    quizaPodar();
    if (limpios.length) avisar();
    return { ok: true, n: limpios.length, cursor: maxCursor(fuente) };
  }

  function leerEspejo(fuente, desde, limite) {
    const filas = desde > 0
      ? db.prepare("SELECT cursor, datos FROM genesis_espejo WHERE fuente = ? AND cursor > ? ORDER BY cursor ASC LIMIT ?").all(fuente, desde, limite)
      : db.prepare("SELECT * FROM (SELECT cursor, datos FROM genesis_espejo WHERE fuente = ? ORDER BY cursor DESC LIMIT ?) ORDER BY cursor ASC").all(fuente, limite);
    return filas.map((f) => ({ ...parsear(f.datos, {}), fuente, cursor: Number(f.cursor) }));
  }

  async function feed(id, q, senal) {
    exigirCuenta(id);
    const fuente = q.get("fuente") || "";
    if (!FUENTES.includes(fuente)) throw forma("«fuente» no válida");
    if (fuente === "direccion" || fuente === "puente:avisos-directores") await exigirMiembro(id);
    else await exigirDueno(id);
    const desde = entero(q.get("desde"), 0, 0, Number.MAX_SAFE_INTEGER);
    const limite = entero(q.get("limite"), 200, 1, 500);
    await esperarA(() => maxCursor(fuente) > desde, q.get("esperar"), senal);
    const registros = leerEspejo(fuente, desde, limite);
    const cursor = registros.length ? registros[registros.length - 1].cursor : desde;
    return { registros, cursor, latido: latido(destinoDe(fuente)) };
  }

  // ── Entradas y acuses ──────────────────────────────────────────────────────────────────────────
  async function crearEntrada(id, cuerpo) {
    exigirCuenta(id);
    if (tamanoJson(cuerpo) > 16 * 1024) throw fallo(413, "grande", "entrada de más de 16 KB");
    const rol = await rolDe(id);
    if (!rol) throw fallo(403, "no-miembro", "solo miembros de MetaGenesis");
    const e = validarEntrada(cuerpo);
    if (requiereDueno(e) && rol !== "dueño") throw fallo(403, "solo-dueno", "esta orden solo la puede dar un dueño de MetaGenesis");
    const t = ahora();
    const cuenta = (desde) => Number(db.prepare("SELECT count(*) AS n FROM genesis_entradas WHERE cuenta = ? AND recibido > ?").get(id.cuenta, desde)?.n ?? 0);
    if (cuenta(t - 60_000) >= POR_MIN || cuenta(t - DIA) >= POR_DIA) throw fallo(429, "limite", "demasiadas entradas: 30 por minuto y 300 al día");
    const destino = destinoDe(e.fuente);
    let nuevo;
    try {
      nuevo = Number(db.prepare(
        "INSERT INTO genesis_entradas (cuenta, rol, destino, nonce, datos, cambia, recibido, estado, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?, 'en-cola', ?)",
      ).run(id.cuenta, rol, destino, e.nonce, JSON.stringify(e), caduca(e) ? 1 : 0, t, t).lastInsertRowid);
    } catch (err) {
      if (/UNIQUE/i.test(String(err?.message))) throw fallo(409, "nonce-repetido", "esta entrada ya se recibió (nonce repetido)");
      throw err;
    }
    quizaPodar();
    avisar();
    return { estado: 201, cuerpo: { id: nuevo, destino, estado: "en-cola" } };
  }

  function caducarPendientes(destino, t) {
    db.prepare(
      "UPDATE genesis_entradas SET estado = 'caducado', detalle = 'caducó sin ejecutarse: nadie la recogió en 30 min', actualizado = ? WHERE destino = ? AND cambia = 1 AND estado = 'en-cola' AND entregada IS NULL AND recibido < ?",
    ).run(t, destino, t - CADUCIDAD_MS);
  }

  function aRecibida(f) {
    return { ...parsear(f.datos, {}), id: Number(f.id), cuenta: f.cuenta, rol: f.rol, destino: f.destino, recibido: new Date(Number(f.recibido)).toISOString() };
  }

  async function leerEntradas(id, q, senal) {
    const destino = q.get("destino");
    if (destino !== "mac" && destino !== "a1") throw forma("«destino» debe ser mac o a1");
    exigirFicha(id, `genesis-${destino}`);
    const desde = entero(q.get("desde"), 0, 0, Number.MAX_SAFE_INTEGER);
    const pendientes = () => {
      caducarPendientes(destino, ahora());
      return db.prepare("SELECT * FROM genesis_entradas WHERE destino = ? AND id > ? AND estado IN ('en-cola', 'entregado') ORDER BY id ASC LIMIT 100").all(destino, desde);
    };
    await esperarA(() => pendientes().length > 0, q.get("esperar"), senal);
    const filas = pendientes();
    const t = ahora();
    const marcar = db.prepare("UPDATE genesis_entradas SET entregada = ? WHERE id = ? AND entregada IS NULL");
    for (const f of filas) marcar.run(t, f.id);
    return { entradas: filas.map(aRecibida) };
  }

  function acusar(id, cuerpo) {
    if (id.tipo !== "ficha") throw fallo(id.tipo === "nadie" ? 401 : 403, "sin-ficha", "los acuses los manda una ficha de Genesis");
    const n = Number(cuerpo.id);
    if (!Number.isSafeInteger(n) || n < 1) throw forma("«id» no válido");
    if (!ESTADOS_ACUSE.includes(cuerpo.estado)) throw forma("«estado» no válido");
    const detalle = textoOpcional(cuerpo.detalle, "detalle", 300);
    const f = db.prepare("SELECT destino, estado FROM genesis_entradas WHERE id = ?").get(n);
    if (!f || !id.ambitos.includes(`genesis-${f.destino}`)) throw fallo(404, "no-existe", "entrada desconocida para esta ficha");
    if (FINALES.has(f.estado) || (f.estado === "entregado" && cuerpo.estado === "entregado")) {
      return { ok: f.estado === cuerpo.estado };
    }
    db.prepare("UPDATE genesis_entradas SET estado = ?, detalle = ?, actualizado = ?, entregada = coalesce(entregada, ?) WHERE id = ?")
      .run(cuerpo.estado, detalle ?? null, ahora(), ahora(), n);
    return { ok: true };
  }

  function acuses(id, q) {
    exigirCuenta(id);
    const ids = [...new Set(String(q.get("ids") || "").split(",").filter(Boolean).map(Number))];
    if (ids.length > 50 || ids.some((x) => !Number.isSafeInteger(x) || x < 1)) throw forma("«ids»: hasta 50 números");
    if (!ids.length) return { acuses: [] };
    const filas = db.prepare(`SELECT id, estado, detalle, actualizado FROM genesis_entradas WHERE cuenta = ? AND id IN (${ids.map(() => "?").join(",")}) ORDER BY id`)
      .all(id.cuenta, ...ids);
    return { acuses: filas.map((f) => ({ id: Number(f.id), estado: f.estado, ...(f.detalle ? { detalle: f.detalle } : {}), t: new Date(Number(f.actualizado)).toISOString() })) };
  }

  const RUTAS = {
    "/v1/genesis/chats/espejo": { POST: ({ id, cuerpo }) => escribirEspejo(id, cuerpo) },
    "/v1/genesis/chats/feed": { GET: ({ id, q, senal }) => feed(id, q, senal) },
    "/v1/genesis/chats/entrada": {
      POST: ({ id, cuerpo }) => crearEntrada(id, cuerpo),
      GET: ({ id, q, senal }) => leerEntradas(id, q, senal),
    },
    "/v1/genesis/chats/acuse": { POST: ({ id, cuerpo }) => acusar(id, cuerpo) },
    "/v1/genesis/chats/acuses": { GET: ({ id, q }) => acuses(id, q) },
  };

  /**
   * Atiende una petición ya identificada por servidor.mjs. Nunca lanza un ErrorChats: devuelve
   * `{estado, cuerpo}` con `{error, codigo}` en los fallos.
   */
  async function atender({ metodo, ruta, id, cuerpo = {}, q = new URLSearchParams(), senal = null }) {
    const r = RUTAS[ruta];
    if (!r) return { estado: 404, cuerpo: { error: "ruta desconocida", codigo: "ruta" } };
    const fn = r[metodo];
    if (!fn) return { estado: 405, cuerpo: { error: "método no admitido", codigo: "metodo" } };
    try {
      const salida = await fn({ id, cuerpo: cuerpo ?? {}, q, senal });
      return salida && typeof salida.estado === "number" && salida.cuerpo ? salida : { estado: 200, cuerpo: salida };
    } catch (e) {
      if (e instanceof ErrorChats) return { estado: e.estado, cuerpo: { error: e.message, codigo: e.codigoError } };
      throw e;
    }
  }

  podar();
  return { atender, podar, esperandoAhora: () => esperas.size };
}
