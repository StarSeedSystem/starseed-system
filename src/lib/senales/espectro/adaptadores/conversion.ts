/**
 * conversion — conversión de escaneos y enlaces a señales (MAP1116B).
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { CapaRed, SenalEspectro } from "../modelo";
import { bandaDeFrecuencia, frecuenciaDeCanalWifi, etiquetaFrecuencia, BANDAS_CONOCIDAS } from "../bandas";
import type { EscaneoWifi, EntradaAdaptadorWifi } from "./tipos";
import { generarId, bandaWifiDeKhz } from "./ayudas";
import { calidadDeRssi, calidadDeRtt } from "./calidad";

/** Convierte un escaneo nativo a señales del espectro. */
export function convertirEscaneoNativo(
  escaneos: ReadonlyArray<EscaneoWifi>,
  ahora: number,
  zona: string | null,
  capa: CapaRed,
): SenalEspectro[] {
  const senales: SenalEspectro[] = [];
  for (const esc of escaneos) {
    let frecuenciaKhz: number | null = null;
    let anchoKhz: number | null = null;
    let banda: string | null = null;

    if (typeof esc.frecuenciaMhz === "number" && esc.frecuenciaMhz > 0) {
      frecuenciaKhz = Math.round(esc.frecuenciaMhz * 1000);
    } else if (typeof esc.canal === "number" && esc.canal > 0) {
      let bandaCanal: "2.4" | "5" | "6" | null = null;
      if (esc.canal >= 1 && esc.canal <= 14) bandaCanal = "2.4";
      else if (esc.canal >= 36 && esc.canal <= 177) bandaCanal = "5";
      else if (esc.canal >= 1 && esc.canal <= 233) bandaCanal = "6";

      if (bandaCanal) {
        const f = frecuenciaDeCanalWifi(bandaCanal, esc.canal);
        if (f) frecuenciaKhz = f;
      }
    }

    if (typeof esc.anchoMhz === "number" && esc.anchoMhz > 0) {
      anchoKhz = Math.round(esc.anchoMhz * 1000);
    }

    if (frecuenciaKhz !== null) {
      const bandaConocida = bandaDeFrecuencia(frecuenciaKhz);
      if (bandaConocida) {
        banda = bandaConocida.etiqueta;
      } else {
        const bandaWifi = bandaWifiDeKhz(frecuenciaKhz);
        if (bandaWifi) {
          const bandaKey = `wifi-${bandaWifi}` as keyof typeof BANDAS_CONOCIDAS;
          const bandaObj = BANDAS_CONOCIDAS[bandaKey];
          if (bandaObj) banda = bandaObj.etiqueta;
        }
        if (!banda) banda = etiquetaFrecuencia(frecuenciaKhz);
      }
    }

    if (frecuenciaKhz === null) continue;

    const fuerzaDbm = typeof esc.rssi === "number" ? esc.rssi : null;
    const calidad = fuerzaDbm !== null ? calidadDeRssi(fuerzaDbm) : null;

    senales.push({
      id: generarId("wifi", "escaneo-nativo", ahora),
      medio: "wifi",
      banda: banda ?? "Wi-Fi",
      frecuenciaKhz,
      anchoKhz,
      fuerzaDbm,
      calidad,
      origen: "medida",
      capa,
      fuente: "escaneo de Wi-Fi del sistema",
      medidoEn: ahora,
      zona,
      compatibles: [],
    });
  }
  return senales;
}

/** Crea señales a partir de enlaces medidos (Wi-Fi locales). */
export function crearSenalesDeEnlaces(
  enlaces: EntradaAdaptadorWifi["enlacesMedidos"],
  ahora: number,
  zona: string | null,
  capa: CapaRed,
): SenalEspectro[] {
  const senales: SenalEspectro[] = [];
  for (const enlace of enlaces) {
    if (enlace.medio !== "wifi") continue;
    if (enlace.rttMs === null && enlace.kbps === null) continue;

    const calidad = enlace.rttMs !== null
      ? calidadDeRtt(enlace.rttMs)
      : enlace.kbps !== null
        ? Math.max(0, Math.min(1, enlace.kbps / 20_000))
        : null;

    senales.push({
      id: generarId("wifi", `enlace-${enlace.id}`, enlace.t),
      medio: "wifi",
      banda: "Wi-Fi (enlace local)",
      frecuenciaKhz: null,
      anchoKhz: null,
      fuerzaDbm: null,
      calidad,
      origen: "medida",
      capa,
      fuente: "enlace Wi-Fi local medido",
      medidoEn: enlace.t,
      zona,
      compatibles: [],
    });
  }
  return senales;
}