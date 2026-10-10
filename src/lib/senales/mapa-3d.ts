/**
 * mapa-3d — MODELO PURO del Mapa 3D de señales reales (fusión del Mapa 3D de
 * neuronas activas con el Radar de señales reales).
 * ============================================================================
 * El radar ya sabe colocar cada señal (rumbo, distancia, halo de precisión) y el
 * mapa 3D ya sabía pintar en perspectiva. Aquí está lo que ambos comparten, SIN
 * React, SIN three y SIN red, para que la misma lista de `DetectedSignal` se lea
 * igual en el radar plano y en el mapa en 3D, y para poder probarlo entero:
 *
 *   · Geometría: suelo = plano del radar (x = cos·r, z = sin·r; arriba del radar
 *     = −z = norte real cuando hay GPS). La ALTURA es un eje con significado
 *     elegible (calidad, frescura, saltos) y, si el dato no existe, la señal se
 *     queda en el suelo y se marca «sin medir»: nunca se inventa una altura.
 *   · Cada canal visual dice UNA cosa real: núcleo = calidad, contorno = antena,
 *     forma = familia de antena, halo = rango de precisión, punto blanco = cuenta
 *     StarSeed, pulso = oída hace menos de 30 s, línea = enlace medido.
 *   · Filtros, resumen y etiquetas visibles: todo función pura y determinista.
 *
 * Importado por el radar plano (constantes) y por el mapa 3D. Cliente sin node:*.
 */

import {
  ANTENNA_SECTOR,
  type AntennaKind,
  type DetectedSignal,
  type SignalKind,
} from "@/ai/astraura/mesh/signals";
import { COLOR_ESTADO } from "./aparatos";
import { avatarDeSenal, contarPorCuenta, cuentaDe } from "./cuentas";
import { enlaceDeSenal } from "./enlaces";
import { iconoDeSenal, type IconoId } from "./iconos";
import { formatoMetros } from "./escalas";
import type {
  Cuenta, EnlaceMapa, EstadoAparato, FiltroCuenta, MedioMapa, VivoMapa,
} from "./tipos-vivo";

/* ── Constantes compartidas con el radar plano ─────────────────────────────── */

const rad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * ROSA DE ANTENAS PROPIAS: eje (radianes; 0 = este, −π/2 = arriba) de cada
 * antena de ESTA neurona. Cada una se alinea con el sector de la familia a la
 * que pertenece, así el radar se lee como un mapa del espectro.
 */
export const KIND_ANGLE: Record<SignalKind, number> = {
  mesh: rad(-90),      // sector «lora»
  serial: rad(-45),    // sector «serial»
  bluetooth: rad(0),   // sector «ble»
  wifi: rad(33),       // sector «ip»
  cellular: rad(57),   // sector «ip»
  gps: rad(180),       // eje de posición (sin señales detectadas propias)
  nfc: rad(-147),      // eje de proximidad
  telephony: rad(-123),
};

export const KIND_COLOR: Record<SignalKind, string> = {
  mesh: "#34d399",
  wifi: "#38bdf8",
  cellular: "#a78bfa",
  bluetooth: "#60a5fa",
  gps: "#f59e0b",
  telephony: "#f472b6",
  nfc: "#22d3ee",
  serial: "#94a3b8",
};

/** Nombre en español de cada antena propia (para etiquetas y lectores de pantalla). */
export const KIND_ES: Record<SignalKind, string> = {
  mesh: "malla LoRa",
  wifi: "Wi-Fi",
  cellular: "datos móviles",
  bluetooth: "Bluetooth",
  gps: "GPS",
  telephony: "telefonía",
  nfc: "NFC",
  serial: "USB / serie",
};

/** Etiqueta corta del sector de cada familia (cabe en el borde del radar). */
export const SECTOR_CORTO: Record<AntennaKind, string> = {
  lora: "LoRa",
  serial: "USB",
  ble: "BLE",
  ip: "IP",
  relay: "relé",
  account: "cuenta",
};

