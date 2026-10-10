// Arriendo de líder del nodo de MetaGenesis, latidos de los nodos y órdenes, en el A1.
//
// Las MISMAS reglas que `public.metagenesis_nodo_latir` (migración 20261011100000 de OPA1011) y
// que `nodo_metagenesis_logica.elegir_lider`, para que un nodo pueda latir aquí o en Supabase y el
// líder salga igual:
//   · lo toma quien llega con el arriendo libre o caducado, o lo renueva su líder;
//   · relevo ordenado: un nodo estable (racha ≥ 600 s) con ≥ 100 puntos más se lo queda;
//   · un nodo con puntos negativos (ha cedido el mando) ni lo toma ni lo renueva;
//   · TTL entre 120 y 3.600 s (900 por defecto).
// Cada nodo entra con SU llave (aquí solo su sha256), la misma que usa con las tablas.
// Las órdenes las crean miembros de MetaGenesis (es_metagenesis), con la lista blanca de acciones
// y argumentos de la tabla, 30 por hora y cuenta; caducan a los 15 min sin tomar.

import { timingSafeEqual } from "node:crypto";
import { enTransaccion, parsear, tamanoJson } from "./almacen.mjs";
import { ErrorValidacion } from "./bus.mjs";
import { huella } from "./fichas.mjs";

export const MEDIOS = Object.freeze(["mac", "oracle-a1", "neurona", "nube-cowork", "gh-actions"]);
export const ACCIONES = Object.freeze([
  "continuar", "revisar_bloqueadas", "buscar_capacidad", "reactivar", "buscar_trabajo",
  "lanzar_cola", "detener_cola", "pausar", "reanudar", "ceder",
]);
export const ESTADOS_RESULTADO = Object.freeze(["hecha", "en_marcha", "seca", "nada", "rechazada", "fallo"]);
const NODO = /^[a-z0-9][a-z0-9-]{1,38}$/;
const ESTABLE_MS = 600_000;
const CADUCA_ORDEN_MS = 15 * 60_000;

function iso(ms) {
  return ms ? new Date(ms).toISOString() : null;
}

