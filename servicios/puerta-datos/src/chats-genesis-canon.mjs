// GEN1114A · catálogo público de chats canónicos (architecture/astraura-chats-identidad-firma.md
// §2.2, §2.4, §5.1, §5.2 y §8.1).
//
// La Mac lo construye con `catalogo_publico(canon)` y lo sube con la ficha `genesis-chats-mac`; la
// puerta lo guarda (una sola fila) y lo sirve. Como defensa, la puerta NO acepta nada que no diga el
// contrato: campos desconocidos (p. ej. `refs`, `versiones`, `permisos` o `contexto.instrucciones`),
// huellas que no sean de 8 hex, y ningún texto ni número con 7 o más cifras seguidas fuera de
// `huella`, `version` y las fechas (un id de chat de Telegram o de sesión). Así el catálogo servido
// no lleva nunca un identificador nativo de ningún medio.
// Quién lee (§2.4.2): dueño todo; desarrollador sin los puentes A y B y sin `usuario` de los bots;
// la ficha `genesis-chats-a1` (ámbito `genesis-a1`) todo; nadie más. Escribe solo `genesis-mac`.

import { tamanoJson } from "./almacen.mjs";
import { PERMISOS_GENESIS } from "./fichas.mjs";

export const CATALOGO_MAX = 64 * 1024;
export const TIPOS = Object.freeze(["direccion", "canal-director", "puente-telegram", "astraura"]);
export const MEDIOS = Object.freeze(["mac-direccion", "claude", "codex", "hermes", "antigravity", "ide", "terminal", "telegram", "a1-peticiones", "genesis-web", "astraura"]);
export const ESTADOS_NOMBRE = Object.freeze(["igual", "distinto", "sin-comprobar", "no-se-puede"]);
const FUENTES = Object.freeze(["direccion", "puente:hermes-avisos", "puente:peticiones", "puente:avisos-directores"]);
/** Fuentes cuyos medios solo puede leer un dueño (GEN1113 §4.2): los puentes A y B. */
export const FUENTES_SOLO_DUENO = Object.freeze(["puente:hermes-avisos", "puente:peticiones"]);

const RE_ID = /^[a-z0-9][a-z0-9._-]{1,62}$/;
const RE_HUELLA8 = /^[0-9a-f]{8}$/;
const RE_USUARIO = /^@?[A-Za-z0-9_]{3,64}$/;
const RE_RAROS = new RegExp(`[${[[0x00, 0x1f], [0x7f, 0x9f], [0x200e, 0x200f], [0x2028, 0x2029], [0x202a, 0x202e], [0x2066, 0x2069]].map(([a, b]) => `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`).join("")}]`, "u");
const RE_CIFRAS = /\d{7,}/;
/** Claves cuyo valor puede llevar cifras largas: huellas, versiones y fechas. */
const EXENTAS = new Set(["huella", "version", "v", "t", "actualizado", "comprobado"]);

const CAMPOS_CATALOGO = new Set(["v", "chats", "version", "t"]);
const CAMPOS_CHAT = new Set(["v", "id", "nombre", "nombreProvisional", "tipo", "padre", "fuente", "alias", "medios", "config", "contexto", "version", "actualizado"]);
const CAMPOS_MEDIO = new Set(["medio", "nombreEnMedio", "estadoNombre", "comprobado", "huella", "usuario"]);
const CAMPOS_CONTEXTO = new Set(["fijados", "resumen"]); // `instrucciones` NO viaja (§5.1)

export class ErrorCatalogo extends Error {
  constructor(mensaje, codigo = "forma") {
    super(mensaje);
    this.codigoError = codigo;
  }
}
const mal = (m) => new ErrorCatalogo(m);
const objeto = (x) => x && typeof x === "object" && !Array.isArray(x);
const largo = (s) => [...s].length;

function soloCampos(x, permitidos, donde) {
  const sobra = Object.keys(x).find((k) => !permitidos.has(k));
  if (sobra) throw mal(`${donde}: el campo «${sobra}» no está en el contrato`);
}
function fechaIso(v, donde) {
  if (typeof v !== "string" || v.length > 40 || !Number.isFinite(Date.parse(v))) throw mal(`${donde}: fecha ISO no válida`);
}
function nombre(v, donde, min = 1) {
  if (typeof v !== "string" || largo(v) < min || largo(v) > 80) throw mal(`${donde}: de ${min} a 80 caracteres`);
  if (RE_RAROS.test(v)) throw mal(`${donde}: sin caracteres de control ni de dirección`);
}
const entero = (v) => Number.isSafeInteger(v) && v >= 0;

