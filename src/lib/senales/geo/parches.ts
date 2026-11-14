/**
 * parches — qué se pinta, y cómo, de cada marca en cada capa (MAP1114C). Puro: sin React, sin Leaflet.
 * Una posición que ya no es «en vivo» nunca pinta color: se pinta como «sin medir» (hueco gris), porque no se
 * puede afirmar que el valor se midiera ahí ahora. Una marca sin posición no tiene parche.
 */

import { pintarMarca, type CapaSenal, type EstiloTramo } from "./capas";
import type { MarcaGeo } from "./marcas";
import { coordenadasDeVista, posicionEsViva } from "./modelo-geo";

export interface Parche {
  marcaId: string;
  lat: number;
  lon: number;
  color: string;
  estilo: EstiloTramo;
  /** Texto del valor para el título accesible. */
  texto: string;
  viva: boolean;
}

export function parchesDeCapa(capa: CapaSenal, marcas: readonly MarcaGeo[], ahora: number): Parche[] {
  const out: Parche[] = [];
  for (const m of marcas) {
    const c = coordenadasDeVista(m.posicion);
    if (!c || m.posicion.tipo !== "exacta") continue;
    const viva = posicionEsViva(m.posicion.t, ahora);
    const { tramo, valor } = pintarMarca(capa, m);
    if (!viva) {
      out.push({ marcaId: m.id, lat: c.lat, lon: c.lon, color: "#94a3b8", estilo: "hueco", texto: `${valor.texto} (posición antigua)`, viva });
    } else {
      out.push({ marcaId: m.id, lat: c.lat, lon: c.lon, color: tramo.color, estilo: tramo.estilo, texto: valor.texto, viva });
    }
  }
  return out;
}
