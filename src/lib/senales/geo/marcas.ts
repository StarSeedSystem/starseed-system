/**
 * marcas — de las neuronas de mi cuenta a las marcas del Mapa (MAP1114B).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Punto = neurona móvil · rombo = nodo fijo (servidor). Anillo = calidad medida del enlace.
 * Cada valor lleva su fuente y la hora de su medida; lo que no se sabe es `null` y la vista dice
 * «desconocido»: nunca un número bonito ni una posición inventada.
 *
 * La posición de una neurona AJENA a este aparato solo llega por el anuncio que ella misma emitió
 * para el ámbito «cuenta» (`anuncioParaAmbito`); si no lo emitió, la marca queda sin posición.
 * Puro: sin React, sin red, sin `node:*`.
 */

import { qualityFromRtt, type AntennaKind } from "@/ai/astraura/mesh/signals";
import { estadoAparato } from "@/lib/senales/aparatos";
import type { EstadoAparato } from "@/lib/senales/tipos-vivo";
import type { DispositivoMallaRow, EstadoEnlace } from "@/lib/network/malla-neuronas";
import type { PresenciaMedio } from "@/lib/neurons/presencia";
import type { SenalesMedio } from "@/lib/neurons/senales-medio";
import { normalizarCapaConciencia, ORDEN_CONCIENCIA, type CapaConcienciaId } from "./capas";
import {
  anuncioParaAmbito, leerAnuncio, posicionVistaDeAnuncio,
  type PosicionCruda, type PosicionVista, type PreferenciaPosicion,
} from "./modelo-geo";

export interface AntenaMarca {
  kind: AntennaKind;
  etiqueta: string;
  /** Texto ya legible; «desconocido» si no se midió. */
  valor: string;
  medida: boolean;
  /** Hora de la medida (epoch ms); null si no se midió. */
  t: number | null;
  fuente: string;
}

export interface CalidadMarca {
  /** 0..1, o null = sin medir. */
  valor: number | null;
  t: number | null;
  fuente: string;
  nota?: string;
}

export interface MarcaGeo {
  id: string;
  neuronaId: string;
  nombre: string;
  plataforma?: string;
  esYo: boolean;
  forma: "punto" | "rombo";
  estado: EstadoAparato;
  posicion: PosicionVista;
  calidad: CalidadMarca;
  enlace: { estado: EstadoEnlace | "propio"; latenciaMs: number | null; t: number | null };
  antenas: AntenaMarca[];
  capas: { lista: CapaConcienciaId[] | null; t: number | null; fuente: string };
  /** Versión y aparato que la neurona anuncia de sí misma (declarado). */
  aparato: { so?: string; soV?: string; equipo?: string; arq?: string; medio?: string } | null;
  versionWeb?: string;
}

export interface EntradaYoGeo {
  neuronaId: string | null;
  nombre: string;
  plataforma?: string;
  senales: SenalesMedio | null;
  /** Lo que `misCapasAnunciadas()` devuelve (`capa:local`…), o null si no se pudo leer. */
  capas: readonly string[] | null;
  posicion: PosicionCruda | null;
  pref: PreferenciaPosicion;
}

export interface EntradaMarcas {
  filas: readonly DispositivoMallaRow[];
  medios: readonly PresenciaMedio[];
  yo: EntradaYoGeo;
  ahora: number;
}

const MOTIVO_NO_COMPARTE = "esa neurona no comparte su posición con tus otras neuronas";
const MOTIVO_SIN_PERMISO = "este aparato aún no conoce su ubicación (no diste permiso o no hay GPS)";

export function antenasDeSenales(s: SenalesMedio | null | undefined, t: number | null): AntenaMarca[] {
  const desconocida = (kind: AntennaKind, etiqueta: string, fuente: string): AntenaMarca => ({ kind, etiqueta, valor: "desconocido", medida: false, t: null, fuente });
  if (!s || t === null) {
    return [
      desconocida("ip", "Internet", "sin medida de este medio"),
      desconocida("account", "Malla", "sin medida de este medio"),
      desconocida("lora", "LoRa", "sin medida de este medio"),
      desconocida("ble", "Bluetooth", "sin medida de este medio"),
      desconocida("serial", "Serie / USB", "sin medida de este medio"),
    ];
  }
  const internet = s.internet.enLinea
    ? ["en línea", s.internet.tipo, s.internet.efectivo, typeof s.internet.mbps === "number" ? `≈${s.internet.mbps} Mb/s` : null].filter(Boolean).join(" · ")
    : "sin conexión";
  const malla = `${s.malla.pares} ${s.malla.pares === 1 ? "par" : "pares"}${s.malla.sinInternet ? ` · ${s.malla.sinInternet} sin internet` : ""}`;
  const lora = s.lora.estado === "sin-radio" ? "sin radio" : `${s.lora.estado} · ${s.lora.nodos} ${s.lora.nodos === 1 ? "nodo" : "nodos"}`;
  const bt = s.bluetooth.disponible === null ? null : s.bluetooth.disponible ? "adaptador disponible" : "sin adaptador";
  return [
    { kind: "ip", etiqueta: "Internet", valor: internet, medida: true, t, fuente: "API de red del navegador (navigator.onLine / connection)" },
    { kind: "account", etiqueta: "Malla", valor: malla, medida: true, t, fuente: "pares WebRTC abiertos ahora" },
    { kind: "lora", etiqueta: "LoRa", valor: lora, medida: true, t, fuente: "radio Meshtastic de ese medio" },
    bt === null ? desconocida("ble", "Bluetooth", "este medio no puede consultarlo") : { kind: "ble", etiqueta: "Bluetooth", valor: bt, medida: true, t, fuente: "Web Bluetooth (getAvailability)" },
    { kind: "serial", etiqueta: "Serie / USB", valor: s.serie.disponible ? `${s.serie.puertos} ${s.serie.puertos === 1 ? "puerto" : "puertos"} autorizados` : "no disponible en este medio", medida: true, t, fuente: "Web Serial (getPorts)" },
  ];
}

