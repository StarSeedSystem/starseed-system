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
import type { FiltroEspectro } from "./espectro/filtros";
import { FILTRO_VACIO } from "./espectro/filtros";

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
  /** Filtro de señales por neurona (espectrómetro): frecuencia, ancho, capa, medio, origen, compatibilidad y texto. */
  filtroEspectro: FiltroEspectro;
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
  filtroEspectro: FILTRO_VACIO,
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
  const filtroEspectro = sanearFiltroEspectro(o.filtroEspectro);
  return {
    vista: o.vista === "plano" ? "plano" : "3d",
    altura: alturas.includes(o.altura as ModoAltura) ? (o.altura as ModoAltura) : base.altura,
    etiquetas: o.etiquetas === "seleccion" ? "seleccion" : "todas",
    ocultas,
    cuenta: FILTROS_CUENTA.includes(o.cuenta as FiltroCuenta) ? (o.cuenta as FiltroCuenta) : base.cuenta,
    ocultarDesconectados: o.ocultarDesconectados === true,
    girar: o.girar === true,
    verPublicos: o.verPublicos !== false,
    filtroEspectro,
  };
}

function esNumeroFinito(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function sanearRango(r: unknown): { desde?: number; hasta?: number } | undefined {
  if (typeof r !== "object" || r === null) return undefined;
  const ro = r as Record<string, unknown>;
  const desde = esNumeroFinito(ro.desde) ? ro.desde : undefined;
  const hasta = esNumeroFinito(ro.hasta) ? ro.hasta : undefined;
  if (desde === undefined && hasta === undefined) return undefined;
  if (desde !== undefined && hasta !== undefined && desde > hasta) {
    return { desde: hasta, hasta: desde };
  }
  return { desde, hasta };
}

function sanearArrayValido<T>(arr: unknown, validos: readonly T[]): T[] {
  if (!Array.isArray(arr)) return [];
  return Array.from(new Set(arr.filter((x): x is T => validos.includes(x as T))));
}

function sanearFiltroEspectro(f: unknown): FiltroEspectro {
  if (typeof f !== "object" || f === null) return FILTRO_VACIO;
  const fo = f as Record<string, unknown>;
  const frecuenciaKhz = sanearRango(fo.frecuenciaKhz);
  const anchoKhz = sanearRango(fo.anchoKhz);
  const capas = sanearArrayValido(fo.capas, ["propia", "publica", "comunidad", "privada", "externa"]);
  const medios = sanearArrayValido(fo.medios, ["wifi", "bluetooth", "lora", "celular", "malla", "internet", "estacion", "sdr"]);
  const origenes = sanearArrayValido(fo.origenes, ["medida", "declarada", "estimada"]);
  const soloCompatibles = fo.soloCompatibles === true;
  const texto = typeof fo.texto === "string" ? fo.texto.trim() : undefined;
  const resultado: FiltroEspectro = {};
  if (frecuenciaKhz) resultado.frecuenciaKhz = frecuenciaKhz;
  if (anchoKhz) resultado.anchoKhz = anchoKhz;
  if (capas.length) resultado.capas = capas;
  if (medios.length) resultado.medios = medios;
  if (origenes.length) resultado.origenes = origenes;
  if (soloCompatibles) resultado.soloCompatibles = true;
  if (texto) resultado.texto = texto;
  return resultado;
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
