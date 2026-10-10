// Astraura en el A1: descubrimiento de la malla (lo que hoy es `astraura_mesh_nodes`), el destino
// y el túnel publicados y el ESTADO de los cerebros (cuáles hay y cuándo sincronizaron), más los
// latidos de agentes/directores y el freno de consumo. Todo de máquina a máquina.
//
// Lo que NO entra aquí: las secciones de `astraura_state` con memoria (mem0, grafo, vectores):
// son memoria personal y siguen en Supabase (architecture/puerta-datos-a1.md §2).

import { escribirKv, leerKv, parsear, tamanoJson } from "./almacen.mjs";
import { ErrorValidacion } from "./bus.mjs";

export const CLAVES_ASTRAURA = Object.freeze(["destino_fijo", "tunel_publico", "cerebros"]);
export const MALLA_VIVOS_MS = 15 * 60_000;
const NODE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;

export function crearMalla(db, op = {}) {
  const ahora = op.ahora ?? (() => Date.now());

  function registrarNodo(nodo, por = "") {
    if (!nodo || typeof nodo !== "object" || Array.isArray(nodo)) throw new ErrorValidacion("nodo vacío");
    const id = nodo.node_id;
    if (typeof id !== "string" || !NODE_ID.test(id)) throw new ErrorValidacion("node_id no válido");
    if (tamanoJson(nodo) > 16_384) throw new ErrorValidacion("nodo de más de 16 KB");
    const t = ahora();
    const datos = { ...nodo, updated_at: new Date(t).toISOString() };
    db.prepare("INSERT INTO malla (node_id, datos, actualizado, por) VALUES (?, ?, ?, ?) ON CONFLICT(node_id) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado, por = excluded.por")
      .run(id, JSON.stringify(datos), t, String(por).slice(0, 60));
    return datos;
  }

  function nodosVivos(vivosMs = MALLA_VIVOS_MS) {
    const ms = Math.max(60_000, Math.min(7 * 86_400_000, Number(vivosMs) || MALLA_VIVOS_MS));
    return db.prepare("SELECT datos FROM malla WHERE actualizado > ? ORDER BY actualizado DESC LIMIT 500")
      .all(ahora() - ms)
      .map((f) => parsear(f.datos))
      .filter(Boolean);
  }

  function ponerEstado(clave, datos, por = "") {
    if (!CLAVES_ASTRAURA.includes(clave)) throw new ErrorValidacion("clave de Astraura no admitida", 404);
    if (datos === undefined || tamanoJson(datos) > 65_536) throw new ErrorValidacion("estado vacío o de más de 64 KB");
    const t = ahora();
    db.prepare("INSERT INTO astraura_estado (clave, datos, actualizado, por) VALUES (?, ?, ?, ?) ON CONFLICT(clave) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado, por = excluded.por")
      .run(clave, JSON.stringify(datos), t, String(por).slice(0, 60));
    return { clave, actualizado: new Date(t).toISOString() };
  }

  function leerEstado(clave) {
    if (!CLAVES_ASTRAURA.includes(clave)) throw new ErrorValidacion("clave de Astraura no admitida", 404);
    const f = db.prepare("SELECT datos, actualizado FROM astraura_estado WHERE clave = ?").get(clave);
    return f ? { clave, data: parsear(f.datos), updated_at: new Date(Number(f.actualizado)).toISOString() } : null;
  }

  function latir(clase, id, datos, por = "") {
    if (!["agente", "director", "nodo", "servicio"].includes(clase)) throw new ErrorValidacion("clase de latido no válida");
    if (typeof id !== "string" || !/^[A-Za-z0-9_.:@-]{1,80}$/.test(id)) throw new ErrorValidacion("id de latido no válido");
    if (datos != null && tamanoJson(datos) > 8192) throw new ErrorValidacion("latido de más de 8 KB");
    const t = ahora();
    db.prepare("INSERT INTO latidos (clase, id, t, datos, por) VALUES (?, ?, ?, ?, ?) ON CONFLICT(clase, id) DO UPDATE SET t = excluded.t, datos = excluded.datos, por = excluded.por")
      .run(clase, id, t, datos == null ? null : JSON.stringify(datos), String(por).slice(0, 60));
    return { t: new Date(t).toISOString() };
  }

  function latidos(clase = null, vivosMs = 3_600_000) {
    const args = [ahora() - Math.max(60_000, Math.min(7 * 86_400_000, Number(vivosMs) || 3_600_000))];
    let sql = "SELECT clase, id, t, datos FROM latidos WHERE t > ?";
    if (clase) {
      sql += " AND clase = ?";
      args.push(clase);
    }
    return db.prepare(`${sql} ORDER BY t DESC LIMIT 500`).all(...args)
      .map((l) => ({ clase: l.clase, id: l.id, t: new Date(Number(l.t)).toISOString(), datos: parsear(l.datos) }));
  }

  function ponerFreno(f) {
    if (!f || typeof f !== "object" || typeof f.activo !== "boolean") throw new ErrorValidacion("freno no válido");
    const valor = {
      activo: f.activo,
      motivo: typeof f.motivo === "string" ? f.motivo.slice(0, 280) : null,
      hasta: typeof f.hasta === "string" ? f.hasta.slice(0, 40) : null,
      actualizado: new Date(ahora()).toISOString(),
    };
    escribirKv(db, "freno", valor, ahora());
    return valor;
  }

  function leerFreno() {
    return leerKv(db, "freno")?.valor ?? null;
  }

  return { registrarNodo, nodosVivos, ponerEstado, leerEstado, latir, latidos, ponerFreno, leerFreno };
}
