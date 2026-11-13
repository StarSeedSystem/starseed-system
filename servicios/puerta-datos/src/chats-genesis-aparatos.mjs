// GEN1114A · solicitudes de emparejar un aparato (architecture/astraura-chats-identidad-firma.md
// §3.3, §5.2 y §8.1).
//
// La puerta solo LLEVA las solicitudes: el emparejamiento de verdad lo hace Alex en la Mac, que
// recalcula la huella y el código y no se fía de nada de lo que diga aquí la puerta. Por eso lo que
// la puerta contesta a `estado` es informativo («según la puerta del A1»). Reglas:
//   · solicitar: sesión de miembro de MetaGenesis; la cuenta sale de la sesión, nunca del cuerpo;
//     SPKI P-256 válida (≤ 200 B), nombre 1..60 sin caracteres de control ni marcas bidi; caduca a
//     los 15 min; como mucho 3 pendientes por cuenta (429 `solicitud-limite`);
//   · listar pendientes y anotar el resultado: solo la ficha con ámbito `genesis-mac` (ni `admin`);
//   · estado: cada sesión pregunta SOLO por sus propias solicitudes (lo ajeno es «desconocido»);
//   · retención 30 días.

import { createHash, createPublicKey } from "node:crypto";
import { PERMISOS_GENESIS } from "./fichas.mjs";