export const FAMILIAS: readonly AntennaKind[] = ["lora", "relay", "account", "ip", "ble", "serial"];

/** Color del núcleo por CALIDAD (fuerte / media / débil / sin métrica). */
export function colorCalidad(q: number | null): string {
  if (q == null) return "#8b8b9e";
  if (q >= 0.62) return "#34d399";
  if (q >= 0.34) return "#fbbf24";
  return "#fb7185";
}

/** Etiqueta de la calidad en palabras (para la lista y los lectores de pantalla). */
export function textoCalidad(q: number | null): string {
  if (q == null) return "sin métrica";
  if (q >= 0.62) return "fuerte";
  if (q >= 0.34) return "media";
  return "débil";
}

/* ── Escena 3D ─────────────────────────────────────────────────────────────── */

/** Unidades de escena que mide el radio del radar (radiusFrac = 1). */
export const RADIO_ESCENA = 10;
/** Altura máxima de un marcador (calidad 100, recién oída, 4 saltos). */
export const ALTURA_MAX = 3.2;
/** Ventana de frescura del modo «Frescura»: más vieja que esto = suelo. */
export const VENTANA_FRESCURA_MS = 10 * 60_000;
/** Saltos de malla que llenan la escala del modo «Saltos». */
export const SALTOS_MAX = 4;
/** Una señal oída hace menos de esto late con un pulso (es «ahora mismo»). */
export const RECIENTE_MS = 30_000;

export type ModoAltura = "calidad" | "frescura" | "saltos" | "plano";

export interface InfoModoAltura {
  id: ModoAltura;
  etiqueta: string;
  ayuda: string;
}

export const MODOS_ALTURA: readonly InfoModoAltura[] = [
  {
    id: "calidad",
    etiqueta: "Calidad",
    ayuda: "Cuanto más alta, mejor calidad medida (0–100). Sin métrica de calidad se queda en el suelo.",
  },
  {
    id: "frescura",
    etiqueta: "Frescura",
    ayuda: "Cuanto más alta, más reciente su última escucha. A los 10 minutos sin oírla toca el suelo.",
  },
  {
    id: "saltos",
    etiqueta: "Saltos",
    ayuda: "Cada nivel es un salto de malla hasta ella. Solo los nodos LoRa informan de sus saltos.",
  },
  {
    id: "plano",
    etiqueta: "Plano",
    ayuda: "Todo en el suelo: lectura de radar, sin tercera dimensión.",
  },
];

export type FormaMarcador = "esfera" | "octaedro" | "icosaedro" | "cilindro" | "caja" | "cono";

/** Una forma por familia de antena: el color no es lo único que distingue. */
export const FORMA_POR_FAMILIA: Record<AntennaKind, FormaMarcador> = {
  lora: "esfera",
  relay: "octaedro",
  account: "icosaedro",
  ip: "cilindro",
  ble: "caja",
  serial: "cono",
};

export const NOMBRE_FORMA: Record<FormaMarcador, string> = {
  esfera: "esfera",
  octaedro: "diamante",
  icosaedro: "gema",
  cilindro: "disco",
  caja: "cubo",
  cono: "cono",
};

