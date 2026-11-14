/**
 * alcances — el alcance TÍPICO de cada medio de radio, con su fuente (MAP1114D).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Estos números son ESTIMACIONES de referencia, no medidas de ningún aparato: el alcance real depende de paredes,
 * antena, potencia y ruido. El mapa los pinta siempre como «alcance estimado» (más claro y rayado) y nunca con el
 * color ni el trazo de algo medido. Cada cifra lleva su fuente; si cambia, cambia aquí y en ningún otro sitio.
 * Puro: sin React, sin red, sin `node:*`.
 */

export type MedioAlcance = "ble" | "wifi" | "lora";

export interface AlcanceMedio {
  medio: MedioAlcance;
  etiqueta: string;
  /** Radio típico en metros (estimado). */
  metros: number;
  /** Color del campo (el de la capa). */
  color: string;
  /** De dónde sale el número. */
  fuente: string;
  /** Qué significa «radio encendida» para este medio con lo que la app puede leer hoy. */
  encendida: string;
}

export const ROTULO_ALCANCE = "alcance estimado";

export const ALCANCES: Readonly<Record<MedioAlcance, AlcanceMedio>> = {
  ble: {
    medio: "ble", etiqueta: "Bluetooth", metros: 30, color: "#3b82f6",
    fuente: "Bluetooth SIG, «Bluetooth Range»: BLE llega a ≈100 m en campo abierto y el uso típico entre aparatos es de 10 a 30 m; se toma 30 m (referencia de especificación, no medida).",
    encendida: "el aparato anuncia que tiene adaptador Bluetooth disponible (Web Bluetooth)",
  },
  wifi: {
    medio: "wifi", etiqueta: "Wi-Fi", metros: 50, color: "#14b8a6",
    fuente: "Referencia de uso habitual de IEEE 802.11 en 2,4 GHz con un punto de acceso doméstico: decenas de metros en interior y algo más en exterior; se toma 50 m. Cifra de referencia, sin comprobar contra ninguna medida propia.",
    encendida: "el sistema dice que la conexión actual es Wi-Fi (la app no puede leer si la radio está encendida sin estar conectada)",
  },
  lora: {
    medio: "lora", etiqueta: "LoRa", metros: 2000, color: "#f59e0b",
    fuente: "LoRa Alliance y documentación de Meshtastic: ≈2 a 5 km en ciudad y hasta 15 km con vista directa; se toma 2 km, el extremo prudente (referencia de especificación, no medida).",
    encendida: "el aparato tiene una radio Meshtastic y su estado no es «sin radio»",
  },
};

export const MEDIOS_ALCANCE: readonly MedioAlcance[] = ["ble", "wifi", "lora"];

/** Metros por píxel en pantalla a esa latitud y zoom de Leaflet (proyección Web Mercator, teselas de 256 px). */
export function metrosPorPixel(latitud: number, zoom: number): number {
  return (156543.03392 * Math.cos((latitud * Math.PI) / 180)) / Math.pow(2, zoom);
}

/** Radio en píxeles de un alcance en metros; nunca negativo ni infinito. */
export function radioEnPixeles(metros: number, latitud: number, zoom: number): number {
  const mpp = metrosPorPixel(latitud, zoom);
  return mpp > 0 && Number.isFinite(mpp) ? metros / mpp : 0;
}
