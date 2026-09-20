/**
 * elegir-nodo.ts — Decisión PURA del nodo de BitNet (HW-2 · 2026-09-20).
 * ─────────────────────────────────────────────────────────────────────────────
 * HW-1 (`perfil-hardware.ts`, `dondeRazona`) dice DÓNDE debería razonar BitNet
 * según el perfil del dispositivo: "local" | "vecino" | "nube" | "ninguno".
 * Este módulo aplica esa preferencia sobre una lista de candidatos medidos
 * (vivos o no, tokens/segundo, RAM libre y latencia) y devuelve el orden de
 * intento. El relevo automático es marcar el que cayó y volver a elegir.
 *
 * Reglas:
 *   1. Primero los candidatos VIVOS del tipo preferido.
 *   2. Luego el resto de vivos, por tok/s descendente y, a igual medida, por
 *      latencia ascendente (null = sin medir, va después de las medidas).
 *   3. Los muertos NO se devuelven nunca; un id caído se marca con
 *      `marcarCaido` y la lista resultante se vuelve a ordenar.
 *
 * Puro: sin red, sin disco, sin `process.env`.
 */

export type TipoNodo = "local" | "vecino" | "nube";

/** Preferencia de destino: la respuesta de `dondeRazona(perfil).bitnet`. */
export type PreferenciaNodo = TipoNodo | "ninguno";

export interface Candidato {
  /** Id estable del nodo (hostname o node_id de la mesh). */
  id: string;
  tipo: TipoNodo;
  /** Base URL a la que mandar la petición BitNet. */
  url: string;
  /** false si el ping falló o `/api/bitnet/estado` no respondió. */
  vivo: boolean;
  /** Tokens/segundo medidos; null si el nodo no los informa. */
  tokS: number | null;
  /** RAM libre en MB; null si el nodo no la informa. */
  ramLibreMb: number | null;
  /** Latencia del ping en milisegundos; null si no se pudo medir. */
  latenciaMs: number | null;
}

/** Comparación de métricas: null (sin medir) siempre va DESPUÉS. */
function mejor(a: number | null, b: number | null, sentido: "desc" | "asc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return sentido === "desc" ? b - a : a - b;
}

function porCalidad(a: Candidato, b: Candidato): number {
  return mejor(a.tokS, b.tokS, "desc") || mejor(a.latenciaMs, b.latenciaMs, "asc");
}

/**
 * Ordena los candidatos para intentarlos de izquierda a derecha:
 * preferidos vivos primero (entre ellos por calidad), luego el resto de vivos
 * por calidad. Devuelve una lista NUEVA sin los muertos. `ninguno` → vacío.
 */
export function ordenarCandidatos(candidatos: Candidato[], preferencia: PreferenciaNodo): Candidato[] {
  if (preferencia === "ninguno") return [];
  const vivos = candidatos.filter((c) => c.vivo);
  const preferidos = vivos.filter((c) => c.tipo === preferencia).sort(porCalidad);
  const resto = vivos.filter((c) => c.tipo !== preferencia).sort(porCalidad);
  return [...preferidos, ...resto];
}

/** El primer candidato ordenado, o null si no hay ninguno vivo. */
export function elegir(candidatos: Candidato[], preferencia: PreferenciaNodo): Candidato | null {
  return ordenarCandidatos(candidatos, preferencia)[0] ?? null;
}

/**
 * Marca un nodo como caído (relevo automático tras fallo de red / 5xx):
 * devuelve una lista NUEVA con ese candidato `vivo: false`.
 */
export function marcarCaido(candidatos: Candidato[], id: string): Candidato[] {
  return candidatos.map((c) => (c.id === id && c.vivo ? { ...c, vivo: false } : c));
}
