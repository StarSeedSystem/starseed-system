/** Fixtures de las pruebas del Mapa 3D de señales reales: datos de mentira, claramente marcados. */
import type { AntennaKind, DetectedSignal } from "@/ai/astraura/mesh/signals";
import type { DispositivoMallaRow } from "@/lib/network/malla-neuronas";
import type { FotoEnlaceLocal } from "@/lib/malla/registro-enlaces-locales";
import type { PresenciaMedio } from "@/lib/neurons/presencia";
import type { SenalesMedio } from "@/lib/neurons/senales-medio";
import type { ContextoVivo } from "../tipos-vivo";

export const AHORA = 1_800_000_000_000;

export function senal(id: string, o: Partial<DetectedSignal> = {}): DetectedSignal {
  const antenna: AntennaKind = o.antenna ?? "lora";
  return {
    id, antenna, antennaLabel: antenna, signalType: "prueba", label: id, detail: "detalle de prueba",
    quality: 0.5, qualityDetail: "calidad de prueba", metrics: [], compatible: true, compatDetail: "compat de prueba",
    starseed: null,
    placement: { angleRad: 0, radiusFrac: 0.5, accuracyFrac: 0.1, mode: "rf", distanceM: 300, accuracyM: 100, detail: "colocación de prueba" },
    lastHeard: AHORA, actions: [], simulated: false, color: "#34d399",
    ...o,
  };
}

export const ID_PROPIA = { via: "neuron-registry" as const, sourceId: "n1", name: "Mac de Alex", ownAccount: true, capabilities: [] as string[] };

/** Un aparato de la cuenta tal como lo entrega el registro (`neuron:<id>`). */
export function aparato(id: string, o: Partial<DetectedSignal> = {}): DetectedSignal {
  return senal(`neuron:${id}`, {
    antenna: "account", label: `Aparato ${id}`, signalType: "Neurona StarSeed · registro de cuenta",
    starseed: { ...ID_PROPIA, sourceId: id, name: `Aparato ${id}`, syncDeviceId: `sync-${id}` },
    placement: { angleRad: 2.4, radiusFrac: 0.4, accuracyFrac: 0.2, mode: "sector", distanceM: null, accuracyM: null, detail: "sin posición" },
    ...o,
  });
}

export function fila(neuronId: string, o: Partial<DispositivoMallaRow> = {}): DispositivoMallaRow {
  return {
    neuronId, syncDeviceId: `sync-${neuronId}`, nombre: `Aparato ${neuronId}`, plataforma: "macOS", tipo: "desktop",
    online: true, esEsteDispositivo: false, ultimoVisto: new Date(AHORA - 60_000).toISOString(),
    enlace: { estado: "sin-vinculo" }, ...o,
  };
}

export const SENALES_MEDIO: SenalesMedio = {
  internet: { enLinea: true, tipo: "wifi", efectivo: "4g", mbps: 50 },
  malla: { pares: 2, otrasCuentas: 1 },
  lora: { estado: "sin-radio", nodos: 0 },
  bluetooth: { disponible: true },
  serie: { disponible: false, puertos: 0 },
  reticulum: { disponible: false, motivo: "aún no corre en ningún medio del OS" },
};

export function medioPresencia(n: string, m: string, o: Partial<PresenciaMedio> = {}): PresenciaMedio {
  return {
    n, m, tipo: "navegador", etiqueta: `Chrome · ${m}`, sid: `sync-${n}`, plataforma: "macOS", visible: true,
    desde: new Date(AHORA - 5 * 60_000).toISOString(), t: AHORA - 10_000, s: SENALES_MEDIO, ...o,
  };
}

export function enlaceLocal(id: string, o: Partial<FotoEnlaceLocal> = {}): FotoEnlaceLocal {
  return { id, nombre: "Móvil sin internet", plataforma: "Android", desde: AHORA - 120_000, rttMs: 9, ruta: "misma-red-local", capacidadKbps: 8000, ...o };
}

export function contexto(o: Partial<ContextoVivo> = {}): ContextoVivo {
  return {
    filas: [], presencia: { conectado: true, medios: [] }, locales: [], miMedioId: "m-yo", miUid: "uid-yo", ahora: AHORA, ...o,
  };
}
