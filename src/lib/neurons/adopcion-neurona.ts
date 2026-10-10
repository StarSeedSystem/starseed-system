"use client";

/*
 * adopcion-neurona — «¿Es esta una neurona que ya configuraste?» (2026-09-29, persistencia entre
 * medios).
 *
 * Cada MEDIO (localhost:9002, starseed-os.vercel.app, la PWA instalada, la app Tauri) tiene su
 * propio localStorage y, con él, su propio id de neurona: el mismo ordenador con cuatro medios son
 * cuatro neuronas «nuevas» para la cuenta, y cada una reabre los ajustes de neurona nueva aunque
 * ya lo configuraste todo. Aquí la persona dice «esta es esa» y el medio pasa a usar el id de la
 * neurona que ya existe: su nombre, permisos, ajustes y overrides de sistemas por personalidad
 * (todo colgado de ese id y sincronizado con la cuenta) le llegan sin repetir nada.
 *
 * El cambio de identidad en sí (y por qué SOLO cambia el id de neurona) está en
 * `identidad-dispositivo.ts::adoptarNeurona`. Este módulo añade lo que necesita la interfaz:
 *   · quién puede adoptarse (`candidatasAdopcion`: las demás neuronas de la cuenta);
 *   · la adopción completa (`usarConfiguracionDeNeurona`): cambia el id, deja la neurona como
 *     configurada y —con guardas— borra la fila duplicada que el registro creó al arrancar.
 *
 * Nunca lanza.
 */

import { createClient } from "@/utils/supabase/client";
import { safeGet } from "@/lib/safe-storage";
import { adoptarNeurona, type ResultadoAdopcion } from "@/lib/network/identidad-dispositivo";
import { marcarNeuronaConfigurada } from "@/lib/onboarding/primer-arranque";
import { agruparPorAparato, candidatosParaEsteMedio, esFichaVacia, type NeuronaHuella } from "@/lib/neurons/huella";

/** Evento (en `window`) tras una adopción: `detail = { anterior, adoptada }`. */
export const EVENTO_NEURONA_ADOPTADA = "starseed:neurona-adoptada";

/** Prefs de neuronas (sincronizadas): la misma clave que `neurons.ts` (`NEURON_PREFS_KEY`). */
const NEURON_PREFS_KEY = "starseed.neurons.prefs.v1";

/** Lo mínimo de una neurona de la cuenta para ofrecerla en la lista (sin depender de neurons.ts). */
export interface NeuronaCandidata {
  id: string;
  name: string;
  isThisDevice?: boolean;
  last_seen_at?: string;
  created_at?: string;
  capabilities?: { platform?: string; browser?: string } | null;
  /** (2026-10-09) Cuánto se parece este aparato al de ESTE medio (huella de hardware). */
  parecido?: "mismo" | "probable" | "posible" | "distinto";
  /** Por qué (núcleos, GPU, pantalla…). */
  motivos?: string[];
  /** Otras neuronas (otros medios) del MISMO aparato que esta. */
  otras?: NeuronaCandidata[];
}

/**
 * (2026-10-09 · «una neurona por dispositivo») Las neuronas de la cuenta agrupadas por APARATO y
 * ordenadas por parecido con ESTE medio: primero «mismo aparato», luego «probable», «posible», y
 * al final los aparatos que la huella descarta («distinto»: otro sistema, otra GPU…). Cada
 * entrada es la neurona principal de su aparato, con las demás filas del aparato en `otras`.
 */
export function candidatasPorAparato(propia: NeuronaCandidata | null, todas: readonly NeuronaCandidata[]): NeuronaCandidata[] {
  const otras = candidatasAdopcion(todas);
  // Sin datos del aparato de ESTE medio no hay con qué comparar: se pregunta como siempre.
  if (!propia || !propia.capabilities?.platform) return otras;
  const yo = propia as unknown as NeuronaHuella;
  const nombrados = new Set<string>();
  try {
    const crudo = safeGet(NEURON_PREFS_KEY);
    const p = crudo ? (JSON.parse(crudo) as { names?: Record<string, string> }) : null;
    for (const [k, v] of Object.entries(p?.names ?? {})) if (typeof v === "string" && v.trim()) nombrados.add(k);
  } catch {
    /* sin prefs */
  }
  const cand = candidatosParaEsteMedio(yo, otras as unknown as NeuronaHuella[], nombrados);
  const usadas = new Set<string>();
  const out: NeuronaCandidata[] = cand.map((c) => {
    const n = c.neurona as unknown as NeuronaCandidata;
    const resto = c.otras as unknown as NeuronaCandidata[];
    usadas.add(n.id);
    resto.forEach((r) => usadas.add(r.id));
    return { ...n, parecido: c.parecido, motivos: c.motivos, otras: resto };
  });
  // Lo que la huella descarta sigue disponible al final (la persona puede saber más que la huella).
  const descartadas = otras.filter((n) => !usadas.has(n.id) && !esFichaVacia(n as unknown as NeuronaHuella));
  const grupos = agruparPorAparato(descartadas as unknown as NeuronaHuella[], nombrados);
  const enGrupo = new Set<string>();
  for (const g of grupos) {
    const principal = g.principal as unknown as NeuronaCandidata;
    const resto = g.neuronas.filter((x) => x.id !== g.principal.id) as unknown as NeuronaCandidata[];
    g.neuronas.forEach((x) => enGrupo.add(x.id));
    out.push({ ...principal, parecido: "distinto", otras: resto });
  }
  for (const n of descartadas) if (!enGrupo.has(n.id)) out.push({ ...n, parecido: "distinto", otras: [] });
  return out;
}

