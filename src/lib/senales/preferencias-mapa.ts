/**
 * preferencias-mapa — cómo prefiere VER el mapa cada dispositivo (vista, altura,
 * etiquetas, familias ocultas, cuenta). Es una comodidad por dispositivo, no un dato de
 * la cuenta: vive en localStorage, se sanea al leer (un valor viejo o a mano
 * nunca rompe el mapa) y todo acceso al almacenamiento va en try/catch (modo
 * privado, almacenamiento bloqueado o SSR ⇒ se usan los valores por defecto).
 */

import type { AntennaKind } from "@/ai/astraura/mesh/signals";
import { FAMILIAS, MODOS_ALTURA, type ModoAltura, type ModoEtiquetas } from "./mapa-3d";
import { FILTROS_CUENTA, type FiltroCuenta } from "./tipos-vivo";

export const CLAVE_PREFERENCIAS_MAPA = "starseed.mapa-senales.v1";

export type VistaMapa = "3d" | "plano";

export interface PreferenciasMapa {
  vista: VistaMapa;
  altura: ModoAltura;
  etiquetas: ModoEtiquetas;
  ocultas: AntennaKind[];
  cuenta: FiltroCuenta;
  ocultarDesconectados: boolean;
  girar: boolean;
  /**
   * Ver el nombre, la foto y el tipo de aparato que OTRAS cuentas decidieron mostrar en el radar público.
   * Apagado, todas las cuentas ajenas se ven anónimas aunque compartan.
   */
  verPublicos: boolean;
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasMapa = {
  vista: "3d",
  altura: "calidad",
  etiquetas: "todas",
  ocultas: [],
  cuenta: "todas",
  ocultarDesconectados: false,
  girar: false,
  verPublicos: true,
};

/** Convierte lo que haya guardado (cualquier cosa) en preferencias válidas. */
export function sanearPreferencias(crudo: unknown): PreferenciasMapa {
  const base = PREFERENCIAS_POR_DEFECTO;
  if (typeof crudo !== "object" || crudo === null) return { ...base, ocultas: [] };
  const o = crudo as Record<string, unknown>;
  const alturas = MODOS_ALTURA.map((m) => m.id);
  const ocultas = Array.isArray(o.ocultas)
    ? Array.from(new Set(o.ocultas.filter((x): x is AntennaKind => FAMILIAS.includes(x as AntennaKind))))
    : [];
  return {
    vista: o.vista === "plano" ? "plano" : "3d",
    altura: alturas.includes(o.altura as ModoAltura) ? (o.altura as ModoAltura) : base.altura,
    etiquetas: o.etiquetas === "seleccion" ? "seleccion" : "todas",
    ocultas,
    cuenta: FILTROS_CUENTA.includes(o.cuenta as FiltroCuenta) ? (o.cuenta as FiltroCuenta) : base.cuenta,
    ocultarDesconectados: o.ocultarDesconectados === true,
    girar: o.girar === true,
    verPublicos: o.verPublicos !== false,
  };
}

export function leerPreferenciasMapa(): PreferenciasMapa {
  try {
    if (typeof window === "undefined") return sanearPreferencias(null);
    const txt = window.localStorage.getItem(CLAVE_PREFERENCIAS_MAPA);
    return sanearPreferencias(txt ? JSON.parse(txt) : null);
  } catch {
    return sanearPreferencias(null);
  }
}

export function guardarPreferenciasMapa(p: PreferenciasMapa): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CLAVE_PREFERENCIAS_MAPA, JSON.stringify(sanearPreferencias(p)));
  } catch {
    /* almacenamiento no disponible: la vista sigue funcionando, solo no se recuerda */
  }
}