export const SOLICITUD_MS = 15 * 60_000;
export const PENDIENTES_MAX = 3;
export const RETENCION_MS = 30 * 86_400_000;
export const SPKI_MAX = 200;
export const PLATAFORMAS = Object.freeze(["navegador", "app-nativa"]);
export const ESTADOS_RESULTADO = Object.freeze(["emparejado", "rechazado", "revocado"]);
export const NIVELES = Object.freeze(["texto", "completo"]);
const RE_HUELLA = /^[0-9a-f]{64}$/;
// Controles C0/C1, separadores de línea y marcas de dirección (bidi).
const RE_RAROS = new RegExp(`[${[[0x00, 0x1f], [0x7f, 0x9f], [0x200e, 0x200f], [0x2028, 0x2029], [0x202a, 0x202e], [0x2066, 0x2069]].map(([a, b]) => `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`).join("")}]`, "u");

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS genesis_aparatos_solicitudes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, cuenta TEXT NOT NULL, spki TEXT NOT NULL, nombre TEXT NOT NULL,
  plataforma TEXT NOT NULL, t INTEGER NOT NULL, caduca INTEGER NOT NULL, estado TEXT NOT NULL,
  huella TEXT NOT NULL, resuelto INTEGER, nivel TEXT
);
CREATE INDEX IF NOT EXISTS genesis_aparatos_sol_cuenta ON genesis_aparatos_solicitudes (cuenta, estado, caduca);
CREATE INDEX IF NOT EXISTS genesis_aparatos_sol_huella ON genesis_aparatos_solicitudes (huella, id);
`;

class ErrorForma extends Error {}

/** Decodifica base64url canónico sin relleno, o null. */
function b64url(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) return null;
  const b = Buffer.from(s, "base64url");
  return b.toString("base64url") === s ? b : null;
}

/** Huella del aparato: sha256 de la SPKI DER, en hex (§3.2). */
export const huellaDeSpki = (der) => createHash("sha256").update(der).digest("hex");

/**
 * Valida el cuerpo de una solicitud (§8.1). Pura: devuelve `{spki, der, huella, nombre, plataforma}`
 * o lanza Error con un mensaje para la persona. La huella la calcula la puerta (la Mac la recalcula).
 */
export function validarSolicitud(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) throw new ErrorForma("solicitud vacía");
  const der = b64url(c.spki);
  if (!der) throw new ErrorForma("«spki» debe ser base64url canónico sin relleno");
  if (der.length > SPKI_MAX) throw new ErrorForma(`«spki» pasa de ${SPKI_MAX} bytes`);
  let clave;
  try {
    clave = createPublicKey({ key: der, format: "der", type: "spki" });
  } catch {
    throw new ErrorForma("«spki» no es una clave pública");
  }
  if (clave.asymmetricKeyType !== "ec" || clave.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new ErrorForma("la clave del aparato debe ser ECDSA P-256");
  }
  if (typeof c.nombre !== "string") throw new ErrorForma("falta «nombre»");
  const nombre = c.nombre.trim();
  const n = [...nombre].length;
  if (n < 1 || n > 60) throw new ErrorForma("«nombre» debe tener de 1 a 60 caracteres");
  if (RE_RAROS.test(nombre)) throw new ErrorForma("«nombre» no puede llevar caracteres de control ni de dirección");
  if (!PLATAFORMAS.includes(c.plataforma)) throw new ErrorForma("«plataforma» debe ser navegador o app-nativa");
  return { spki: c.spki, der, huella: huellaDeSpki(der), nombre, plataforma: c.plataforma };
}

export function crearAparatos({ db, fallo, forma, exigirCuenta, exigirMiembro, exigirFicha, ahora = () => Date.now() }) {
  db.exec(ESQUEMA);
  const iso = (ms) => (ms == null ? null : new Date(Number(ms)).toISOString());

  function caducar(t) {
    db.prepare("UPDATE genesis_aparatos_solicitudes SET estado = 'caducada', resuelto = caduca WHERE estado = 'pendiente' AND caduca <= ?").run(t);
  }

  function podar(t = ahora()) {
    db.prepare("DELETE FROM genesis_aparatos_solicitudes WHERE t < ?").run(t - RETENCION_MS);
  }

  async function solicitar(id, cuerpo) {
    exigirCuenta(id);
    await exigirMiembro(id);
    let s;
    try {
      s = validarSolicitud(cuerpo);
    } catch (e) {
      if (e instanceof ErrorForma) throw forma(e.message);
      throw e;
    }
    const t = ahora();
    caducar(t);
    // La misma clave pendiente para la misma cuenta: se devuelve la misma solicitud (reintento tras
    // un fallo de red), sin gastar otro hueco.
    const misma = db.prepare("SELECT id, caduca FROM genesis_aparatos_solicitudes WHERE cuenta = ? AND huella = ? AND estado = 'pendiente' ORDER BY id DESC LIMIT 1").get(id.cuenta, s.huella);
    if (misma) return { estado: 201, cuerpo: { solicitud: Number(misma.id), caduca: iso(misma.caduca), huella: s.huella } };
    const pendientes = Number(db.prepare("SELECT count(*) AS n FROM genesis_aparatos_solicitudes WHERE cuenta = ? AND estado = 'pendiente'").get(id.cuenta).n);
    if (pendientes >= PENDIENTES_MAX) throw fallo(429, "solicitud-limite", "ya hay 3 solicitudes de emparejar pendientes; confírmalas en la Mac o espera 15 min");
    const caduca = t + SOLICITUD_MS;
    const nuevo = Number(db.prepare(
      "INSERT INTO genesis_aparatos_solicitudes (cuenta, spki, nombre, plataforma, t, caduca, estado, huella) VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?)",
    ).run(id.cuenta, s.spki, s.nombre, s.plataforma, t, caduca, s.huella).lastInsertRowid);
    podar(t);
    return { estado: 201, cuerpo: { solicitud: nuevo, caduca: iso(caduca), huella: s.huella } };
  }

  function solicitudes(id) {
    exigirFicha(id, PERMISOS_GENESIS["aparatos.solicitudes"]);
    const t = ahora();
    caducar(t);
    const filas = db.prepare("SELECT id, cuenta, spki, nombre, plataforma, t, caduca FROM genesis_aparatos_solicitudes WHERE estado = 'pendiente' AND caduca > ? ORDER BY id").all(t);
    return {
      solicitudes: filas.map((f) => ({ id: Number(f.id), cuenta: f.cuenta, spki: f.spki, nombre: f.nombre, plataforma: f.plataforma, t: iso(f.t), caduca: iso(f.caduca) })),
    };
  }

  function resultado(id, c) {
    exigirFicha(id, PERMISOS_GENESIS["aparatos.resultado"]);
    if (!c || typeof c !== "object" || Array.isArray(c)) throw forma("resultado vacío");
    if (typeof c.huella !== "string" || !RE_HUELLA.test(c.huella)) throw forma("«huella» debe ser 64 hex en minúsculas");
    if (!ESTADOS_RESULTADO.includes(c.estado)) throw forma("«estado» debe ser emparejado, rechazado o revocado");
    if (c.nivel != null && !NIVELES.includes(c.nivel)) throw forma("«nivel» debe ser texto o completo");
    if (c.solicitud != null && (!Number.isSafeInteger(c.solicitud) || c.solicitud < 1)) throw forma("«solicitud» no válida");
    const t = ahora();
    const nivel = c.estado === "emparejado" ? (c.nivel ?? "texto") : null;
    if (c.solicitud != null) {
      const f = db.prepare("SELECT huella FROM genesis_aparatos_solicitudes WHERE id = ?").get(c.solicitud);
      if (!f) throw fallo(404, "no-existe", "solicitud desconocida");
      if (f.huella !== c.huella) throw forma("la huella no es la de esa solicitud");
      db.prepare("UPDATE genesis_aparatos_solicitudes SET estado = ?, resuelto = ?, nivel = coalesce(?, nivel) WHERE id = ?").run(c.estado, t, nivel, c.solicitud);
      return { ok: true };
    }
    // Sin número: una retirada (o un cambio) de un aparato ya emparejado, por su huella.
    const n = Number(db.prepare("UPDATE genesis_aparatos_solicitudes SET estado = ?, resuelto = ?, nivel = coalesce(?, nivel) WHERE id = (SELECT max(id) FROM genesis_aparatos_solicitudes WHERE huella = ?)")
      .run(c.estado, t, nivel, c.huella).changes);
    return { ok: n > 0 };
  }

  function estado(id, q) {
    exigirCuenta(id);
    const huella = String(q.get("huella") || "");
    if (!RE_HUELLA.test(huella)) throw forma("«huella» debe ser 64 hex en minúsculas");
    caducar(ahora());
    // SOLO la cuenta de la sesión: la solicitud de otra cuenta con esa huella es «desconocido».
    const f = db.prepare("SELECT estado, t, caduca, resuelto, nivel FROM genesis_aparatos_solicitudes WHERE cuenta = ? AND huella = ? ORDER BY id DESC LIMIT 1").get(id.cuenta, huella);
    if (!f) return { estado: "desconocido", t: null };
    const t = f.estado === "pendiente" ? iso(f.t) : iso(f.resuelto ?? f.caduca);
    return { estado: f.estado, t, ...(f.nivel ? { nivel: f.nivel } : {}) };
  }

  return {
    podar,
    RUTAS: {
      "/v1/genesis/aparatos/solicitud": { POST: ({ id, cuerpo }) => solicitar(id, cuerpo) },
      "/v1/genesis/aparatos/solicitudes": { GET: ({ id }) => solicitudes(id) },
      "/v1/genesis/aparatos/resultado": { POST: ({ id, cuerpo }) => resultado(id, cuerpo) },
      "/v1/genesis/aparatos/estado": { GET: ({ id, q }) => estado(id, q) },
    },
  };
}
