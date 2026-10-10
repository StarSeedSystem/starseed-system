"use client";

/**
 * MeshMap3D — antes el «Mapa 3D de neuronas activas» (Adenda 98). Ahora es el MISMO instrumento
 * que el Radar de señales reales: el Mapa 3D de señales reales (`./mapa-senales/`), con «Tú» en el
 * centro, tus aparatos con sus medios abiertos y el enlace real entre ellos, los nodos LoRa/BLE/Wi-Fi/USB,
 * filtros por antena y por cuenta, ficha con la fuente de cada valor y vista 3D o plana. Este archivo
 * solo conserva la ruta y el nombre antiguos para quien aún los importe.
 *
 * SOP: `architecture/mapa-3d-senales-reales.md`.
 */

import { MapaSenales } from "./mapa-senales/mapa-senales";

export { MapaSenales as MeshMap3D };
export default MapaSenales;
