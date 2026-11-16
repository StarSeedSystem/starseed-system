/**
 * wifi — adaptador puro del espectrómetro para Wi‑Fi (MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════
 * Convierte la disponibilidad real (`SenalesMedio.internet`) y el escaneo
 * de Wi‑Fi ya inyectado (`EscaneoWifi`) y los enlaces directos medidos
 * (`EnlaceMedido`) en `SenalEspectro` o `SinFuente`.
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { SenalEspectro, SinFuente } from "./modelo";
import type { SenalesMedio } from "@/lib/neurons/senales-medio";
import type { EnlaceMedido } from "@/lib/senales/geo/enlaces-medidos";
import { calidadDeEnlace } from "@/lib/senales/geo/enlaces-medidos";
import { frecuenciaDeCanalWifi, bandaDeFrecuencia } from "../bandas";
import { qualityFromRssi } from "@/ai/astraura/mesh/signals";

/** Entrada inyectada en las pruebas. */
export interface EntradaWifi {
  /** Estado de la red del navegador. */
  internet: SenalesMedio["internet"];
  /** Enlaces directos medidos entre este aparato y otros. */
  enlacesMedidos: readonly EnlaceMedido[];
  /** Escaneo nativo de Wi‑Fi, si existe. */
  escaneoWifi?: readonly EscaneoWifi[];
}

/** Escaneo de Wi‑Fi inyectado por la prueba. */
export interface EscaneoWifi {
  /** Canal, opcional. */
  canal?: number;
  /** Frecuencia en MHz, opcional. */
  frecuenciaMhz?: number;
  /** Ancho de banda en MHz, opcional. */
  anchoMhz?: number;
  /** Señal en dBm, opcional. */
  rssi?: number;
}

/** Adaptador Wi‑Fi al espectrómetro. */
export function adaptarWifi(entrada: EntradaWifi): {
  senales: readonly SenalEspectro[];
  sinFuente: readonly SinFuente[];
} {
  const senales: SenalEspectro[] = [];
  const sinFuente: SinFuente[] = [];

  const { internet, enlacesMedidos, escaneoWifi } = entrada;

  /* Señal de la conexión actual */
  senales.push({
    id: "wifi:actual",
    medio: "wifi",
    banda: "",
    frecuenciaKhz: null,
    anchoKhz: null,
    fuerzaDbm: null,
    calidad: null,
    origen: "medida",
    capa: "publica",
    fuente: "conexión local",
    medidoEn: null,
    zona: null,
    compatibles: [],
  });

  /* Enlaces directos a neuronas */
  for (const e of enlacesMedidos) {
    const calidad = calidadDeEnlace(e);
    senales.push({
      id: `wifi:${e.id}`,
      medio: "wifi",
      banda: "",
      frecuenciaKhz: null,
      anchoKhz: null,
      fuerzaDbm: null,
      calidad,
      origen: calidad !== null ? "medida" : "estimada",
      capa: "publica",
      fuente: "enlace de la malla",
      medidoEn: e.t,
      zona: null,
      compatibles: [],
    });
  }

  /* Si no hay escaneo nativo inyectado, añadimos sinFuente */
  if (!escaneoWifi || escaneoWifi.length === 0) {
    sinFuente.push({ medio: "wifi", motivo: "este aparato no deja escanear redes Wi‑Fi desde la app" });
  } else {
    /* Adaptar cada escaneo nativo */
    let idx = 0;
    for (const esc of escaneoWifi) {
      const hertz = esc.frecuenciaMhz != null ? esc.frecuenciaMhz * 1000 : null;
      const banda = hertz != null ? bandaDeFrecuencia(hertz)?.etiqueta ?? null : null;
      const ancho = esc.anchoMhz != null ? esc.anchoMhz * 1000 : null;
      const fuerza = esc.rssi != null ? esc.rssi : null;
      const calidad = esc.rssi != null ? qualityFromRssi(esc.rssi) : null;
      senales.push({
        id: `wifi:scan:${idx++}`,
        medio: "wifi",
        banda: banda ?? "",
        frecuenciaKhz: hertz,
        anchoKhz: ancho,
        fuerzaDbm: fuerza,
        calidad,
        origen: "medida",
        capa: "publica",
        fuente: "escaneo nativo",
        medidoEn: null,
        zona: null,
        compatibles: [],
      });
    }
  }

  return { senales, sinFuente };
}
