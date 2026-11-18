/**
 * marcas — de las neuronas de mi cuenta a las marcas del Mapa (MAP1114C).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Punto = neurona móvil · rombo = nodo fijo (servidor). Anillo = calidad medida del enlace.
 * Cada valor lleva su fuente y la hora de su medida; lo que no se sabe es `null` y la vista dice
 * «desconocido»: nunca un número bonito ni una posición inventada.
 *
 * La posición de una neurona AJENA a este aparato solo llega por el anuncio que ella misma emitió en la
 * presencia de la cuenta (`g`, exacto); si no lo emitió, la marca queda «desconocida» con su motivo.
 * Este aparato se ve a sí mismo en el punto que midió, con la hora de la medida.
 * Puro: sin React, sin red, sin `node:*`.
 */

import { qualityFromRtt, type AntennaKind } from "@/ai/astraura/mesh/signals";
import { estadoAparato } from "@/lib/senales/aparatos";
import type { EstadoAparato } from "@/lib/senales/tipos-vivo";
import type { DispositivoMallaRow, EstadoEnlace, FichaDispositivo } from "@/lib/network/malla-neuronas";
import type { PresenciaMedio } from "@/lib/neurons/presencia";
import type { SenalesMedio } from "@/lib/neurons/senales-medio";
import type { SenalEspectro } from "@/lib/senales/espectro/tipos";
import { normalizarCapaConciencia, ORDEN_CONCIENCIA, type CapaConcienciaId } from "./capas";
import {
  MOTIVO_CANAL_SIN_UNIR, posicionVistaDeAnuncio, anuncioDesdeCruda,
  type AnuncioPosicion, type PosicionCruda, type PosicionVista,
} from "./modelo-geo";
import { calidadDeEnlace, textoEnlace, type EnlaceMedido } from "./enlaces-medidos";

export type KindAntenaMarca = AntennaKind | "wifi";

export interface AntenaMarca {
  kind: KindAntenaMarca;
  etiqueta: string;
  /** Texto ya legible; «desconocido» si no se midió. */
  valor: string;
  medida: boolean;
  /** Calidad 0..1 solo si hay una medida real de calidad de ese medio; si no, null. */
  calidad: number | null;
  /** Hora de la medida (epoch ms); null si no se midió. */
  t: number | null;
  fuente: string;
  /** Por qué no hay calidad (cuando `calidad` es null). */
  nota?: string;
  /** ¿La radio de este medio está encendida según lo que la app puede leer? null = no se sabe. (MAP1114D) */
  encendida?: boolean | null;
}

export interface CalidadMarca {
  /** 0..1, o null = sin medir. */
  valor: number | null;
  t: number | null;
  fuente: string;
  nota?: string;
}

/** Lo que la neurona anuncia de sí misma por su ficha P2P (`malla-neuronas`) — con la hora de la ficha. */
export interface HardwareMarca {
  ramClase: FichaDispositivo["ramClase"] | null;
  backendLocal: boolean | null;
  sirveAstraura: boolean | null;
  fuentesServibles: number | null;
  t: number | null;
  fuente: string;
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
  /** Calidad del enlace P2P medido DESDE ESTE aparato hacia esa neurona (RTT). */
  calidad: CalidadMarca;
  enlace: { estado: EstadoEnlace | "propio"; latenciaMs: number | null; t: number | null };
  antenas: AntenaMarca[];
  capas: { lista: CapaConcienciaId[] | null; t: number | null; fuente: string };
  hardware: HardwareMarca;
  /** Versión y aparato que la neurona anuncia de sí misma (declarado). */
  aparato: { so?: string; soV?: string; equipo?: string; arq?: string; medio?: string } | null;
  versionWeb?: string;
  versionNativa?: string;
  /** (AQ07) Oferta de recursos que esta neurona anuncia: cómputo, almacenamiento, internet compartido. */
  oferta?: { compute: boolean; storage: boolean; internet: boolean; t: number };
  /** (AUD1117) Señales publicadas de la red vinculadas a ESTA neurona (por `vinculo` de tipo «neurona»),
   * para las capas `red-*` (`capas.ts`); sin filas ligadas, no está el campo. */
  publicadas?: readonly SenalEspectro[];
}