export function crearArriendo(db, op = {}) {
  const ahora = op.ahora ?? (() => Date.now());

  function exigirNodo(nodo, llave) {
    if (typeof nodo !== "string" || !NODO.test(nodo) || typeof llave !== "string" || llave.length < 32 || llave.length > 128) {
      throw new ErrorValidacion("nodo o llave no válidos", 403);
    }
    const f = db.prepare("SELECT huella, revocado, medio FROM nodos_mg WHERE nodo = ?").get(nodo);
    const a = Buffer.from(huella(llave), "hex");
    const b = Buffer.from(f?.huella ?? "0".repeat(64), "hex");
    const igual = a.length === b.length && timingSafeEqual(a, b);
    if (!f || f.revocado || !igual) throw new ErrorValidacion("nodo o llave no válidos", 403);
    return f;
  }

  function registrar(nodo, medio, huellaLlave) {
    if (!NODO.test(String(nodo)) || !MEDIOS.includes(medio) || !/^[0-9a-f]{64}$/.test(String(huellaLlave).toLowerCase())) {
      throw new ErrorValidacion("nodo, medio o huella no válidos");
    }
    db.prepare(
      "INSERT INTO nodos_mg (nodo, medio, huella, revocado, creado) VALUES (?, ?, ?, 0, ?) " +
        "ON CONFLICT(nodo) DO UPDATE SET medio = excluded.medio, huella = excluded.huella, revocado = 0",
    ).run(nodo, medio, String(huellaLlave).toLowerCase(), ahora());
    return true;
  }

  function revocar(nodo) {
    const r = db.prepare("UPDATE nodos_mg SET revocado = 1 WHERE nodo = ?").run(nodo);
    db.prepare("UPDATE arriendo_mg SET expira = ?, actualizado = ? WHERE id = 1 AND lider = ?").run(ahora(), ahora(), nodo);
    return r.changes > 0;
  }

  function leerArriendo() {
    const a = db.prepare("SELECT lider, termino, puntos, expira, foto, foto_en, actualizado FROM arriendo_mg WHERE id = 1").get();
    return {
      lider: a?.lider ?? null,
      termino: Number(a?.termino ?? 0),
      puntos: Number(a?.puntos ?? 0),
      expira: iso(Number(a?.expira ?? 0)),
      vigente: Boolean(a?.lider) && Number(a?.expira ?? 0) > ahora(),
      foto: parsear(a?.foto),
      foto_en: iso(Number(a?.foto_en ?? 0)),
    };
  }

  function nodosVivos(ttlMs) {
    return db.prepare("SELECT nodo, medio, modo, puntos, datos, ultimo_latido FROM nodos_mg WHERE revocado = 0 AND ultimo_latido > ? ORDER BY nodo")
      .all(ahora() - ttlMs)
      .map((n) => ({ nodo: n.nodo, medio: n.medio, modo: n.modo, puntos: n.puntos, datos: parsear(n.datos), ts: Number(n.ultimo_latido) / 1000 }));
  }

  /** Late, toma o renueva el arriendo (atómico) y recoge sus órdenes. */
  function latir({ nodo, llave, medio, datos = null, puntos = 0, ttl_s = 900 }) {
    exigirNodo(nodo, llave);
    const ttl = Math.max(120, Math.min(Number(ttl_s) || 900, 3600)) * 1000;
    const p = Number.isFinite(Number(puntos)) ? Math.trunc(Number(puntos)) : 0;
    let d = datos;
    if (d !== null && tamanoJson(d) > 16_384) d = { nodo, recortado: true };
    return enTransaccion(db, () => {
      const t = ahora();
      const previo = db.prepare("SELECT ultimo_latido, desde, modo FROM nodos_mg WHERE nodo = ?").get(nodo);
      const racha = !previo?.ultimo_latido || Number(previo.ultimo_latido) < t - ttl ? t : Number(previo.desde ?? t);
      const modo = d && (d.modo === "real" || d.modo === "seco") ? d.modo : previo?.modo ?? null;
      db.prepare("UPDATE nodos_mg SET datos = ?, modo = ?, puntos = ?, desde = ?, ultimo_latido = ? WHERE nodo = ?")
        .run(d === null ? null : JSON.stringify(d), modo, p, racha, t, nodo);
      const estable = racha <= t - ESTABLE_MS;
      if (p >= 0) {
        const a = db.prepare("SELECT lider, termino, puntos, expira FROM arriendo_mg WHERE id = 1").get();
        const puede = a.lider === nodo || a.lider == null || Number(a.expira) < t || (estable && p >= Number(a.puntos) + 100);
        if (puede) {
          db.prepare("UPDATE arriendo_mg SET termino = termino + ?, lider = ?, puntos = ?, expira = ?, actualizado = ? WHERE id = 1")
            .run(a.lider === nodo ? 0 : 1, nodo, p, t + ttl, t);
        }
      }
      const arr = leerArriendo();
      db.prepare("UPDATE ordenes_mg SET estado = 'caducada', actualizada = ? WHERE estado = 'pendiente' AND creada < ?").run(t, t - CADUCA_ORDEN_MS);
      const medioNodo = db.prepare("SELECT medio FROM nodos_mg WHERE nodo = ?").get(nodo)?.medio ?? medio;
      const elegidas = db.prepare(
        "SELECT id, accion, args, para, por, creada FROM ordenes_mg WHERE estado = 'pendiente' AND (para = ? OR para = ? OR (para = 'lider' AND ? = ?)) ORDER BY id LIMIT 10",
      ).all(nodo, medioNodo, arr.lider ?? "", nodo);
      const marcar = db.prepare("UPDATE ordenes_mg SET estado = 'tomada', tomada_por = ?, actualizada = ? WHERE id = ? AND estado = 'pendiente'");
      const ordenes = elegidas.map((o) => {
        marcar.run(nodo, t, o.id);
        return { id: Number(o.id), accion: o.accion, args: parsear(o.args, {}), para: o.para, por: String(o.por).slice(0, 8), t: iso(Number(o.creada)) };
      });
      return {
        arriendo: { lider: arr.lider, termino: arr.termino, puntos: arr.puntos, expira: arr.expira },
        nodos: nodosVivos(ttl),
        ordenes,
      };
    });
  }

  function ceder({ nodo, llave }) {
    exigirNodo(nodo, llave);
    const r = db.prepare("UPDATE arriendo_mg SET expira = ?, actualizado = ? WHERE id = 1 AND lider = ?").run(ahora(), ahora(), nodo);
    return r.changes > 0;
  }

  function baja({ nodo, llave }) {
    exigirNodo(nodo, llave);
    const t = ahora();
    enTransaccion(db, () => {
      db.prepare("UPDATE nodos_mg SET ultimo_latido = ? WHERE nodo = ?").run(t - 86_400_000, nodo);
      db.prepare("UPDATE arriendo_mg SET expira = ?, actualizado = ? WHERE id = 1 AND lider = ?").run(t, t, nodo);
    });
    return true;
  }

  function foto({ nodo, llave, foto: f }) {
    exigirNodo(nodo, llave);
    if (f == null || typeof f !== "object" || tamanoJson(f) > 65_536) throw new ErrorValidacion("foto vacía o demasiado grande");
    const t = ahora();
    const r = db.prepare("UPDATE arriendo_mg SET foto = ?, foto_en = ?, actualizado = ? WHERE id = 1 AND lider = ? AND expira > ?")
      .run(JSON.stringify(f), t, t, nodo, t);
    return r.changes > 0;
  }

  function validarArgs(accion, args) {
    const a = args && typeof args === "object" && !Array.isArray(args) ? args : {};
    for (const [k, v] of Object.entries(a)) {
      if (!["cola", "trabajadores", "tareas_sha"].includes(k) || !["string", "number", "boolean"].includes(typeof v)) {
        throw new ErrorValidacion(`argumento no admitido: ${k}`);
      }
    }
    if (tamanoJson(a) > 2048) throw new ErrorValidacion("argumentos demasiado grandes");
    if ((accion === "lanzar_cola" || accion === "detener_cola") && !/^cola-[A-Za-z0-9._-]{1,80}$/.test(String(a.cola ?? ""))) {
      throw new ErrorValidacion("nombre de cola no válido");
    }
    return a;
  }

  /** Orden de una persona (ya comprobado que es miembro de MetaGenesis). */
  function crearOrden(cuenta, { accion, args = {}, para = "lider" }) {
    if (!ACCIONES.includes(accion)) throw new ErrorValidacion("acción no admitida");
    const destino = String(para ?? "lider");
    if (!(destino === "lider" || MEDIOS.includes(destino) || NODO.test(destino))) throw new ErrorValidacion("destino no válido");
    const a = validarArgs(accion, args);
    const t = ahora();
    const hora = db.prepare("SELECT count(*) AS n FROM ordenes_mg WHERE por = ? AND creada > ?").get(cuenta, t - 3_600_000);
    if (Number(hora?.n ?? 0) >= 30) throw new ErrorValidacion("demasiadas órdenes en una hora", 429);
    const r = db.prepare(
      "INSERT INTO ordenes_mg (creada, por, accion, args, para, estado, actualizada) VALUES (?, ?, ?, ?, ?, 'pendiente', ?)",
    ).run(t, cuenta, accion, JSON.stringify(a), destino, t);
    return Number(r.lastInsertRowid);
  }

  function resultadoOrden({ nodo, llave, id, estado, resultado = "" }) {
    exigirNodo(nodo, llave);
    if (!ESTADOS_RESULTADO.includes(estado)) throw new ErrorValidacion("estado no válido");
    const r = db.prepare("UPDATE ordenes_mg SET estado = ?, resultado = ?, actualizada = ? WHERE id = ? AND tomada_por = ?")
      .run(estado, String(resultado ?? "").slice(0, 400), ahora(), Number(id), nodo);
    return r.changes > 0;
  }

  function ordenesRecientes(limite = 30) {
    return db.prepare("SELECT id, creada, accion, args, para, estado, tomada_por, resultado, actualizada FROM ordenes_mg ORDER BY id DESC LIMIT ?")
      .all(Math.min(100, limite))
      .map((o) => ({
        id: Number(o.id), creada: iso(Number(o.creada)), accion: o.accion, args: parsear(o.args, {}), para: o.para,
        estado: o.estado, tomada_por: o.tomada_por, resultado: o.resultado, actualizada: iso(Number(o.actualizada)),
      }));
  }

  return { registrar, revocar, latir, ceder, baja, foto, leerArriendo, nodosVivos, crearOrden, resultadoOrden, ordenesRecientes };
}
