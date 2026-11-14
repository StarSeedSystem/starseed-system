/**
 * cobertura — qué campos de alcance estimado y qué líneas medidas se pintan (MAP1114D). Puro: sin React ni Leaflet.
 * Un campo se dibuja centrado en el punto EXACTO de una neurona con posición en vivo y con la radio de ese medio
 * encendida; su radio es el alcance típico de `alcances.ts` (siempre «estimado»). Una posición antigua no pinta campo:
 * no se puede afirmar que la cobertura esté ahí ahora. Las líneas son lo único medido: una por enlace con medida.
 */

import { ALCANCES } from "./alcances";
import type { CapaSenal } from "./capas";
import { calidadDeEnlace, textoEnlace, type EnlaceMedido } from "./enlaces-medidos";
import { tramoDeCalidad, CAPA_ENLACES, tramoDe } from "./capas";
import type { MarcaGeo } from "./marcas";
import { coordenadasDeVista, posicionEsViva } from "./modelo-geo";

export interface Campo {
  marcaId: string;
  lat: number;
  lon: number;
  metros: number;
  color: string;
}

export function camposDeCapa(capa: CapaSenal, marcas: readonly MarcaGeo[], ahora: number): Campo[] {
  if (capa.tipo !== "alcance" || !capa.medio) return [];
  const a = ALCANCES[capa.medio];
  const out: Campo[] = [];
  for (const m of marcas) {
    const c = coordenadasDeVista(m.posicion);
    if (!c || m.posicion.tipo !== "exacta" || !posicionEsViva(m.posicion.t, ahora)) continue;
    if (capa.valor(m).tramo !== "estimado") continue;
    out.push({ marcaId: m.id, lat: c.lat, lon: c.lon, metros: a.metros, color: a.color });
  }
  return out;
}

export interface Linea {
  id: string;
  de: { lat: number; lon: number };
  a: { lat: number; lon: number };
  color: string;
  medio: EnlaceMedido["medio"];
  /** Texto para tocar: calidad medida y hora de la lectura. */
  texto: string;
  /** 0 = el primero de esa pareja; si dos medios unen a las mismas neuronas, el 2.º se dibuja más fino encima (cable de dos colores). */
  pila: number;
  t: number;
}

export const ETIQUETA_MEDIO = { ble: "Bluetooth", wifi: "Red local / Wi-Fi" } as const;

/** Una línea por enlace medido cuyos dos extremos tienen posición exacta en vivo. */
export function lineasDeEnlaces(enlaces: readonly EnlaceMedido[], marcas: readonly MarcaGeo[], ahora: number, horaDe: (t: number) => string): Linea[] {
  const yo = marcas.find((m) => m.esYo);
  const cy = yo ? coordenadasDeVista(yo.posicion) : null;
  if (!yo || !cy || yo.posicion.tipo !== "exacta" || !posicionEsViva(yo.posicion.t, ahora)) return [];
  const out: Linea[] = [];
  const porPareja = new Map<string, number>();
  for (const e of enlaces) {
    const otra = marcas.find((m) => m.neuronaId === e.neurona && !m.esYo);
    const co = otra ? coordenadasDeVista(otra.posicion) : null;
    const q = calidadDeEnlace(e);
    if (!otra || !co || otra.posicion.tipo !== "exacta" || !posicionEsViva(otra.posicion.t, ahora) || q === null) continue;
    const tr = tramoDe(CAPA_ENLACES, tramoDeCalidad(q));
    const pila = porPareja.get(e.neurona) ?? 0;
    porPareja.set(e.neurona, pila + 1);
    out.push({ pila, id: e.id, de: cy, a: co, color: tr.color, medio: e.medio, texto: `${ETIQUETA_MEDIO[e.medio]} · ${otra.nombre} · ${tr.etiqueta.toLowerCase()} · ${textoEnlace(e)} · medido a las ${horaDe(e.t)}`, t: e.t });
  }
  return out;
}