function acotar(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

function finito(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** ¿La colocación de la señal es utilizable? (nunca se pinta algo con NaN). */
export function esColocable(s: DetectedSignal): boolean {
  const p = s.placement;
  return !!p && finito(p.angleRad) && finito(p.radiusFrac) && finito(p.accuracyFrac);
}

/** Punto en el suelo: mismo rumbo y distancia que el radar (arriba = −z). */
export function posicionEnSuelo(s: DetectedSignal): { x: number; z: number } {
  const r = acotar(s.placement.radiusFrac, 0.1, 0.97) * RADIO_ESCENA;
  return { x: Math.cos(s.placement.angleRad) * r, z: Math.sin(s.placement.angleRad) * r };
}

/** Radio del halo de precisión en unidades de escena (mismo recorte que el radar). */
export function radioHalo(s: DetectedSignal): number {
  return acotar(s.placement.accuracyFrac, 0.027, 0.62) * RADIO_ESCENA;
}

/** Radio del marcador: crece con la calidad; sin métrica, el más pequeño. */
export function radioMarcador(q: number | null): number {
  return 0.2 + (q == null ? 0.05 : acotar(q, 0, 1) * 0.2);
}

/** Saltos de malla que la fuente informó (métrica «Saltos»), o null si no hay dato. */
export function saltosDe(s: DetectedSignal): number | null {
  const m = s.metrics.find((x) => x.label === "Saltos");
  if (!m) return null;
  const n = Number.parseInt(m.value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface Altura {
  y: number;
  /** false = la fuente no da el dato de este eje: se queda en el suelo y se dice. */
  medida: boolean;
}

export function alturaDe(s: DetectedSignal, modo: ModoAltura, ahora: number): Altura {
  switch (modo) {
    case "plano":
      return { y: 0, medida: true };
    case "calidad":
      return s.quality == null ? { y: 0, medida: false } : { y: acotar(s.quality, 0, 1) * ALTURA_MAX, medida: true };
    case "frescura": {
      if (s.lastHeard == null || !finito(s.lastHeard)) return { y: 0, medida: false };
      const f = 1 - Math.max(0, ahora - s.lastHeard) / VENTANA_FRESCURA_MS;
      return { y: acotar(f, 0, 1) * ALTURA_MAX, medida: true };
    }
    case "saltos": {
      const h = saltosDe(s);
      if (h == null) return { y: 0, medida: false };
      return { y: (Math.min(h, SALTOS_MAX) / SALTOS_MAX) * ALTURA_MAX, medida: true };
    }
    default:
      return { y: 0, medida: true };
  }
}

/** Explicación del eje vertical para el pie del mapa. */
export function leyendaAltura(modo: ModoAltura): string {
  return (MODOS_ALTURA.find((m) => m.id === modo) ?? MODOS_ALTURA[0]).ayuda;
}

export interface MarcadorEscena {
  id: string;
  senal: DetectedSignal;
  x: number;
  z: number;
  y: number;
  /** false = el eje de altura no tiene dato para esta señal. */
  alturaMedida: boolean;
  radioHalo: number;
  radio: number;
  colorNucleo: string;
  colorContorno: string;
  forma: FormaMarcador;
  /** Icono propio del TIPO de señal (nodo LoRa, móvil, tablet, relé…); sale de lo que la señal declara. */
  icono: IconoId;
  /**
   * Foto que lleva la marca: la de tu perfil en tus aparatos, o la que una cuenta ajena decidió mostrar en
   * el radar público. null = anónima o sin foto (nunca se rellena con una de adorno).
   */
  avatarUrl: string | null;
  /** Enlace real hasta ti (línea al centro): su clase fija el trazo. null = no es un camino hasta ti. */
  enlaceMapa: EnlaceMapa | null;
  /** Aparato de tu cuenta (`neuron:` / `local:`): lleva estado en vivo y medios. */
  esAparato: boolean;
  estado: EstadoAparato | null;
  /** Color del estado (activa, segundo plano, en línea, desconectada); null si no es un aparato. */
  colorEstado: string | null;
  /** Aparato desconectado: se dibuja tenue (sigue ahí, pero ya no responde). */
  tenue: boolean;
  /** Señales que ese aparato oye y comparte por la malla (0 = ninguna o sin dato). */
  oidas: number;
  cuenta: Cuenta;
  /** Oída hace menos de `RECIENTE_MS`: late con un pulso. */
  reciente: boolean;
  conCuenta: boolean;
  simulada: boolean;
}

export function construirMarcadores(
  senales: readonly DetectedSignal[],
  modo: ModoAltura,
  ahora: number,
  vivo: VivoMapa | null = null,
  avatarPropio: string | null = null,
): MarcadorEscena[] {
  const out: MarcadorEscena[] = [];
  for (const s of senales) {
    if (!esColocable(s)) continue;
    const { x, z } = posicionEnSuelo(s);
    const alt = alturaDe(s, modo, ahora);
    const estado = vivo?.estados.get(s.id) ?? null;
    out.push({
      id: s.id,
      senal: s,
      x,
      z,
      y: alt.y,
      alturaMedida: alt.medida,
      radioHalo: radioHalo(s),
      radio: radioMarcador(s.quality),
      colorNucleo: colorCalidad(s.quality),
      colorContorno: s.color,
      forma: FORMA_POR_FAMILIA[s.antenna] ?? "esfera",
      icono: iconoDeSenal(s),
      avatarUrl: avatarDeSenal(s, avatarPropio),
      enlaceMapa: enlaceDeSenal(s, vivo),
      esAparato: esAparato(s),
      estado,
      colorEstado: estado ? COLOR_ESTADO[estado] : null,
      tenue: estado === "desconectada",
      oidas: vivo?.oidas.get(s.id) ?? 0,
      cuenta: cuentaDe(s),
      reciente: finito(s.lastHeard) && ahora - s.lastHeard >= 0 && ahora - s.lastHeard < RECIENTE_MS,
      conCuenta: !!s.starseed,
      simulada: s.simulated,
    });
  }
  return out;
}

export function esAparato(s: DetectedSignal): boolean {
  return s.id.startsWith("neuron:") || s.id.startsWith("local:");
}

/* ── Medios abiertos: satélites de su aparato ──────────────────────────────── */

export interface MedioEscena {
  id: string;
  medio: MedioMapa;
  x: number;
  y: number;
  z: number;
  /** Posición del aparato al que orbita (para la línea fina que los une). */
  padre: { x: number; y: number; z: number };
  tenue: boolean;
}

/** Radio (unidades de escena) de la órbita de los medios alrededor de su aparato / de «Tú». */
export const ORBITA_MEDIO = 0.95;
export const ORBITA_MEDIO_YO = 1.7;

/**
 * Cada medio abierto se coloca en una órbita pequeña alrededor del aparato donde está abierto:
 * no tiene posición propia y el mapa no finge que la tiene. Los medios de aparatos que no se dibujan
 * (filtrados) no salen. Determinista: el orden sale de la presencia (ya ordenada por id).
 */
export function construirMedios(medios: readonly MedioMapa[], marcadores: readonly MarcadorEscena[]): MedioEscena[] {
  const porPadre = new Map<string, MedioMapa[]>();
  for (const m of medios) porPadre.set(m.padreId, [...(porPadre.get(m.padreId) ?? []), m]);
  const out: MedioEscena[] = [];
  for (const [padreId, lista] of porPadre) {
    const base = padreId === "yo"
      ? { x: 0, y: 0.2, z: 0, tenue: false }
      : (() => {
          const p = marcadores.find((m) => m.id === padreId);
          return p ? { x: p.x, y: p.y + p.radio + 0.05, z: p.z, tenue: p.tenue } : null;
        })();
    if (!base) continue;
    const r = padreId === "yo" ? ORBITA_MEDIO_YO : ORBITA_MEDIO;
    const n = lista.length;
    lista.forEach((medio, i) => {
      const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
      out.push({
        id: medio.id, medio,
        x: base.x + Math.cos(a) * r, y: base.y, z: base.z + Math.sin(a) * r,
        padre: { x: base.x, y: base.y, z: base.z }, tenue: base.tenue,
      });
    });
  }
  return out;
}

/* ── Sectores del suelo ────────────────────────────────────────────────────── */

/**
 * Parámetros de `ringGeometry` para la cuña de un sector, para un anillo girado
 * −90° sobre X (el que se tiende en el suelo). Esa rotación lleva el ángulo local
 * φ al mundo como (cos φ, 0, −sin φ); queremos (cos a, 0, sin a) ⇒ φ = −a.
 */
export function cunaDeSector(center: number, half: number): { thetaStart: number; thetaLength: number } {
  return { thetaStart: -(center + half), thetaLength: half * 2 };
}

export interface SectorEscena {
  familia: AntennaKind;
  etiqueta: string;
  /** Posición (x, z) de la etiqueta, junto al borde del radar. */
  x: number;
  z: number;
  thetaStart: number;
  thetaLength: number;
  /** ¿Tiene señales ahora? Las cuñas vacías se dibujan casi invisibles. */
  viva: boolean;
}

export function sectoresDelSuelo(senales: readonly DetectedSignal[]): SectorEscena[] {
  const vivas = new Set<AntennaKind>(senales.map((s) => s.antenna));
  return FAMILIAS.map((familia) => {
    const sec = ANTENNA_SECTOR[familia];
    const { thetaStart, thetaLength } = cunaDeSector(sec.center, sec.half);
    return {
      familia,
      etiqueta: SECTOR_CORTO[familia],
      x: Math.cos(sec.center) * (RADIO_ESCENA + 0.9),
      z: Math.sin(sec.center) * (RADIO_ESCENA + 0.9),
      thetaStart,
      thetaLength,
      viva: vivas.has(familia),
    };
  });
}

/** Radio de escena de un anillo de alcance en metros (misma escala log del radar). */
export function radioDeAnillo(fraccion: number): number {
  return fraccion * RADIO_ESCENA;
}

/* ── Antenas propias de esta neurona ───────────────────────────────────────── */

export interface AntenaPropia {
  kind: SignalKind;
  label: string;
  estado: "active" | "available" | "info";
  x: number;
  z: number;
  color: string;
  detail: string;
}

/** Radio (fracción del radar) de cada antena propia según su estado. */
const RADIO_ANTENA_PROPIA = { active: 0.3, available: 0.42, info: 0.52 } as const;

export const ESTADO_ANTENA_ES: Record<AntenaPropia["estado"], string> = {
  active: "en uso",
  available: "lista para usar",
  info: "solo informativa",
};

interface FuenteAntena {
  kind: SignalKind;
  label: string;
  status: string;
  detail: string;
}

/** Antenas propias que se dibujan (las que no tienen soporte no existen en el mapa). */
export function antenasPropias(fuentes: readonly FuenteAntena[]): AntenaPropia[] {
  const out: AntenaPropia[] = [];
  for (const f of fuentes) {
    if (f.status !== "active" && f.status !== "available" && f.status !== "info") continue;
    const ang = KIND_ANGLE[f.kind];
    if (ang === undefined) continue;
    const r = RADIO_ANTENA_PROPIA[f.status] * RADIO_ESCENA;
    out.push({
      kind: f.kind,
      label: f.label || KIND_ES[f.kind],
      estado: f.status,
      x: Math.cos(ang) * r,
      z: Math.sin(ang) * r,
      color: KIND_COLOR[f.kind],
      detail: f.detail,
    });
  }
  return out;
}

/* ── Filtros, resumen y etiquetas ──────────────────────────────────────────── */

export interface FiltrosMapa {
  /** Familias de antena ocultas. */
  ocultas: readonly AntennaKind[];
  /** De quién son las señales que se ven: todas, mi cuenta, otras cuentas o sin cuenta StarSeed. */
  cuenta: FiltroCuenta;
  /** Quita los aparatos de tu cuenta que ahora están desconectados. */
  ocultarDesconectados: boolean;
}

/** Aparato (de la cuenta o enlace directo) que ahora mismo está desconectado, según lo medido. */
function aparatoDesconectado(s: DetectedSignal, vivo: VivoMapa | null): boolean {
  if (!esAparato(s)) return false;
  const e = vivo?.estados.get(s.id);
  return e ? e === "desconectada" : s.starseed?.online === false;
}

export function filtrarSenales(
  senales: readonly DetectedSignal[],
  f: FiltrosMapa,
  vivo: VivoMapa | null = null,
): DetectedSignal[] {
  const ocultas = new Set(f.ocultas);
  return senales.filter(
    (s) =>
      !ocultas.has(s.antenna) &&
      (f.cuenta === "todas" || cuentaDe(s) === f.cuenta) &&
      !(f.ocultarDesconectados && aparatoDesconectado(s, vivo)),
  );
}

export interface ResumenMapa {
  total: number;
  /** Colocadas con posición GPS real de ambos extremos. */
  gps: number;
  /** Distancia por RF con rumbo desconocido. */
  rf: number;
  /** Sin posición: solo el sector de su antena. */
  sector: number;
  conCuenta: number;
  /** Con cuenta StarSeed y verificadas como TUYAS. */
  tuyas: number;
  compatibles: number;
  sinCalidad: number;
  simuladas: number;
  porFamilia: Record<AntennaKind, number>;
  /** Cuántas señales hay de cada clase de cuenta (mi cuenta, otras, sin cuenta StarSeed). */
  porCuenta: Record<FiltroCuenta, number>;
}

export function resumenMapa(senales: readonly DetectedSignal[]): ResumenMapa {
  const porFamilia: Record<AntennaKind, number> = { lora: 0, relay: 0, account: 0, ip: 0, ble: 0, serial: 0 };
  const r: ResumenMapa = {
    total: senales.length, gps: 0, rf: 0, sector: 0, conCuenta: 0, tuyas: 0,
    compatibles: 0, sinCalidad: 0, simuladas: 0, porFamilia, porCuenta: contarPorCuenta(senales),
  };
  for (const s of senales) {
    porFamilia[s.antenna] = (porFamilia[s.antenna] ?? 0) + 1;
    if (s.placement.mode === "gps") r.gps++;
    else if (s.placement.mode === "rf") r.rf++;
    else r.sector++;
    if (s.starseed) r.conCuenta++;
    if (s.starseed?.ownAccount) r.tuyas++;
    if (s.compatible) r.compatibles++;
    if (s.quality == null) r.sinCalidad++;
    if (s.simulated) r.simuladas++;
  }
  return r;
}

export interface ResumenVivo {
  /** Aparatos de tu cuenta dibujados (registro + enlaces directos). */
  aparatos: number;
  porEstado: Record<EstadoAparato, number>;
  /** Aparatos con un camino medido hasta ti (canal P2P o enlace directo; no cuenta el relé). */
  conCanal: number;
  /** Medios abiertos (de los demás aparatos y de este). */
  medios: number;
  /** Señales que los demás aparatos oyen y comparten. */
  oidas: number;
}

export function resumenVivo(senales: readonly DetectedSignal[], vivo: VivoMapa | null): ResumenVivo {
  const r: ResumenVivo = {
    aparatos: 0, porEstado: { activa: 0, "segundo-plano": 0, "en-linea": 0, desconectada: 0 },
    conCanal: 0, medios: vivo?.medios.length ?? 0, oidas: 0,
  };
  for (const s of senales) {
    if (s.id.startsWith("remoto:")) r.oidas++;
    if (!esAparato(s)) continue;
    r.aparatos++;
    const e = vivo?.estados.get(s.id);
    if (e) r.porEstado[e]++;
    const c = vivo?.enlaces.get(s.id)?.clase;
    if (c && (c.startsWith("p2p") || c === "directo-sin-internet")) r.conCanal++;
  }
  return r;
}

export type ModoEtiquetas = "todas" | "seleccion";

/**
 * Ids que llevan etiqueta flotante. Siempre la seleccionada y la apuntada; en
 * modo «todas», además las `max` primeras en el orden recibido (el hook ya las
 * ordena por calidad). Acotado a propósito: cada etiqueta es un nodo del DOM.
 */
export function idsConEtiqueta(
  marcadores: readonly { id: string }[],
  opts: { modo: ModoEtiquetas; seleccionId: string | null; apuntadaId: string | null; max?: number },
): Set<string> {
  const ids = new Set<string>();
  if (opts.seleccionId) ids.add(opts.seleccionId);
  if (opts.apuntadaId) ids.add(opts.apuntadaId);
  if (opts.modo === "todas") {
    const max = opts.max ?? 10;
    let extra = 0;
    for (const m of marcadores) {
      if (extra >= max) break;
      if (ids.has(m.id)) continue;
      ids.add(m.id);
      extra++;
    }
  }
  return ids;
}

/* ── Textos ────────────────────────────────────────────────────────────────── */

export function textoDistancia(m: number | null): string {
  return m == null ? "sin distancia" : formatoMetros(m);
}

export const ETIQUETA_MODO_POSICION: Record<DetectedSignal["placement"]["mode"], string> = {
  gps: "GPS",
  rf: "est. RF",
  sector: "sin posición",
};

/** Línea corta de una señal para su etiqueta flotante y su fila de lista. */
export function lineaResumen(s: DetectedSignal): string {
  const q = s.quality == null ? "sin métrica" : `${Math.round(s.quality * 100)}/100`;
  const d = s.placement.distanceM;
  const dist = d == null ? "sin distancia" : s.placement.mode === "rf" ? `≈${formatoMetros(d)}` : formatoMetros(d);
  return `${q} · ${dist} (${ETIQUETA_MODO_POSICION[s.placement.mode]})`;
}

/** Frase para lectores de pantalla: qué contiene el mapa ahora mismo. */
export function descripcionAccesible(r: ResumenMapa, modo: ModoAltura, v?: ResumenVivo): string {
  if (r.total === 0) return "Mapa 3D de señales: ninguna señal detectada todavía.";
  const alt = MODOS_ALTURA.find((m) => m.id === modo)?.etiqueta.toLowerCase() ?? modo;
  const aparatos = v && v.aparatos > 0
    ? ` ${v.aparatos} ${v.aparatos === 1 ? "aparato" : "aparatos"} de tu cuenta, ${v.porEstado.activa} activos ahora y ${v.conCanal} con enlace medido.`
    : "";
  return `Mapa 3D de señales: ${r.total} señales, ${r.gps} con posición GPS real, ${r.rf} con distancia estimada por radiofrecuencia y ${r.sector} sin posición.${aparatos} La altura muestra la ${alt}.`;
}

/* ── Cámara ────────────────────────────────────────────────────────────────── */

export const FOV_VERTICAL = 45;
type Vec3 = [number, number, number];

/**
 * Posición y objetivo de la cámara para ver el disco ENTERO según la forma del
 * lienzo. En horizontal basta una vista inclinada cercana; en un móvil vertical
 * la cámara se eleva (el disco se ve más redondo y llena el lienzo) y se aleja lo
 * justo para que quepa a lo ancho. Puro: sin three, para poder probarlo.
 */
export function encuadreCamara(
  ancho: number,
  alto: number,
  vista: "inclinada" | "cenital",
): { posicion: Vec3; objetivo: Vec3 } {
  const aspecto = ancho > 0 && alto > 0 ? ancho / alto : 1.6;
  const tanH = Math.tan((FOV_VERTICAL / 2) * (Math.PI / 180)) * aspecto;
  if (vista === "cenital") {
    return { posicion: [0, Math.max(27.5, 12.8 / tanH), 0.01], objetivo: [0, 0, 0] };
  }
  const t = Math.min(1, Math.max(0, (1.45 - aspecto) / (1.45 - 0.9)));
  const elevacion = (36 + 22 * t) * (Math.PI / 180);
  const d = Math.max(22.5, 12.4 / tanH);
  return {
    posicion: [0, d * Math.sin(elevacion), d * Math.cos(elevacion)],
    objetivo: [0, 0, 1.4 * (1 - t)],
  };
}
