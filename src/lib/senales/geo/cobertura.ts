/**
 * cobertura — campos de alcance estimado (MAP1114D) y zonas de red (MRA10b). Puro: sin React ni Leaflet.
 * Un campo de alcance se centra en el punto EXACTO de una neurona con radio encendida y posición viva; su radio es
 * el alcance típico de `alcances.ts`. Las capas `red-*` NO usan puntos de nadie: cada señal publicada con `zona`
 * se pinta como la celda de su geohash; sin zona no se dibuja y se cuenta aparte.
 */

import { ALCANCES } from "./alcances";
import type { CapaSenal } from "./capas";
import { calidadDeEnlace, textoEnlace, type EnlaceMedido } from "./enlaces-medidos";
import { tramoDeCalidad, CAPA_ENLACES, CAPA_RED_POR_ID, tramoDe } from "./capas";
import type { MarcaGeo } from "./marcas";
import { coordenadasDeVista, posicionEsViva } from "./modelo-geo";
import { horaDe } from "./ficha-geo";
import type { OrigenDato, SenalEspectro } from "../espectro/tipos";

export interface Campo {
  marcaId: string;
  lat: number;
  lon: number;
  metros: number;
  color: string;
  /** «rayado» = zona estimada; «continuo» = dato medido. */
  estilo?: "rayado" | "continuo";
  texto?: string;
  /** Hora de la lectura (epoch ms) cuando la hay. */
  t?: number | null;
  origen?: OrigenDato;
}

const ALFABETO_GEOHASH = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Centro y radio (m) de la celda de un geohash de 1 a 5 caracteres; null si no es un geohash. */
export function decodificarZona(zona: string): { lat: number; lon: number; metros: number } | null {
  const z = zona.trim().toLowerCase();
  if (!z || z.length > 5) return null;
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180, par = true;
  for (const ch of z) {
    const i = ALFABETO_GEOHASH.indexOf(ch);
    if (i < 0) return null;
    for (let bit = 4; bit >= 0; bit--) {
      const uno = (i >> bit) & 1;
      const m = par ? (lonMin + lonMax) / 2 : (latMin + latMax) / 2;
      if (par) { if (uno) lonMin = m; else lonMax = m; } else { if (uno) latMin = m; else latMax = m; }
      par = !par;
    }
  }
  const lat = (latMin + latMax) / 2, lon = (lonMin + lonMax) / 2;
  const alto = ((latMax - latMin) / 2) * 110540;
  const ancho = ((lonMax - lonMin) / 2) * 111320 * Math.cos((lat * Math.PI) / 180);
  return { lat, lon, metros: Math.round(Math.hypot(alto, ancho)) };
}

/** Señales de una capa `red-*`: las que el llamador pasa o, si no, las colgadas de cada marca. */
function senalesPublicadasDeCapa(capa: CapaSenal, marcas: readonly MarcaGeo[], publicadas?: readonly SenalEspectro[]): SenalEspectro[] {
  const red = CAPA_RED_POR_ID[capa.id];
  if (!red) return [];
  const todas = publicadas ?? marcas.flatMap((m) => (m.publicadas ?? []) as readonly SenalEspectro[]);
  const porId = new Map<string, SenalEspectro>();
  for (const s of todas) if (s.capa === red) porId.set(s.id, s);
  return Array.from(porId.values());
}

/** Señales de la capa que no se dibujan por no traer una zona legible. */
export function contarSenalesSinZona(capa: CapaSenal, marcas: readonly MarcaGeo[], publicadas?: readonly SenalEspectro[]): number {
  return senalesPublicadasDeCapa(capa, marcas, publicadas).filter((s) => !s.zona || !decodificarZona(s.zona)).length;
}

function camposDeRed(capa: CapaSenal, marcas: readonly MarcaGeo[], publicadas?: readonly SenalEspectro[]): Campo[] {
  const campos: Campo[] = [];
  for (const s of senalesPublicadasDeCapa(capa, marcas, publicadas)) {
    const zona = s.zona ? decodificarZona(s.zona) : null;
    if (!zona) continue;
    const medida = s.origen === "medida";
    const h = medida ? horaDe(s.medidoEn) : "";
    const hora = medida ? (h ? ` · medida a las ${h}` : " · medida") : "";
    campos.push({
      marcaId: `senal:${s.id}`, lat: zona.lat, lon: zona.lon, metros: zona.metros,
      color: tramoDe(capa, s.origen).color, estilo: medida ? "continuo" : "rayado",
      texto: `zona aproximada · publicado por su dueño${hora}`, t: s.medidoEn, origen: s.origen,
    });
  }
  return campos;
}

export function camposDeCapa(capa: CapaSenal, marcas: readonly MarcaGeo[], ahora: number, publicadas?: readonly SenalEspectro[]): Campo[] {
  if (CAPA_RED_POR_ID[capa.id]) return camposDeRed(capa, marcas, publicadas);
  if (capa.tipo !== "alcance" || !capa.medio) return [];
  const a = ALCANCES[capa.medio];
  const out: Campo[] = [];
  for (const m of marcas) {
    const c = coordenadasDeVista(m.posicion);
    if (!c || m.posicion.tipo !== "exacta" || !posicionEsViva(m.posicion.t, ahora)) continue;
    if (capa.valor(m).tramo !== "estimado") continue;
    out.push({ marcaId: m.id, lat: c.lat, lon: c.lon, metros: a.metros, color: a.color, estilo: "rayado" });
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