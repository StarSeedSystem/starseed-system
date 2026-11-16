/**
 * conexion — creación de señal de conexión actual (MAP1116B).
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { CapaRed, SenalEspectro } from "../modelo";
import { generarId } from "./ayudas";

/** Crea la señal de «tu conexión actual» a partir de SenalesMedio.internet. */
export function crearSenalConexionActual(
  internet: { enLinea: boolean; tipo?: string; efectivo?: string; mbps?: number } | null | undefined,
  ahora: number,
  zona: string | null,
  capa: CapaRed,
): SenalEspectro | null {
  if (!internet || !internet.enLinea) return null;

  const tipo = internet.tipo ?? "desconocido";
  const mbps = typeof internet.mbps === "number" && internet.mbps > 0 ? internet.mbps : null;

  let banda = "Internet";
  if (tipo === "wifi") banda = "Wi-Fi";
  else if (tipo === "cellular") banda = "Celular";
  else if (tipo === "ethernet") banda = "Ethernet";

  const calidad = mbps !== null ? Math.max(0, Math.min(1, mbps / 20)) : null;

  return {
    id: generarId("internet", "conexion-actual", ahora),
    medio: "internet",
    banda,
    frecuenciaKhz: null,
    anchoKhz: null,
    fuerzaDbm: null,
    calidad,
    origen: "medida",
    capa,
    fuente: "Network Information API",
    medidoEn: ahora,
    zona,
    compatibles: [],
  };
}