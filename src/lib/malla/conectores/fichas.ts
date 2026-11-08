/**
 * conectores/fichas — ficha de capacidades por tipo de medio (MED1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Valores de diseño de cada medio (contrato `red-sin-dependencias.md` §4 y `transporte-universal-sin-internet.md`);
 * lo MEDIDO (ancho, latencia, MTU declarado, ruta, cifrado) se lee del enlace vivo y manda sobre el diseño.
 * Puro: sin red ni DOM.
 */

import type { EnlaceDisponible } from "@/lib/malla/eleccion-enlace";
import type { CifradoFicha, FichaCapacidades } from "./tipos";

type Base = Omit<FichaCapacidades, "anchoKbps" | "latenciaMs" | "medida">;

const BASE: Record<string, Base> = {
  local: { mtu: null, alcanceM: 100, energia: "media", tiempoAire: "libre", coste: "gratis", privacidad: "local", llevaFlujos: true, cifrado: "propio", permisos: ["red-local"] },
  nativo: { mtu: null, alcanceM: 100, energia: "media", tiempoAire: "libre", coste: "gratis", privacidad: "local", llevaFlujos: false, cifrado: "no-dice", permisos: ["red-local", "app-nativa"] },
  ble: { mtu: 20 * 1024 * 1024, alcanceM: 30, energia: "baja", tiempoAire: "normal", coste: "gratis", privacidad: "local", llevaFlujos: false, cifrado: "no-dice", permisos: ["bluetooth", "app-nativa"] },
  cuenta: { mtu: null, alcanceM: null, energia: "media", tiempoAire: "libre", coste: "datos", privacidad: "cuenta", llevaFlujos: false, cifrado: "propio", permisos: ["cuenta"] },
  par: { mtu: null, alcanceM: null, energia: "media", tiempoAire: "libre", coste: "datos", privacidad: "cuenta", llevaFlujos: false, cifrado: "propio", permisos: ["cuenta", "vinculo-consentido"] },
  rele: { mtu: null, alcanceM: null, energia: "baja", tiempoAire: "libre", coste: "servidor", privacidad: "servidor", llevaFlujos: false, cifrado: "no-dice", permisos: ["cuenta", "internet"] },
  lora: { mtu: 200, alcanceM: 5000, energia: "baja", tiempoAire: "escaso", coste: "gratis", privacidad: "local", llevaFlujos: false, cifrado: "no-dice", permisos: ["antena-lora"] },
};

const DESCONOCIDO: Base = { mtu: null, alcanceM: null, energia: "media", tiempoAire: "normal", coste: "gratis", privacidad: "local", llevaFlujos: false, cifrado: "no-dice", permisos: [] };

/** Ancho de banda típico (kbps) de diseño, solo para ordenar cuando no hay medida. null = no se supone. */
const ANCHO_DISENO: Record<string, number | null> = { ble: null, lora: 1, nativo: null };

export function fichaBase(tipo: string): Base {
  return BASE[tipo] ?? DESCONOCIDO;
}

function finito(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Ficha de un tipo de medio, mezclando lo medido del enlace vivo (si se da). Pura. */
export function fichaDeTipo(tipo: string, enlace?: EnlaceDisponible): FichaCapacidades {
  const b = fichaBase(tipo);
  const ancho = finito(enlace?.capacidadKbps) ?? ANCHO_DISENO[tipo] ?? null;
  const lat = finito(enlace?.rttMs);
  const medida = finito(enlace?.capacidadKbps) !== null || lat !== null;
  const cifrado: CifradoFicha = enlace?.cifrado ?? b.cifrado;
  return {
    ...b,
    permisos: [...b.permisos],
    mtu: typeof enlace?.maxBytes === "number" ? enlace.maxBytes : b.mtu,
    llevaFlujos: enlace ? !!enlace.admite.flujo : b.llevaFlujos,
    cifrado,
    anchoKbps: ancho,
    latenciaMs: lat,
    medida,
  };
}
