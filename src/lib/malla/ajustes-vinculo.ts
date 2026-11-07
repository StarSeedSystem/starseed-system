/**
 * ajustes-vinculo — los ajustes de cada neurona vinculada (2026-11-07 · VIN1107A). Módulo PURO.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/sincronizacion-neuronas.md` §8. Dos ajustes por neurona vinculada, guardados
 * SOLO en este aparato (no viajan a la cuenta: dicen cómo habla ESTE aparato con esa neurona):
 *
 *  · `reconectarSola` (por defecto sí): si el vínculo está recordado, al reaparecer esa neurona la
 *    solicitud sale sola y la suya se acepta sin preguntar. Apagado: ni una ni otra; siempre se pregunta.
 *  · `viasPermitidas` (por defecto todas): por qué vías se le habla. `null` = todas. Una vía quitada no se
 *    usa ni para pedir ni para contestar (el motor lo dice en el resultado: nunca un fallo mudo).
 *
 * Los pasos del plan de envío agrupan vías: «transporte» cubre enlace-local, malla-cuenta, vinculo-par y
 * lora (el transporte universal elige entre ellas); se salta solo si NINGUNA de las cuatro está permitida.
 */

import type { PasoEnvio, ViaSync } from "./sincronizacion-neuronas";

export const CLAVE_AJUSTES_VINCULOS = "starseed.malla.vinculos-ajustes.v1";

export const TODAS_LAS_VIAS: readonly ViaSync[] = ["red-local-nativa", "enlace-local", "malla-cuenta", "vinculo-par", "rele", "lora"];

export interface AjustesVinculo {
  reconectarSola: boolean;
  /** null = todas las vías. */
  viasPermitidas: ViaSync[] | null;
}

export const AJUSTES_VINCULO_DEFECTO: AjustesVinculo = { reconectarSola: true, viasPermitidas: null };

export type MapaAjustesVinculos = Record<string, AjustesVinculo>;

const esVia = (x: unknown): x is ViaSync => typeof x === "string" && (TODAS_LAS_VIAS as readonly string[]).includes(x);

/** Normaliza lo guardado: lo ilegible cuenta como «por defecto»; nunca lanza. */
export function leerAjustesVinculo(x: unknown): AjustesVinculo {
  if (!x || typeof x !== "object") return AJUSTES_VINCULO_DEFECTO;
  const o = x as { reconectarSola?: unknown; viasPermitidas?: unknown };
  const vias = Array.isArray(o.viasPermitidas) ? Array.from(new Set(o.viasPermitidas.filter(esVia))) : null;
  // Todas permitidas se guarda como null: así una vía nueva en el futuro no queda excluida por una lista vieja.
  const todas = !!vias && TODAS_LAS_VIAS.every((v) => vias.includes(v));
  return {
    reconectarSola: o.reconectarSola !== false,
    viasPermitidas: vias && !todas ? vias : null,
  };
}

export function leerMapaAjustes(raw: string | null | undefined): MapaAjustesVinculos {
  if (!raw) return {};
  try {
    const o: unknown = JSON.parse(raw);
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const salida: MapaAjustesVinculos = {};
    for (const [neurona, v] of Object.entries(o as Record<string, unknown>)) {
      if (!neurona) continue;
      const a = leerAjustesVinculo(v);
      if (!sonPorDefecto(a)) salida[neurona] = a;
    }
    return salida;
  } catch {
    return {};
  }
}

export function sonPorDefecto(a: AjustesVinculo): boolean {
  return a.reconectarSola && a.viasPermitidas === null;
}

/** Serializa solo lo que se aparta del defecto (un mapa vacío es «{}»). */
export function serializarMapaAjustes(m: MapaAjustesVinculos): string {
  const limpio: MapaAjustesVinculos = {};
  for (const [k, v] of Object.entries(m)) if (k && !sonPorDefecto(v)) limpio[k] = v;
  return JSON.stringify(limpio);
}

/** Aplica un cambio parcial; devuelve el mapa nuevo (sin tocar el anterior). */
export function cambiarAjustes(m: MapaAjustesVinculos, neurona: string, patch: Partial<AjustesVinculo>): MapaAjustesVinculos {
  if (!neurona) return m;
  const previo = m[neurona] ?? AJUSTES_VINCULO_DEFECTO;
  const siguiente = leerAjustesVinculo({ ...previo, ...patch });
  const copia = { ...m };
  if (sonPorDefecto(siguiente)) delete copia[neurona];
  else copia[neurona] = siguiente;
  return copia;
}

export function viaPermitida(a: AjustesVinculo, via: ViaSync): boolean {
  return a.viasPermitidas === null || a.viasPermitidas.includes(via);
}

/** Alterna una vía respetando que quede al menos una permitida (si no, no habría forma de hablarle). */
export function alternarVia(a: AjustesVinculo, via: ViaSync): AjustesVinculo {
  const actuales = a.viasPermitidas ?? [...TODAS_LAS_VIAS];
  const siguiente = actuales.includes(via) ? actuales.filter((v) => v !== via) : [...actuales, via];
  if (!siguiente.length) return a;
  return leerAjustesVinculo({ ...a, viasPermitidas: siguiente });
}

const VIAS_DEL_TRANSPORTE: readonly ViaSync[] = ["enlace-local", "malla-cuenta", "vinculo-par", "lora"];

/** ¿Este paso del plan de envío puede usarse con esa neurona? */
export function pasoPermitido(a: AjustesVinculo, paso: PasoEnvio): boolean {
  switch (paso) {
    case "red-local-nativa":
      return viaPermitida(a, "red-local-nativa");
    case "transporte":
      return VIAS_DEL_TRANSPORTE.some((v) => viaPermitida(a, v));
    case "rele-cuenta":
      return viaPermitida(a, "rele");
  }
}

/** Quita del plan los pasos no permitidos y dice cuáles (para explicarlo si luego nada llega). */
export function filtrarPasos(a: AjustesVinculo, pasos: readonly PasoEnvio[]): { pasos: PasoEnvio[]; quitados: PasoEnvio[] } {
  const ok: PasoEnvio[] = [];
  const quitados: PasoEnvio[] = [];
  for (const p of pasos) (pasoPermitido(a, p) ? ok : quitados).push(p);
  return { pasos: ok, quitados };
}

const NOMBRE_PASO: Record<PasoEnvio, string> = {
  "red-local-nativa": "la red local",
  transporte: "los enlaces directos y la malla",
  "rele-cuenta": "el relé de la cuenta",
};

/** Frase para añadir al «no hay camino» cuando los ajustes de esa neurona taparon alguna vía. */
export function fraseViasQuitadas(quitados: readonly PasoEnvio[]): string {
  if (!quitados.length) return "";
  return ` Ojo: en los ajustes de esa neurona está desactivado ${quitados.map((p) => NOMBRE_PASO[p]).join(" y ")}; actívalo si quieres que se use.`;
}