export interface EntradaYoGeo {
  neuronaId: string | null;
  nombre: string;
  plataforma?: string;
  senales: SenalesMedio | null;
  /** Lo que `misCapasAnunciadas()` devuelve (`capa:local`…), o null si no se pudo leer. */
  capas: readonly string[] | null;
  posicion: PosicionCruda | null;
  /** Ficha de ESTE aparato (`construirFicha`), si se pudo construir. */
  ficha?: FichaDispositivo | null;
}

export interface EntradaMarcas {
  filas: readonly DispositivoMallaRow[];
  medios: readonly PresenciaMedio[];
  yo: EntradaYoGeo;
  ahora: number;
  /** (MAP1114D) Posiciones llegadas por el canal PRIVADO de posición, por neurona. */
  posiciones?: Readonly<Record<string, AnuncioPosicion>>;
  /** (MAP1114D) Estado de la unión al canal privado: lo que se dice de las neuronas sin posición. */
  canal?: { unido: boolean; motivo: string | null };
  /** (MAP1114D) Enlaces con medida real entre este aparato y las demás neuronas. */
  enlaces?: readonly EnlaceMedido[];
  /** (AUD1117) Señales publicadas leídas del espectrómetro (`useSenalesPublicadas`): se reparten
   * entre las marcas según el vínculo de neurona de cada señal. */
  publicadas?: readonly SenalEspectro[];
}

const MOTIVO_SIN_PERMISO = "este aparato aún no conoce su ubicación (no se dio permiso o no hay GPS)";
const MOTIVO_NO_CONECTADA = "esa neurona no está conectada ahora y no dejó una posición";
const SIN_MEDIDA = "sin medida de este medio";

/** Calidad 0..1 de la bajada estimada por el navegador (misma escala que el radar: 20 Mb/s = 1). */
export function calidadInternet(s: SenalesMedio | null | undefined): number | null {
  if (!s) return null;
  if (!s.internet.enLinea) return 0;
  return typeof s.internet.mbps === "number" && s.internet.mbps > 0 ? Math.max(0, Math.min(1, s.internet.mbps / 20)) : null;
}

