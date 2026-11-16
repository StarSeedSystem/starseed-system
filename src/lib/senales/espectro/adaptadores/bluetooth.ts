/**
 * bluetooth — adaptador puro del espectrómetro para Bluetooth/BLE (MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Convierte la disponibilidad real (`SenalesMedio.bluetooth.disponible`) y los
 * anuncios BLE ya detectados (`BleDetection` de `useDetectedSignals`, `freshBle`)
 * en `SenalEspectro` o `SinFuente`. No escanea: solo convierte lo ya leído.
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { SenalEspectro, SinFuente, Medio, OrigenDato, CapaRed, Compatibilidad } from "../modelo";
import { qualityFromRssi, type BleDetection } from "@/ai/astraura/mesh/signals";

const MEDIO: Medio = "bluetooth";
const BANDA = "2,4 GHz BLE";
const FUENTE_ESCANEO = "escaneo BLE";
const FUENTE_SELECTOR = "selector de dispositivos BLE";
const MOTIVO_SIN_ADAPTADOR = "Bluetooth no disponible o sin permiso";

export interface EntradaBluetooth {
  /** `SenalesMedio.bluetooth.disponible` — true | false | null. */
  disponible: boolean | null;
  /** Anuncios BLE frescos (≤ 60 s) ya filtrados por `useDetectedSignals`. */
  detecciones: readonly BleDetection[];
}

/**
 * Adapta Bluetooth al espectrómetro.
 * - `disponible: false/null` → `SinFuente` con motivo.
 * - Cada `BleDetection` → `SenalEspectro` (fuerza = RSSI real; nombre NO en campos públicos).
 * - Frecuencia/ancho: null (el canal de anuncio 37/38/39 no se sabe por anuncio individual).
 */
export function adaptarBluetooth(entrada: EntradaBluetooth): readonly SenalEspectro[] | SinFuente {
  if (!entrada.disponible) {
    return { medio: MEDIO, motivo: MOTIVO_SIN_ADAPTADOR };
  }

  const senales: SenalEspectro[] = [];

  for (const d of entrada.detecciones) {
    const calidad = d.rssi != null ? qualityFromRssi(d.rssi) : null;
    const fuente = d.viaPicker ? FUENTE_SELECTOR : FUENTE_ESCANEO;

    const senal: SenalEspectro = {
      id: `ble:${d.id}`,
      medio: MEDIO,
      banda: BANDA,
      frecuenciaKhz: null,
      anchoKhz: null,
      fuerzaDbm: d.rssi,
      calidad,
      origen: d.rssi != null ? "medida" : "estimada",
      capa: "publica",
      fuente,
      medidoEn: d.at,
      zona: null,
      compatibles: [],
    };

    senales.push(senal);
  }

  return senales;
}