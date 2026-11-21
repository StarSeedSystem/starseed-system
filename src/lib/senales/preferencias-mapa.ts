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
import { FILTRO_VACIO, type FiltroEspectro } from "./espectro/filtros";
export type { FiltroEspectro };
import type { CapaRed, Medio, OrigenDato } from "./espectro/tipos";

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
  /** Filtro del espectrómetro guardado por neurona. */
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
  if (typeof crudo !== "object" || crudo === null) return { ...base, ocultas: [], filtroEspectro: {} };
  const o = crudo as Record<string, unknown>;
  const alturas = MODOS_ALTURA.map((m) => m.id);
  const ocultas = Array.isArray(o.ocultas)
    ? Array.from(new Set(o.ocultas.filter((x): x is AntennaKind => FAMILIAS.includes(x as AntennaKind))))
    : [];

  const capasValidas = new Set<CapaRed>(["propia", "publica", "comunidad", "privada", "externa"]);
  const mediosValidos = new Set<Medio>(["wifi", "bluetooth", "lora", "celular", "malla", "internet", "estacion", "sdr"]);
  const origenesValidos = new Set<OrigenDato>(["medida", "declarada", "estimada"]);

  function sanearRango(r: unknown): { desde?: number; hasta?: number } | undefined {
    if (typeof r !== "object" || r === null) return undefined;
    const ro = r as Record<string, unknown>;
    const desde = typeof ro.desde === "number" && Number.isFinite(ro.desde) ? ro.desde : undefined;
    const hasta = typeof ro.hasta === "number" && Number.isFinite(ro.hasta) ? ro.hasta : undefined;
    if (desde === undefined && hasta === undefined) return undefined;
    return { desde, hasta };
  }

  const filtroCrudo = o.filtroEspectro;
  let filtroEspectro: FiltroEspectro = {};
  if (typeof filtroCrudo === "object" && filtroCrudo !== null) {
    const fc = filtroCrudo as Record<string, unknown>;
    const frecuenciaKhz = sanearRango(fc.frecuenciaKhz);
    const anchoKhz = sanearRango(fc.anchoKhz);
    const capas = Array.isArray(fc.capas)
      ? Array.from(new Set(fc.capas.filter((c): c is CapaRed => capasValidas.has(c as CapaRed))))
      : undefined;
    const medios = Array.isArray(fc.medios)
      ? Array.from(new Set(fc.medios.filter((m): m is Medio => mediosValidos.has(m as Medio))))
      : undefined;
    const origenes = Array.isArray(fc.origenes)
      ? Array.from(new Set(fc.origenes.filter((or): or is OrigenDato => origenesValidos.has(or as OrigenDato))))
      : undefined;
    const soloCompatibles = fc.soloCompatibles === true;
    const texto = typeof fc.texto === "string" ? fc.texto.trim() : undefined;

    const temporal: Record<string, unknown> = {};
    if (frecuenciaKhz) temporal.frecuenciaKhz = frecuenciaKhz;
    if (anchoKhz) temporal.anchoKhz = anchoKhz;
    if (capas?.length) temporal.capas = capas;
    if (medios?.length) temporal.medios = medios;
    if (origenes?.length) temporal.origenes = origenes;
    if (soloCompatibles) temporal.soloCompatibles = true;
    if (texto) temporal.texto = texto;

    filtroEspectro = Object.keys(temporal).length === 0 ? {} : (temporal as FiltroEspectro);
  }

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
