/*
 * adopcion-arranque — ¿este medio es un aparato que YA tiene neurona? Se decide ANTES de crear su
 * fila (NEU1108A · 2026-11-08). Contrato: architecture/neurona-bienvenida.md §2.2.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Caso real (08-11): al reinstalar la app de la tableta con el servidor local dentro, el origen pasó a
 * `http://127.0.0.1:…`; ese origen no tenía el id de neurona y nació una fila nueva («📱 Android ·
 * Chrome 156») al lado de la de siempre («Maggaboard»). Aquí se evita: si hay una prueba FUERTE e
 * INEQUÍVOCA de que este medio es una neurona que ya existe, el medio adopta su id en silencio (como
 * «Usar su configuración», sin preguntar) y no nace ninguna fila. Si no está claro, no se hace nada y
 * decide la persona en la ventana «Esta neurona».
 *
 * Pruebas fuertes, en orden:
 *   1. la pista de la migración (el id que esta app usaba en el origen anterior: escritorio con
 *      `migracion-origen.js`, Android con `pista_neurona`), si esa fila no es de otro aparato;
 *   2. la misma huella del aparato (`capabilities.aparato.huella`, la escribe la app nativa) en UNA
 *      sola neurona vigente;
 *   3. el mismo equipo o modelo con el mismo sistema en UNA sola neurona vigente que no esté en línea
 *      ahora (dos aparatos iguales encendidos a la vez no se confunden) y sin huella que lo contradiga.
 * Una fila absorbida (marca `fusionada` o alias) cuenta como la neurona en la que acabó.
 *
 * Puro: sin red, sin DOM, sin almacenamiento. Nunca lanza.
 */

import { compararAparatos, leerAparato, normalizarEquipo, type AparatoRegistro } from "./aparato-registro";
import { familiaSistema } from "./huella";

export interface FilaArranque {
  id: string;
  capabilities?: unknown;
  last_seen_at?: string | null;
}

export interface EntradaAdopcionArranque {
  /** El id que tiene ahora este medio (recién creado si el origen es nuevo). */
  yoId: string;
  /** El bloque del aparato de este medio (`aparato-este-medio.ts`). */
  aparato: AparatoRegistro | null;
  /** Las filas de la cuenta (`neuron_devices`), tal cual. */
  filas: readonly FilaArranque[];
  /** La pista de la migración (id del origen anterior), si hay. */
  idAnterior?: string | null;
  /** Alias de fusión (absorbida → la que se queda). */
  alias?: Readonly<Record<string, { a: string }>>;
  ahora: number;
}

export type MotivoAdopcion =
  | "ya-registrada"
  | "sin-filas"
  | "pista-migracion"
  | "misma-huella"
  | "mismo-equipo"
  | "ambigua"
  | "pista-de-otro-aparato"
  | "sin-pruebas";

export interface DecisionAdopcionArranque {
  /** El id que este medio debe adoptar en silencio, o null (no se toca nada). */
  adoptar: string | null;
  motivo: MotivoAdopcion;
  /** Las neuronas que encajaban (para depurar y para las pruebas). */
  candidatas: string[];
}

/** Ventana de «en línea» de `neurons.ts` (sin importar ese módulo de cliente). */
const EN_LINEA_MS = 12 * 60_000;

function fusionadaEn(caps: unknown): string | null {
  if (!caps || typeof caps !== "object") return null;
  const m = (caps as Record<string, unknown>).fusionada as { en?: unknown } | undefined;
  return m && typeof m === "object" && typeof m.en === "string" && m.en ? m.en : null;
}

/** La neurona vigente de un id: sigue alias y marcas `fusionada` (como mucho 6 saltos, sin ciclos). */
function vigenteDe(id: string, alias: EntradaAdopcionArranque["alias"], porId: ReadonlyMap<string, FilaArranque>): string {
  let actual = id;
  const vistos = new Set<string>([id]);
  for (let i = 0; i < 6; i++) {
    const sig = alias?.[actual]?.a ?? fusionadaEn(porId.get(actual)?.capabilities);
    if (!sig || vistos.has(sig)) break;
    vistos.add(sig);
    actual = sig;
  }
  return actual;
}

function enLinea(f: FilaArranque, ahora: number): boolean {
  const t = Date.parse(String(f.last_seen_at ?? ""));
  return Number.isFinite(t) && ahora - t < EN_LINEA_MS;
}

/** Decide si este medio adopta en silencio una neurona que ya existe. Pura. Nunca lanza. */
export function decidirAdopcionArranque(e: EntradaAdopcionArranque): DecisionAdopcionArranque {
  const nada = (motivo: MotivoAdopcion, candidatas: string[] = []): DecisionAdopcionArranque => ({ adoptar: null, motivo, candidatas });
  try {
    if (!e.yoId) return nada("sin-pruebas");
    const filas = (e.filas ?? []).filter((f): f is FilaArranque => !!f && typeof f.id === "string" && !!f.id);
    if (!filas.length) return nada("sin-filas");
    const porId = new Map(filas.map((f) => [f.id, f]));
    // Este medio ya tiene su fila (vigente): nada que adoptar aquí (la autocuración de la marca ya vive en listNeurons).
    if (porId.has(e.yoId)) return nada("ya-registrada");
    const vigentes = filas.filter((f) => f.id !== e.yoId && !fusionadaEn(f.capabilities) && vigenteDe(f.id, e.alias, porId) === f.id);
    const yo = e.aparato;

    // 1 · La pista de la migración.
    if (e.idAnterior) {
      const destino = vigenteDe(e.idAnterior, e.alias, porId);
      const fila = vigentes.find((f) => f.id === destino);
      if (fila && destino !== e.yoId) {
        if (compararAparatos(yo, leerAparato(fila.capabilities)).parecido === "distinto") return nada("pista-de-otro-aparato", [destino]);
        return { adoptar: destino, motivo: "pista-migracion", candidatas: [destino] };
      }
    }

    // 2 · La misma huella del aparato en UNA sola neurona vigente.
    if (yo?.huella) {
      const iguales = vigentes.filter((f) => leerAparato(f.capabilities)?.huella === yo.huella).map((f) => f.id);
      if (iguales.length === 1) return { adoptar: iguales[0], motivo: "misma-huella", candidatas: iguales };
      if (iguales.length > 1) return nada("ambigua", iguales);
    }

    // 3 · El mismo equipo y sistema en UNA sola neurona vigente que no esté en línea ahora.
    const equipo = normalizarEquipo(yo?.equipo);
    const so = familiaSistema(yo?.so);
    if (yo?.equipo && equipo && so !== "desconocido") {
      const iguales = vigentes.filter((f) => {
        const ap = leerAparato(f.capabilities);
        if (!ap?.equipo || normalizarEquipo(ap.equipo) !== equipo) return false;
        if (ap.so && ap.so !== so) return false;
        if (ap.huella && yo.huella && ap.huella !== yo.huella) return false;
        return true;
      });
      const libres = iguales.filter((f) => !enLinea(f, e.ahora)).map((f) => f.id);
      if (iguales.length === 1 && libres.length === 1) return { adoptar: libres[0], motivo: "mismo-equipo", candidatas: libres };
      if (iguales.length > 0) return nada("ambigua", iguales.map((f) => f.id));
    }
    return nada("sin-pruebas");
  } catch {
    return nada("sin-pruebas");
  }
}
