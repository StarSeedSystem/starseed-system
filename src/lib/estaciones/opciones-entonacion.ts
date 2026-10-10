"use client";

/**
 * opciones-entonacion — de dónde sale la entonación (o la espiral) de una estación en vivo (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§3.1).
 *
 * Fuentes REALES, todas del propio OS (nada inventado):
 *   · Omnifrecuencias: tu última sesión de la versión integrada (`getLastSession`), la biblioteca
 *     de frecuencias y recetas de sinergia de la app (`frequencyData` + `frequencyToOscillators`,
 *     el mismo código que usa la app) y los presets del widget (`BUILTIN_PRESETS`).
 *   · Audiomorphic: tus presets guardados (`starseed.audiomorphic.presets.v1`) y los parámetros
 *     por defecto del visualizador.
 *   · En las dos: pegar los parámetros en JSON (lo que exporta la app oficial).
 * Los catálogos se importan perezosos: solo bajan al elegir la fuente en vivo.
 */

import {
  entonacionDesdeOmniConfig,
  entonacionDesdeOsciladores,
  sanearEntonacion,
  sanearVisual,
  type ParametrosSesion,
} from "./transmision-parametrica";

export interface OpcionEntonacion {
  id: string;
  nombre: string;
  grupo: string;
  params: ParametrosSesion;
}

export async function opcionesOmnifrecuencias(): Promise<OpcionEntonacion[]> {
  const salida: OpcionEntonacion[] = [];
  try {
    const { getLastSession } = await import("@/components/dashboard/apps/omnifrecuencias/frecuencias/hooks/useOmniLastSession");
    const ultima = getLastSession();
    const e = ultima ? entonacionDesdeOsciladores(ultima.oscillators) : null;
    if (e) salida.push({ id: "ultima", nombre: "Tu última sesión en Omnifrecuencias (versión integrada)", grupo: "Tuyas", params: { tipo: "omnifrecuencias", entonacion: e } });
  } catch {
    /* sin sesión previa */
  }
  try {
    const [{ frequencyData }, { frequencyToOscillators }] = await Promise.all([
      import("@/components/dashboard/apps/omnifrecuencias/frecuencias/data/frequencies"),
      import("@/components/dashboard/apps/omnifrecuencias/frecuencias/data/synergy-recipes"),
    ]);
    for (const item of frequencyData) {
      const e = entonacionDesdeOsciladores(frequencyToOscillators(item));
      if (e) {
        salida.push({
          id: `bib:${item.id}`,
          nombre: `${item.name} · ${item.hz}`,
          grupo: item.category === "synergy" ? "Sinergias" : "Biblioteca de frecuencias",
          params: { tipo: "omnifrecuencias", entonacion: e },
        });
      }
    }
  } catch {
    /* sin biblioteca */
  }
  try {
    const { BUILTIN_PRESETS } = await import("@/components/dashboard/apps/omnifrecuencias/omni-presets");
    for (const p of BUILTIN_PRESETS) {
      const e = entonacionDesdeOmniConfig(p.config);
      if (e) salida.push({ id: `preset:${p.id}`, nombre: p.name, grupo: "Presets del widget", params: { tipo: "omnifrecuencias", entonacion: e } });
    }
  } catch {
    /* sin presets */
  }
  return salida;
}

export async function opcionesAudiomorphic(): Promise<OpcionEntonacion[]> {
  const salida: OpcionEntonacion[] = [];
  try {
    const crudo = window.localStorage.getItem("starseed.audiomorphic.presets.v1");
    const lista = crudo ? (JSON.parse(crudo) as { id?: unknown; name?: unknown; params?: unknown }[]) : [];
    for (const p of Array.isArray(lista) ? lista : []) {
      if (typeof p?.id !== "string" || typeof p.name !== "string" || typeof p.params !== "string") continue;
      const visual = sanearVisual(JSON.parse(p.params));
      if (visual) salida.push({ id: `am:${p.id}`, nombre: p.name, grupo: "Tus presets de Audiomorphic", params: { tipo: "audiomorphic", visual } });
    }
  } catch {
    /* sin presets */
  }
  try {
    const { DEFAULT_PARAMS } = await import("@/lib/audiomorphic/types");
    const visual = sanearVisual(DEFAULT_PARAMS);
    if (visual) salida.push({ id: "am:defecto", nombre: "Espiral por defecto de Audiomorphic", grupo: "Audiomorphic", params: { tipo: "audiomorphic", visual } });
  } catch {
    /* nada */
  }
  return salida;
}

/** Frecuencia suelta (Hz) como entonación de un oscilador. */
export function entonacionDeFrecuencia(hz: number, onda: "sine" | "square" | "triangle" | "sawtooth" = "sine"): ParametrosSesion | null {
  const e = sanearEntonacion({ volumen: 0.7, osciladores: [{ id: "o0", f: hz, onda, vol: 0.6, x: 0, y: 0, z: 0 }] });
  return e ? { tipo: "omnifrecuencias", entonacion: e } : null;
}

/**
 * Parámetros pegados en JSON. Acepta: los de una estación (`{tipo, entonacion|visual}`), una
 * entonación (`{osciladores, volumen}`), la lista de osciladores de la app (`[{frequency,…}]` o
 * `{oscillators:[…]}`) o el JSON de parámetros de Audiomorphic.
 */
export function parametrosPegados(texto: string, fuente: "omnifrecuencias" | "audiomorphic"): ParametrosSesion | null {
  let o: unknown;
  try {
    o = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (fuente === "audiomorphic") {
    const visual = sanearVisual(r.tipo === "audiomorphic" ? r.visual : r);
    return visual && Object.keys(visual).length ? { tipo: "audiomorphic", visual } : null;
  }
  if (r.tipo === "omnifrecuencias") {
    const e = sanearEntonacion(r.entonacion);
    return e ? { tipo: "omnifrecuencias", entonacion: e } : null;
  }
  if (Array.isArray(r.osciladores)) {
    const e = sanearEntonacion(r);
    return e ? { tipo: "omnifrecuencias", entonacion: e } : null;
  }
  const lista = Array.isArray(o) ? o : Array.isArray(r.oscillators) ? r.oscillators : null;
  if (lista) {
    const e = entonacionDesdeOsciladores(lista as never);
    return e ? { tipo: "omnifrecuencias", entonacion: e } : null;
  }
  return null;
}