export function antenasDeSenales(s: SenalesMedio | null | undefined, t: number | null, rtt: number | null = null, enlaces: readonly EnlaceMedido[] = []): AntenaMarca[] {
  const desconocida = (kind: KindAntenaMarca, etiqueta: string, fuente: string): AntenaMarca => ({ kind, etiqueta, valor: "desconocido", medida: false, calidad: null, t: null, fuente });
  if (!s || t === null) {
    return [
      desconocida("ip", "Internet", SIN_MEDIDA),
      desconocida("wifi", "Wi-Fi", SIN_MEDIDA),
      desconocida("account", "Red local / malla", SIN_MEDIDA),
      desconocida("ble", "Bluetooth", SIN_MEDIDA),
      desconocida("lora", "LoRa", SIN_MEDIDA),
      desconocida("serial", "Serie / USB", SIN_MEDIDA),
    ];
  }
  const internet = s.internet.enLinea
    ? ["en línea", s.internet.tipo, s.internet.efectivo, typeof s.internet.mbps === "number" ? `≈${s.internet.mbps} Mb/s` : null].filter(Boolean).join(" · ")
    : "sin conexión";
  const malla = `${s.malla.pares} ${s.malla.pares === 1 ? "par" : "pares"}${s.malla.sinInternet ? ` · ${s.malla.sinInternet} sin internet` : ""}`;
  const lora = s.lora.estado === "sin-radio" ? "sin radio" : `${s.lora.estado} · ${s.lora.nodos} ${s.lora.nodos === 1 ? "nodo" : "nodos"}`;
  const bt = s.bluetooth.disponible === null ? null : s.bluetooth.disponible ? "adaptador disponible" : "sin adaptador";
  const wifi = s.internet.tipo === "wifi";
  const qInternet = calidadInternet(s);
  const qLocal = rtt !== null ? qualityFromRtt(rtt) : null;
  // (MAP1114D) Medida real de los enlaces directos hacia esta neurona: Bluetooth y Wi-Fi dejan de ser «sin fuente».
  const masMedido = (medio: EnlaceMedido["medio"]) => enlaces.filter((e) => e.medio === medio && calidadDeEnlace(e) !== null).sort((a, b) => b.t - a.t)[0];
  const eBle = masMedido("ble");
  const eWifi = masMedido("wifi");
  const medidaBle = eBle ? { calidad: calidadDeEnlace(eBle), t: eBle.t, texto: textoEnlace(eBle) } : null;
  const medidaWifi = eWifi ? { calidad: calidadDeEnlace(eWifi), t: eWifi.t, texto: textoEnlace(eWifi) } : null;
  return [
    { kind: "ip", etiqueta: "Internet", valor: internet, medida: true, calidad: qInternet, t, fuente: "API de red del navegador (navigator.onLine / connection)", ...(qInternet === null ? { nota: "el navegador no dio velocidad de bajada" } : {}) },
    medidaWifi
      ? { kind: "wifi", etiqueta: "Wi-Fi", valor: `${wifi ? "conectado por Wi-Fi · " : ""}enlace directo ${medidaWifi.texto}`, medida: true, calidad: medidaWifi.calidad, t: medidaWifi.t, fuente: "enlace de red local abierto con este aparato (ida y vuelta y capacidad medidas)", encendida: wifi ? true : null }
      : wifi
      ? { kind: "wifi", etiqueta: "Wi-Fi", valor: "conectado por Wi-Fi", medida: true, calidad: null, t, fuente: "tipo de conexión que informa el sistema", nota: "el nivel de la señal Wi-Fi no se puede medir desde la app", encendida: true }
      : { ...desconocida("wifi", "Wi-Fi", "el sistema no dice si la conexión es Wi-Fi"), encendida: null },
    { kind: "account", etiqueta: "Red local / malla", valor: malla + (rtt !== null ? ` · enlace con este aparato ${Math.round(rtt)} ms` : ""), medida: true, calidad: qLocal, t, fuente: "pares WebRTC abiertos ahora; latencia medida desde este aparato", ...(qLocal === null ? { nota: "sin canal P2P abierto con este aparato: no hay latencia" } : {}) },
    medidaBle
      ? { kind: "ble", etiqueta: "Bluetooth", valor: `${bt ? bt + " · " : ""}enlace directo ${medidaBle.texto}`, medida: true, calidad: medidaBle.calidad, t: medidaBle.t, fuente: "enlace Bluetooth abierto con este aparato (ida y vuelta y capacidad medidas)", encendida: s.bluetooth.disponible === true ? true : null }
      : bt === null
      ? { ...desconocida("ble", "Bluetooth", "este medio no puede consultarlo"), encendida: null }
      : { kind: "ble", etiqueta: "Bluetooth", valor: bt, medida: true, calidad: null, t, fuente: "Web Bluetooth (getAvailability)", nota: "solo se sabe si hay adaptador; sin enlace directo abierto no hay calidad medida", encendida: s.bluetooth.disponible === true },
    { kind: "lora", etiqueta: "LoRa", valor: lora, medida: true, calidad: null, t, fuente: "radio Meshtastic de ese medio", encendida: s.lora.estado !== "sin-radio" },
    { kind: "serial", etiqueta: "Serie / USB", valor: s.serie.disponible ? `${s.serie.puertos} ${s.serie.puertos === 1 ? "puerto" : "puertos"} autorizados` : "no disponible en este medio", medida: true, calidad: null, t, fuente: "Web Serial (getPorts)" },
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

function hardwareDeFicha(f: FichaDispositivo | null | undefined, fuente: string): HardwareMarca {
  if (!f) return { ramClase: null, backendLocal: null, sirveAstraura: null, fuentesServibles: null, t: null, fuente: "sin ficha: no hay canal P2P abierto con esa neurona" };
  return {
    ramClase: f.ramClase ?? null,
    backendLocal: typeof f.backendLocal === "boolean" ? f.backendLocal : null,
    sirveAstraura: typeof f.sirveAstraura === "boolean" ? f.sirveAstraura : null,
    fuentesServibles: Array.isArray(f.fuentesServibles) ? f.fuentesServibles.length : null,
    t: typeof f.at === "number" ? f.at : null,
    fuente,
  };
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

    const anunciada = e.posiciones?.[neuronaId] ?? null;
    const motivoAjena = e.canal && !e.canal.unido
      ? `${MOTIVO_CANAL_SIN_UNIR}${e.canal.motivo ? `: ${e.canal.motivo}` : ""}`
      : ultimo || fila?.online ? "esa neurona no anuncia su posición por el canal privado de tu cuenta" : MOTIVO_NO_CONECTADA;
    const posicion: PosicionVista = esYo
      ? posicionVistaDeAnuncio(anuncioDesdeCruda(e.yo.posicion), MOTIVO_SIN_PERMISO)
      : posicionVistaDeAnuncio(anunciada, motivoAjena);

    const enlaceEstado: EstadoEnlace | "propio" = esYo ? "propio" : fila?.enlace.estado ?? "sin-vinculo";
    const lat = !esYo && fila?.enlace.estado === "conectado" && typeof fila.enlace.latenciaMs === "number" ? fila.enlace.latenciaMs : null;
    const calidad: CalidadMarca = lat !== null
      ? { valor: qualityFromRtt(lat), t: e.ahora, fuente: "latencia medida del canal P2P (RTT)" }
      : { valor: null, t: null, fuente: "latencia del canal P2P", nota: esYo ? "es este aparato: no hay enlace contra sí mismo" : "sin canal P2P abierto con esa neurona: no hay medida" };

    const senales = esYo ? e.yo.senales : ultimo?.s ?? null;
    const tSenales = esYo ? (e.yo.senales ? e.ahora : null) : ultimo?.t ?? null;
    const capasLista = esYo ? capasDeLista(e.yo.capas) : capasDeLista(ultimo?.c);
    const d = ultimo?.d;
    const ficha = esYo ? e.yo.ficha : fila?.ficha;
    // (AQ07) Oferta de recursos anunciada por la neurona (de su medio más reciente).
    const ofertaAnunciada = ultimo?.o;
    const oferta = ofertaAnunciada ? { compute: ofertaAnunciada.compute, storage: ofertaAnunciada.storage, internet: ofertaAnunciada.internet, t: ultimo.t } : undefined;
    // (AUD1117) Las señales publicadas solo se cuelgan de la neurona a la que su vínculo señala.
    const publicadas = (e.publicadas ?? []).filter((s) => s.vinculo?.tipo === "neurona" && s.vinculo.id === neuronaId);

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
      antenas: antenasDeSenales(senales, tSenales, lat, esYo ? [] : (e.enlaces ?? []).filter((x) => x.neurona === neuronaId)),
      capas: {
        lista: capasLista,
        t: capasLista ? (esYo ? e.ahora : ultimo?.t ?? null) : null,
        fuente: esYo ? "capas de conciencia de este aparato" : "capas que esa neurona anuncia en la presencia de la cuenta",
      },
      hardware: hardwareDeFicha(ficha, esYo ? "ficha de este aparato" : "ficha que esa neurona mandó por su canal P2P"),
      aparato: d ? { so: d.so, soV: d.soV, equipo: d.equipo, arq: d.arq, medio: d.medio } : ultimo ? { medio: ultimo.tipo } : null,
      versionWeb: ultimo?.v?.interfaz,
      versionNativa: ultimo?.v?.nativa,
      ...(oferta ? { oferta } : {}),
      ...(publicadas.length ? { publicadas } : {}),
    });
  };

  for (const f of e.filas) crear(f);
  if (!e.filas.some((f) => f.esEsteDispositivo)) crear(null);
  return marcas.sort((a, b) => Number(b.esYo) - Number(a.esYo) || a.nombre.localeCompare(b.nombre));
}
