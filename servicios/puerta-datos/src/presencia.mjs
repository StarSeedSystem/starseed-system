// Latidos de las neuronas de cada cuenta y presencia «en línea / última vez».
//
// Lo que guarda es lo que la RLS dejaría leer a ESA MISMA cuenta (sus neuronas: `neuron_devices`
// con `owner = auth.uid()`) o lo que `os_presencia` deja ver (visible, o tú): ni contenido, ni
// nombres de aparatos, ni preferencias. El registro de cada neurona (nombre, tipo, capacidades)
// sigue en Supabase; aquí solo «sigue viva, por este medio, con estas señales».
// «En línea» = latido de hace menos de 12 min (architecture/neuronas-un-aparato.md).
// A Supabase va un resumen cada 30 min por neurona y por cuenta (replica.mjs).

import { parsear, tamanoJson } from "./almacen.mjs";
import { ErrorValidacion } from "./bus.mjs";

export const EN_LINEA_MS = 12 * 60_000;
const NEURONA = /^[A-Za-z0-9_.:-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function crearPresencia(db, op = {}) {
  const ahora = op.ahora ?? (() => Date.now());

  function latirNeurona(cuenta, { neurona, medio = null, senales = null }) {
    if (typeof neurona !== "string" || !NEURONA.test(neurona)) throw new ErrorValidacion("neurona no válida");
    if (medio != null && (typeof medio !== "string" || medio.length > 40)) throw new ErrorValidacion("medio no válido");
    if (senales != null && (typeof senales !== "object" || tamanoJson(senales) > 4096)) throw new ErrorValidacion("señales no válidas (≤ 4 KB)");
    const t = ahora();
    db.prepare(
      "INSERT INTO neuronas (cuenta, neurona, medio, visto, senales) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(cuenta, neurona) DO UPDATE SET medio = coalesce(excluded.medio, medio), visto = excluded.visto, senales = coalesce(excluded.senales, senales)",
    ).run(cuenta, neurona, medio, t, senales == null ? null : JSON.stringify(senales));
    return { visto: new Date(t).toISOString() };
  }

  function neuronasDe(cuenta) {
    const t = ahora();
    return db.prepare("SELECT neurona, medio, visto, senales FROM neuronas WHERE cuenta = ? ORDER BY visto DESC LIMIT 100")
      .all(cuenta)
      .map((n) => ({
        neurona: n.neurona,
        medio: n.medio,
        visto: new Date(Number(n.visto)).toISOString(),
        en_linea: Number(n.visto) > t - EN_LINEA_MS,
        senales: parsear(n.senales),
      }));
  }

  function marcarPresencia(cuenta, { visible } = {}) {
    const t = ahora();
    const vis = visible === undefined ? null : visible ? 1 : 0;
    db.prepare(
      "INSERT INTO presencia (cuenta, visto, visible) VALUES (?, ?, coalesce(?, 1)) " +
        "ON CONFLICT(cuenta) DO UPDATE SET visto = excluded.visto, visible = coalesce(?, visible)",
    ).run(cuenta, t, vis, vis);
    return { visto: new Date(t).toISOString() };
  }

  /** La regla de `os_presencia`: se ve si es visible o si eres tú. */
  function presenciaDe(quienPregunta, cuentas) {
    const lista = [...new Set((Array.isArray(cuentas) ? cuentas : []).map((c) => String(c).toLowerCase()))]
      .filter((c) => UUID.test(c))
      .slice(0, 50);
    if (lista.length === 0) return [];
    const t = ahora();
    return db.prepare(`SELECT cuenta, visto, visible FROM presencia WHERE cuenta IN (${lista.map(() => "?").join(",")})`)
      .all(...lista)
      .filter((p) => Number(p.visible) === 1 || p.cuenta === quienPregunta)
      .map((p) => ({ cuenta: p.cuenta, visto: new Date(Number(p.visto)).toISOString(), en_linea: Number(p.visto) > t - EN_LINEA_MS }));
  }

  function resumen() {
    const t = ahora();
    const n = db.prepare("SELECT count(*) AS total, sum(CASE WHEN visto > ? THEN 1 ELSE 0 END) AS vivas, count(DISTINCT cuenta) AS cuentas FROM neuronas")
      .get(t - EN_LINEA_MS);
    const p = db.prepare("SELECT sum(CASE WHEN visto > ? THEN 1 ELSE 0 END) AS en_linea FROM presencia").get(t - EN_LINEA_MS);
    return { neuronas: Number(n?.total ?? 0), neuronas_vivas: Number(n?.vivas ?? 0), cuentas: Number(n?.cuentas ?? 0), en_linea: Number(p?.en_linea ?? 0) };
  }

  return { latirNeurona, neuronasDe, marcarPresencia, presenciaDe, resumen };
}
