/**
 * voz-datos/hub — por dónde entra la voz que llega por los enlaces de la malla (LLA1108E).
 * Módulo diminuto: el motor Bluetooth publica aquí lo que recibe (`voz.*`) y la sesión de voz de cada par
 * escucha lo suyo. Los enlaces WebRTC locales no pasan por aquí (se escuchan con su propio `alMensaje`).
 */

export interface OrigenVoz {
  tipo: "ble" | "local" | "nativo";
  /** Neurona de la que viene (el enlace ya está ligado a ella). */
  neurona?: string;
  enlaceId: string;
  cifrada: boolean;
}

type Oyente = (texto: string, origen: OrigenVoz) => void;
const oyentes = new Set<Oyente>();

export function publicarVozEntrante(texto: string, origen: OrigenVoz): void {
  for (const f of Array.from(oyentes)) {
    try {
      f(texto, origen);
    } catch {
      /* un oyente roto no tumba a los demás */
    }
  }
}

export function alVozEntrante(cb: Oyente): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}

/** Solo pruebas. */
export function __vaciarHubVoz(): void {
  oyentes.clear();
}