/** El aparato que se reconoce sin preguntar (único «mismo»), o null. */
export function aparatoReconocido(lista: readonly NeuronaCandidata[]): NeuronaCandidata | null {
  const mismos = lista.filter((n) => n.parecido === "mismo");
  return mismos.length === 1 ? mismos[0] : null;
}

/** Las neuronas de la cuenta que ESTE medio podría adoptar: todas menos él mismo, la más reciente primero. */
export function candidatasAdopcion(todas: readonly NeuronaCandidata[]): NeuronaCandidata[] {
  const visto = (n: NeuronaCandidata) => (n.last_seen_at ? Date.parse(n.last_seen_at) || 0 : 0);
  return todas
    .filter((n) => n && typeof n.id === "string" && n.id && !n.isThisDevice)
    .slice()
    .sort((a, b) => visto(b) - visto(a));
}

/** ¿La persona le puso nombre, permisos o ajustes a este id de neurona? (prefs sincronizadas) */
function tienePrefsPropias(id: string): boolean {
  try {
    const crudo = safeGet(NEURON_PREFS_KEY);
    const p = crudo
      ? (JSON.parse(crudo) as { names?: Record<string, string>; permissions?: Record<string, unknown>; settings?: Record<string, unknown> })
      : null;
    return Boolean(p?.names?.[id]?.trim() || p?.permissions?.[id] || p?.settings?.[id]);
  } catch {
    return true; // ante la duda, no se borra nada
  }
}

export interface OpcionesAdopcion {
  /** La fila de este medio en `neuron_devices` nació en ESTE arranque (no estaba antes de abrir). */
  propiaCreadaAhora: boolean;
}

export interface ResultadoUsarConfiguracion extends ResultadoAdopcion {
  /** Se borró la fila duplicada (huérfana) que este medio había creado para su id anterior. */
  filaDuplicadaEliminada: boolean;
}

/**
 * «Usar su configuración»: adopta la neurona `id`, la deja marcada como configurada y avisa.
 *
 * Borrado de la fila duplicada — solo si se cumplen TODAS las guardas:
 *  · el id anterior era el propio de este medio y distinto del adoptado;
 *  · esa fila nació en este arranque (`propiaCreadaAhora`);
 *  · la persona no le puso nombre, permisos ni ajustes.
 * Es un registro de presencia (capacidades + latido) que el propio medio regenera; no contiene
 * nada que la persona haya elegido. RLS limita el borrado a las filas de la propia cuenta.
 */
export async function usarConfiguracionDeNeurona(id: string, opts: OpcionesAdopcion): Promise<ResultadoUsarConfiguracion> {
  const r = adoptarNeurona(id);
  if (!r.ok) return { ...r, filaDuplicadaEliminada: false };
  if (r.anterior && r.anterior !== r.adoptada) {
    marcarNeuronaConfigurada(r.adoptada); // «esa neurona ya está configurada» → no se vuelve a preguntar
  }
  let eliminada = false;
  if (r.anterior && r.anterior !== r.adoptada && opts.propiaCreadaAhora && !tienePrefsPropias(r.anterior)) {
    try {
      const { error } = await createClient().from("neuron_devices").delete().eq("id", r.anterior);
      eliminada = !error;
    } catch {
      eliminada = false; // sin red: queda una fila offline; el usuario puede quitarla desde Neuronas
    }
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(EVENTO_NEURONA_ADOPTADA, { detail: { anterior: r.anterior, adoptada: r.adoptada } }));
    }
  } catch {
    /* sin window */
  }
  return { ...r, filaDuplicadaEliminada: eliminada };
}
