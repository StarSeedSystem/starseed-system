/**
 * wifi — adaptador de Wi-Fi e internet para el espectrómetro (MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Puro: sin React, sin red, sin `node:*`.
 * La lectura se inyecta; esta función solo transforma.
 */

import type { EntradaAdaptadorWifi } from "./tipos";
import { crearSenalConexionActual } from "./conexion";
import { convertirEscaneoNativo } from "./conversion";
import { crearSenalesDeEnlaces } from "./conversion";

/**
 * Adaptador principal de Wi-Fi e internet.
 * Devuelve las señales del espectro y las fuentes que faltan.
 */
export function adaptadorWifi(entrada: EntradaAdaptadorWifi): {
  senales: import("../modelo").SenalEspectro[];
  sinFuente: import("../modelo").SinFuente[];
} {
  const ahora = Date.now();
  const zona = entrada.zona ?? null;
  const capa = entrada.capa ?? "propia";

  const senales: import("../modelo").SenalEspectro[] = [];

  const senalConexion = crearSenalConexionActual(entrada.senalesMedio?.internet ?? null, ahora, zona, capa);
  if (senalConexion) senales.push(senalConexion);

  if (entrada.escaneoNativo && entrada.escaneoNativo.length > 0) {
    senales.push(...convertirEscaneoNativo(entrada.escaneoNativo, ahora, zona, capa));
  }

  senales.push(...crearSenalesDeEnlaces(entrada.enlacesMedidos, ahora, zona, capa));

  const sinFuente: import("../modelo").SinFuente[] = [
    {
      medio: "wifi",
      motivo: "este aparato no deja escanear redes Wi-Fi desde la app",
    },
  ];

  return { senales, sinFuente };
}

export type { EscaneoWifi, EntradaAdaptadorWifi } from "./tipos";
export { generarId, bandaWifiDeKhz } from "./ayudas";
export { calidadDeRssi, calidadDeRtt } from "./calidad";
export { convertirEscaneoNativo, crearSenalesDeEnlaces } from "./conversion";
export { crearSenalConexionActual } from "./conexion";