/** Ningún texto (ni número) con ≥ 7 cifras seguidas fuera de huella, version y fechas. */
export function sinIdsNativos(x, clave = "") {
  if (EXENTAS.has(clave)) return true;
  if (typeof x === "string") return !RE_CIFRAS.test(x);
  if (typeof x === "number") return !RE_CIFRAS.test(String(Math.trunc(Math.abs(x))));
  if (Array.isArray(x)) return x.every((v) => sinIdsNativos(v, ""));
  if (objeto(x)) return Object.entries(x).every(([k, v]) => !RE_CIFRAS.test(k) && sinIdsNativos(v, k));
  return true;
}

function validarMedio(m, donde) {
  if (!objeto(m)) throw mal(`${donde}: medio vacío`);
  soloCampos(m, CAMPOS_MEDIO, donde);
  if (!MEDIOS.includes(m.medio)) throw mal(`${donde}: «medio» no válido`);
  if (m.nombreEnMedio != null) nombre(m.nombreEnMedio, `${donde}.nombreEnMedio`, 0);
  if (!ESTADOS_NOMBRE.includes(m.estadoNombre)) throw mal(`${donde}: «estadoNombre» no válido`);
  if (m.comprobado != null) fechaIso(m.comprobado, `${donde}.comprobado`);
  if (m.huella != null && (typeof m.huella !== "string" || !RE_HUELLA8.test(m.huella))) throw mal(`${donde}: «huella» debe ser 8 hex`);
  if (m.usuario !== undefined && (typeof m.usuario !== "string" || !RE_USUARIO.test(m.usuario))) throw mal(`${donde}: «usuario» no válido`);
}

function validarChat(c, i) {
  const donde = `chats[${i}]`;
  if (!objeto(c)) throw mal(`${donde}: vacío`);
  soloCampos(c, CAMPOS_CHAT, donde);
  if (c.v !== 2) throw mal(`${donde}: «v» debe ser 2`);
  if (typeof c.id !== "string" || !RE_ID.test(c.id)) throw mal(`${donde}: «id» no válido`);
  nombre(c.nombre, `${donde}.nombre`);
  if (typeof c.nombreProvisional !== "boolean") throw mal(`${donde}: «nombreProvisional» debe ser sí/no`);
  if (!TIPOS.includes(c.tipo)) throw mal(`${donde}: «tipo» no válido`);
  if (c.padre !== undefined && (typeof c.padre !== "string" || !RE_ID.test(c.padre))) throw mal(`${donde}: «padre» no válido`);
  if (c.fuente !== null && !FUENTES.includes(c.fuente)) throw mal(`${donde}: «fuente» no válida`);
  if (!Array.isArray(c.alias) || c.alias.length > 20) throw mal(`${donde}: «alias», lista de ≤ 20`);
  c.alias.forEach((a, j) => nombre(a, `${donde}.alias[${j}]`));
  if (!Array.isArray(c.medios) || c.medios.length > 16) throw mal(`${donde}: «medios», lista de ≤ 16`);
  c.medios.forEach((m, j) => validarMedio(m, `${donde}.medios[${j}]`));
  if (c.config !== undefined && !objeto(c.config)) throw mal(`${donde}: «config» debe ser un objeto`);
  if (c.contexto !== undefined) {
    if (!objeto(c.contexto)) throw mal(`${donde}: «contexto» debe ser un objeto`);
    soloCampos(c.contexto, CAMPOS_CONTEXTO, `${donde}.contexto`);
  }
  if (!entero(c.version)) throw mal(`${donde}: «version» debe ser un entero`);
  fechaIso(c.actualizado, `${donde}.actualizado`);
}

/**
 * Valida un `CatalogoCanon` (§5.1) para guardarlo. Lanza ErrorCatalogo (`forma` o `ids-nativos`).
 * Exige ids y alias únicos entre chats y que ningún alias de un chat sea el id o el nombre de otro.
 */
