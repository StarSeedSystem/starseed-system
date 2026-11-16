/**
 * utilidades — re-exportaciones del adaptador Wi-Fi (MAP1116B).
 * Puro: sin React, sin red, sin `node:*`.
 */

export { generarId, bandaWifiDeKhz } from "./ayudas";
export { calidadDeRssi, calidadDeRtt } from "./calidad";
export { convertirEscaneoNativo, crearSenalesDeEnlaces } from "./conversion";
export { crearSenalConexionActual } from "./conexion";