function capasDeLista(lista: readonly string[] | null | undefined): CapaConcienciaId[] | null {
  if (!lista) return null;
  const set = new Set<CapaConcienciaId>();
  for (const c of lista) {
    const id = normalizarCapaConciencia(c);
    if (id) set.add(id);
  }
  return ORDEN_CONCIENCIA.filter((c) => set.has(c));
}

function masReciente(medios: readonly PresenciaMedio[]): PresenciaMedio | null {
  return medios.length ? medios.reduce((a, b) => (b.t > a.t ? b : a)) : null;
}

export function construirMarcas(e: EntradaMarcas): MarcaGeo[] {
  const porNeurona = new Map<string, PresenciaMedio[]>();
  for (const m of e.medios) porNeurona.set(m.n, [...(porNeurona.get(m.n) ?? []), m]);
  const marcas: MarcaGeo[] = [];
  const vistas = new Set<string>();

  const crear = (fila: DispositivoMallaRow | null): void => {
    const esYo = fila ? fila.esEsteDispositivo : true;
    const neuronaId = fila?.neuronId ?? e.yo.neuronaId ?? "yo";
    if (vistas.has(neuronaId)) return;
    vistas.add(neuronaId);
    const medios = porNeurona.get(neuronaId) ?? [];
    const ultimo = masReciente(medios);
    const nombre = (esYo ? e.yo.nombre : "") || fila?.nombre || "Neurona sin nombre";
    const plataforma = fila?.plataforma || (esYo ? e.yo.plataforma : undefined) || ultimo?.plataforma;

    let posicion: PosicionVista;
    if (esYo) {
      // El dueño ve su propio aparato con el punto exacto: nunca sale de aquí.
      const a = anuncioParaAmbito(e.yo.posicion, e.yo.pref, { tipo: "dueno" });
      posicion = posicionVistaDeAnuncio(a, MOTIVO_SIN_PERMISO);
    } else {
      posicion = posicionVistaDeAnuncio(leerAnuncio(ultimo?.g), ultimo ? MOTIVO_NO_COMPARTE : "esa neurona no está conectada ahora, no hay posición reciente");
    }

    const enlaceEstado: EstadoEnlace | "propio" = esYo ? "propio" : fila?.enlace.estado ?? "sin-vinculo";
    const lat = !esYo && fila?.enlace.estado === "conectado" && typeof fila.enlace.latenciaMs === "number" ? fila.enlace.latenciaMs : null;
    const calidad: CalidadMarca = lat !== null
      ? { valor: qualityFromRtt(lat), t: e.ahora, fuente: "latencia medida del canal P2P (RTT)" }
      : { valor: null, t: null, fuente: "latencia del canal P2P", nota: esYo ? "es este aparato: no hay enlace contra sí mismo" : "sin canal P2P abierto con esa neurona: no hay medida" };

    const senales = esYo ? e.yo.senales : ultimo?.s ?? null;
    const tSenales = esYo ? (e.yo.senales ? e.ahora : null) : ultimo?.t ?? null;
    const capasLista = esYo ? capasDeLista(e.yo.capas) : capasDeLista(ultimo?.c);
    const d = ultimo?.d;

    marcas.push({
      id: `neurona:${neuronaId}`,
      neuronaId,
      nombre,
      plataforma,
      esYo,
      forma: fila?.tipo === "server" ? "rombo" : "punto",
      estado: esYo ? "activa" : estadoAparato(medios, !!fila?.online),
      posicion,
      calidad,
      enlace: { estado: enlaceEstado, latenciaMs: lat, t: lat !== null ? e.ahora : null },
      antenas: antenasDeSenales(senales, tSenales),
      capas: {
        lista: capasLista,
        t: capasLista ? (esYo ? e.ahora : ultimo?.t ?? null) : null,
        fuente: esYo ? "capas de conciencia de este aparato" : "capas que esa neurona anuncia en la presencia de la cuenta",
      },
      aparato: d ? { so: d.so, soV: d.soV, equipo: d.equipo, arq: d.arq, medio: d.medio } : ultimo ? { medio: ultimo.tipo } : null,
      versionWeb: ultimo?.v?.interfaz,
    });
  };

  for (const f of e.filas) crear(f);
  if (!e.filas.some((f) => f.esEsteDispositivo)) crear(null);
  return marcas.sort((a, b) => Number(b.esYo) - Number(a.esYo) || a.nombre.localeCompare(b.nombre));
}

export type FiltroGeo = "esta" | "cuenta" | "grupos" | "publico";

export const FILTROS_GEO: readonly { id: FiltroGeo; etiqueta: string; fase: 1 | 2 }[] = [
  { id: "cuenta", etiqueta: "Mi cuenta", fase: 1 },
  { id: "esta", etiqueta: "Este aparato", fase: 1 },
  { id: "grupos", etiqueta: "Grupos", fase: 2 },
  { id: "publico", etiqueta: "Público", fase: 2 },
];

export function filtrarMarcas(marcas: readonly MarcaGeo[], f: FiltroGeo): MarcaGeo[] {
  if (f === "esta") return marcas.filter((m) => m.esYo);
  if (f === "cuenta") return [...marcas];
  return [];
}