export function validarCatalogo(cat) {
  if (!objeto(cat)) throw mal("falta «catalogo»");
  if (tamanoJson(cat) > CATALOGO_MAX) throw new ErrorCatalogo("el catálogo pasa de 64 KB", "grande");
  soloCampos(cat, CAMPOS_CATALOGO, "catalogo");
  if (cat.v !== 2) throw mal("catalogo: «v» debe ser 2");
  if (!entero(cat.version)) throw mal("catalogo: «version» debe ser un entero");
  fechaIso(cat.t, "catalogo.t");
  if (!Array.isArray(cat.chats) || cat.chats.length > 200) throw mal("catalogo: «chats», lista de ≤ 200");
  cat.chats.forEach(validarChat);
  const ids = new Map();
  for (const c of cat.chats) {
    if (ids.has(c.id)) throw mal(`id repetido: «${c.id}»`);
    ids.set(c.id, c);
  }
  const duenoDeAlias = new Map();
  for (const c of cat.chats) {
    for (const a of c.alias) {
      if (duenoDeAlias.has(a) && duenoDeAlias.get(a) !== c.id) throw mal(`el alias «${a}» está en dos chats`);
      duenoDeAlias.set(a, c.id);
      const otro = cat.chats.find((o) => o !== c && (o.id === a || o.nombre === a));
      if (otro) throw mal(`el alias «${a}» de «${c.id}» es el id o el nombre de «${otro.id}»`);
    }
  }
  if (!sinIdsNativos(cat)) {
    throw new ErrorCatalogo("el catálogo lleva 7 o más cifras seguidas fuera de huella, version y fechas: parece un id nativo y no se publica", "ids-nativos");
  }
  return cat;
}

/** ¿Es un chat cuyos medios solo puede leer un dueño? (puentes A y B; un puente sin fuente, también). */
export function soloDueno(c) {
  if (FUENTES_SOLO_DUENO.includes(c.fuente)) return true;
  return c.tipo === "puente-telegram" && c.fuente !== "puente:avisos-directores";
}

/** Filtra por rol (§2.4.2). Pura; nunca cambia el original. */
export function filtrarCatalogo(cat, { dueno }) {
  if (!cat) return null;
  if (dueno) return cat;
  return {
    ...cat,
    chats: cat.chats.filter((c) => !soloDueno(c)).map((c) => ({
      ...c,
      medios: c.medios.map(({ usuario: _u, ...m }) => m),
    })),
  };
}

export function crearCanon({ db, fallo, forma, exigirCuenta, exigirFicha, rolDe, ahora = () => Date.now() }) {
  db.exec("CREATE TABLE IF NOT EXISTS genesis_canon (id INTEGER PRIMARY KEY CHECK (id = 1), catalogo TEXT NOT NULL, version INTEGER NOT NULL, t INTEGER NOT NULL)");

  function guardar(id, cuerpo) {
    exigirFicha(id, PERMISOS_GENESIS["canon.escribir"]);
    let cat;
    try {
      cat = validarCatalogo(cuerpo?.catalogo);
    } catch (e) {
      if (e instanceof ErrorCatalogo) {
        if (e.codigoError === "grande") throw fallo(413, "grande", e.message);
        throw e.codigoError === "forma" ? forma(e.message) : fallo(400, e.codigoError, e.message);
      }
      throw e;
    }
    db.prepare("INSERT INTO genesis_canon (id, catalogo, version, t) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET catalogo = excluded.catalogo, version = excluded.version, t = excluded.t")
      .run(JSON.stringify(cat), cat.version, ahora());
    return { ok: true, version: cat.version };
  }

  function leerGuardado() {
    const f = db.prepare("SELECT catalogo FROM genesis_canon WHERE id = 1").get();
    if (!f) return null;
    try {
      return JSON.parse(f.catalogo);
    } catch {
      return null;
    }
  }

  async function leer(id) {
    if (id.tipo === "ficha") {
      exigirFicha(id, PERMISOS_GENESIS["canon.leer"]);
      return { catalogo: filtrarCatalogo(leerGuardado(), { dueno: true }) };
    }
    exigirCuenta(id);
    const rol = await rolDe(id); // sin respuesta de Supabase: 503, nunca se concede por error
    if (!rol) throw fallo(403, "no-miembro", "solo miembros de MetaGenesis");
    return { catalogo: filtrarCatalogo(leerGuardado(), { dueno: rol === "dueño" }) };
  }

  return {
    RUTAS: {
      "/v1/genesis/chats/canon": { POST: ({ id, cuerpo }) => guardar(id, cuerpo), GET: ({ id }) => leer(id) },
    },
  };
}
