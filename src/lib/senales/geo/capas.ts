/**
 * capas — las capas de color del Mapa de Señales, su escala y su leyenda (MAP1114C).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Como el radar de lluvia del mapa del Hub: un parche de color, una leyenda, un deslizador de opacidad y un
 * interruptor. La leyenda y el pintado salen de la MISMA tabla (`CAPAS_SENALES`): no pueden discrepar.
 *
 * «Basta de ilusiones»: cada capa declara de dónde sale su dato (`estado`/`fuente`). Una capa sin fuente en el
 * código de hoy lo dice y pinta TODO como «sin medir» (gris, hueco): nunca un número inventado. Un parche
 * marca DÓNDE se midió el valor (el punto exacto de la neurona); su tamaño en pantalla es fijo y NO es un
 * alcance de cobertura (no lo tenemos medido).
 * Puro: sin React, sin red, sin `node:*`.
 */

import { qualityFromRtt } from "@/ai/astraura/mesh/signals";
import type { FamiliaChip } from "@/lib/astraura/modelos/tipos";
import type { MarcaGeo } from "./marcas";
import { ALCANCES, MEDIOS_ALCANCE, ROTULO_ALCANCE, type MedioAlcance } from "./alcances";
import type { CapaRed, OrigenDato } from "../espectro/tipos";
import type { EstadoLectura } from "../espectro/leer-senales";

export type CapaConcienciaId = "local" | "mesh" | "nube" | "colectiva";

export const ETIQUETA_CONCIENCIA: Record<CapaConcienciaId, string> = {
  local: "Local",
  mesh: "Malla",
  nube: "Nube",
  colectiva: "Colectiva",
};

export const ORDEN_CONCIENCIA: readonly CapaConcienciaId[] = ["local", "mesh", "nube", "colectiva"];

export function normalizarCapaConciencia(c: string): CapaConcienciaId | null {
  const id = c.startsWith("capa:") ? c.slice(5) : c;
  return id === "local" || id === "mesh" || id === "nube" || id === "colectiva" ? id : null;
}

export const COLOR_DESCONOCIDO = "#94a3b8";

/**
 * relleno = parche de color (medido) · hueco = sin dato (gris, anillo discontinuo) · anillo = valor conocido «no»
 * (anillo fino) · rayado = campo de alcance ESTIMADO (claro y rayado: nunca se confunde con lo medido).
 */
export type EstiloTramo = "relleno" | "hueco" | "anillo" | "rayado";

export interface Tramo {
  id: string;
  etiqueta: string;
  color: string;
  estilo: EstiloTramo;
}

export type GrupoCapa = "cobertura" | "medido" | "senal" | "oferta" | "conciencia" | "hardware" | "red";

export const GRUPOS_CAPA: readonly { id: GrupoCapa; titulo: string }[] = [
  { id: "cobertura", titulo: "Cobertura (alcance estimado)" },
  { id: "medido", titulo: "Enlaces medidos" },
  { id: "senal", titulo: "Señal medida por medio" },
  { id: "oferta", titulo: "Capacidades que ofrece" },
  { id: "conciencia", titulo: "Capas de conciencia" },
  { id: "hardware", titulo: "Hardware" },
  { id: "red", titulo: "Red completa (lo que cada dueño publica)" },
];

/**
 * real = hay dato medido hoy · parcial = solo para parte de las neuronas · sin-fuente = hoy nada lo mide ni lo anuncia ·
 * estimado = no es una medida: es una cifra típica de referencia (alcance).
 */
export type EstadoFuente = "real" | "parcial" | "sin-fuente" | "estimado";

/** parche = punto medido · alcance = campo estimado de un medio · enlaces = líneas medidas entre neuronas. */
export type TipoCapa = "parche" | "alcance" | "enlaces";

/** Lo que una capa dice de UNA marca. `tramo` apunta a `Tramo.id`. */
export interface ValorCapa {
  tramo: string;
  /** Texto legible del valor («≈12 Mb/s», «sí», «desconocido»). */
  texto: string;
  /** Hora de la medida (epoch ms) o null. */
  t: number | null;
  medida: boolean;
}

export interface CapaSenal {
  id: string;
  grupo: GrupoCapa;
  etiqueta: string;
  descripcion: string;
  estado: EstadoFuente;
  /** De dónde sale el dato en el código de hoy (o por qué no hay). */
  fuente: string;
  tramos: readonly Tramo[];
  valor: (m: MarcaGeo) => ValorCapa;
  /** Cómo se pinta; por defecto un parche. */
  tipo?: TipoCapa;
  /** Solo en capas de alcance: el medio. */
  medio?: MedioAlcance;
}

const DESC: Tramo = { id: "desconocido", etiqueta: "Sin medir", color: COLOR_DESCONOCIDO, estilo: "hueco" };
const desconocido = (texto = "desconocido"): ValorCapa => ({ tramo: "desconocido", texto, t: null, medida: false });

export const TRAMOS_CALIDAD: readonly Tramo[] = [
  { id: "mala", etiqueta: "Mala", color: "#ef4444", estilo: "relleno" },
  { id: "regular", etiqueta: "Regular", color: "#facc15", estilo: "relleno" },
  { id: "buena", etiqueta: "Buena", color: "#22c55e", estilo: "relleno" },
  DESC,
];

export function tramoDeCalidad(q: number | null | undefined): string {
  if (typeof q !== "number" || !Number.isFinite(q)) return "desconocido";
  return q < 0.34 ? "mala" : q < 0.67 ? "regular" : "buena";
}

const SIN_OFERTA = "El ofrecimiento de recursos (Prestar recursos, Puerta de internet) es un ajuste local de cada aparato y todavía no se anuncia a la cuenta.";

/** Genera las tres capas de oferta (cómputo, almacenamiento, internet) que leen de la presencia. */
function capasOferta(): readonly CapaSenal[] {
  const capas: CapaSenal[] = [];
  for (const k of ["computo", "almacenamiento", "internet"] as const) {
    const key = k === "computo" ? "computo" : k === "almacenamiento" ? "almacenamiento" : "internet";
    const color = k === "computo" ? "#6366f1" : k === "almacenamiento" ? "#22c55e" : "#0ea5e9";
    const etiqueta = k === "computo" ? "Cómputo" : k === "almacenamiento" ? "Almacenamiento" : "Internet compartido";
    const descripcion = k === "computo" ? "Aparatos que ofrecen cómputo" : k === "almacenamiento" ? "Aparatos que ofrecen almacenamiento" : "Aparatos que comparten su internet";
    capas.push({
      id: `oferta-${k}`, grupo: "oferta",
      etiqueta,
      descripcion,
      estado: "parcial",
      fuente: `Presencia de la cuenta: cada neurona anuncia si ofrece ${k} en sus ajustes (offerCompute, offerStorage, offerPublicInternet); solo las que tienen medio abierto en la presencia.`,
      tramos: [
        { id: "si", etiqueta: "Ofrece", color, estilo: "relleno" },
        { id: "no", etiqueta: "No ofrece", color: "#94a3b8", estilo: "anillo" },
        DESC,
      ],
      valor: (m) => {
        const of = m.oferta;
        if (!of) return desconocido("sin anuncio de oferta");
        const activo = of[key];
        return { tramo: activo ? "si" : "no", texto: activo ? "ofrece" : "no ofrece", t: null, medida: true };
      },
    });
  }
  return capas;
}

function antena(m: MarcaGeo, kind: string) {
  return m.antenas.find((a) => a.kind === kind);
}

/** Valor de una capa de calidad por medio: coloreado solo si esa antena trae una calidad REALMENTE medida. */
function valorDeAntena(m: MarcaGeo, kind: string, sinCalidad: string): ValorCapa {
  const a = antena(m, kind);
  if (!a?.medida) return desconocido();
  if (a.calidad === null) return { tramo: "desconocido", texto: `${a.valor}; ${sinCalidad}`, t: a.t, medida: false };
  return { tramo: tramoDeCalidad(a.calidad), texto: a.valor, t: a.t, medida: true };
}

const COLOR_CAMPO: Record<MedioAlcance, string> = Object.fromEntries(MEDIOS_ALCANCE.map((k) => [k, ALCANCES[k].color])) as Record<MedioAlcance, string>;

function capaAlcance(medio: MedioAlcance): CapaSenal {
  const a = ALCANCES[medio];
  const km = a.metros >= 1000 ? `${a.metros / 1000} km` : `${a.metros} m`;
  return {
    id: `cobertura-${medio}`, grupo: "cobertura", tipo: "alcance", medio,
    etiqueta: a.etiqueta,
    descripcion: `Alcance estimado de ${a.etiqueta} (≈${km}) alrededor de cada neurona con esa radio encendida`,
    estado: "estimado",
    fuente: `Alcance estimado ≈${km} (no medido). ${a.fuente} Radio encendida: ${a.encendida}.`,
    tramos: [
      { id: "estimado", etiqueta: `${ROTULO_ALCANCE[0].toUpperCase()}${ROTULO_ALCANCE.slice(1)} ≈${km}`, color: COLOR_CAMPO[medio], estilo: "rayado" },
      { ...DESC, etiqueta: "Radio apagada o desconocida" },
    ],
    valor: (m) => {
      const an = m.antenas.find((x) => x.kind === (medio === "ble" ? "ble" : medio));
      if (an?.encendida === true) return { tramo: "estimado", texto: `${ROTULO_ALCANCE} ≈${km}`, t: null, medida: false };
      return desconocido(an?.encendida === false ? "radio apagada o sin adaptador" : "desconocido");
    },
  };
}

const COLOR_CAPA_CONCIENCIA: Record<CapaConcienciaId, string> = { local: "#10b981", mesh: "#0ea5e9", nube: "#a855f7", colectiva: "#ec4899" };

function capaConciencia(id: CapaConcienciaId): CapaSenal {
  const color = COLOR_CAPA_CONCIENCIA[id];
  return {
    id: `conciencia-${id}`,
    grupo: "conciencia",
    etiqueta: `Capa ${ETIQUETA_CONCIENCIA[id].toLowerCase()}`,
    descripcion: `Neuronas que tienen encendida la capa de conciencia «${ETIQUETA_CONCIENCIA[id]}»`,
    estado: "real",
    fuente: "capas que cada neurona anuncia en la presencia de la cuenta (`c`); la de este aparato, de sus propios ajustes",
    tramos: [
      { id: "si", etiqueta: "Encendida", color, estilo: "relleno" },
      { id: "no", etiqueta: "Apagada", color: "#94a3b8", estilo: "anillo" },
      { ...DESC, etiqueta: "Sin anunciar" },
    ],
    valor: (m) => {
      if (!m.capas.lista) return desconocido();
      const on = m.capas.lista.includes(id);
      return { tramo: on ? "si" : "no", texto: on ? "encendida" : "apagada", t: m.capas.t, medida: true };
    },
  };
}

export const CLASES_RAM = ["≤4 GB", "8 GB", "16 GB", ">16 GB"] as const;
const COLOR_RAM: Record<string, string> = { "≤4 GB": "#38bdf8", "8 GB": "#6366f1", "16 GB": "#a855f7", ">16 GB": "#ec4899" };

export const CLASES_ALMACENAMIENTO = ["≤1 GB", "≤10 GB", "≤50 GB", ">50 GB"] as const;
export type ClaseAlmacenamiento = (typeof CLASES_ALMACENAMIENTO)[number];
const COLOR_ALMACENAMIENTO: Record<ClaseAlmacenamiento, string> = {
  "≤1 GB": "#ef4444",
  "≤10 GB": "#f59e0b",
  "≤50 GB": "#22c55e",
  ">50 GB": "#0ea5e9",
};

/** Banda legible del espacio libre; un cero medido cae en «≤1 GB», nunca se confunde con «sin dato». */
export function claseAlmacenamiento(gb: number): ClaseAlmacenamiento {
  if (gb <= 1) return "≤1 GB";
  if (gb <= 10) return "≤10 GB";
  if (gb <= 50) return "≤50 GB";
  return ">50 GB";
}

export const ETIQUETA_CHIP: Record<FamiliaChip, string> = {
  "apple-silicon": "Apple Silicon",
  nvidia: "NVIDIA",
  amd: "AMD",
  cpu: "CPU",
  "android-soc": "SoC Android",
};

const CHIPS_HARDWARE: readonly FamiliaChip[] = ["apple-silicon", "nvidia", "amd", "cpu", "android-soc"];
const COLOR_CHIP: Record<FamiliaChip, string> = {
  "apple-silicon": "#94a3b8",
  nvidia: "#22c55e",
  amd: "#ef4444",
  cpu: "#f59e0b",
  "android-soc": "#10b981",
};

/** Etiqueta de una familia recibida por la ficha; una cadena rara no pinta nada. */
function etiquetaChip(chip: string): string | null {
  return (ETIQUETA_CHIP as Record<string, string | undefined>)[chip] ?? null;
}

export const CAPA_ENLACES: CapaSenal = {
  id: "enlaces-medidos", grupo: "medido", tipo: "enlaces",
  etiqueta: "Enlaces medidos", descripcion: "Líneas entre neuronas con calidad medida (ida y vuelta o capacidad)",
  estado: "parcial",
  fuente: "Enlaces directos abiertos entre este aparato y otra neurona (Bluetooth, red local, Wi-Fi Directo) con ida y vuelta o capacidad medidas; la hora es la de la lectura. Los enlaces que no pasan por este aparato no se miden aquí.",
  tramos: [
    { id: "mala", etiqueta: "Mala", color: "#ef4444", estilo: "relleno" },
    { id: "regular", etiqueta: "Regular", color: "#facc15", estilo: "relleno" },
    { id: "buena", etiqueta: "Buena", color: "#22c55e", estilo: "relleno" },
    DESC,
  ],
  valor: () => desconocido("las líneas no son un valor por neurona"),
};

export const CAPAS_SENALES: readonly CapaSenal[] = [
  ...MEDIOS_ALCANCE.map(capaAlcance),
  CAPA_ENLACES,
  {
    id: "senal-bluetooth", grupo: "senal", etiqueta: "Bluetooth", descripcion: "Calidad medida del enlace Bluetooth directo con cada aparato",
    estado: "parcial",
    fuente: "Ida y vuelta y capacidad (kbit/s) de los enlaces Bluetooth abiertos entre este aparato y cada neurona, tal como los lista el transporte. Sin enlace abierto no hay medida (gris). Fuera de eso nada mide la señal Bluetooth: no hay nivel de señal (RSSI) por aparato.",
    tramos: TRAMOS_CALIDAD,
    valor: (m) => valorDeAntena(m, "ble", "calidad sin medir"),
  },
  {
    id: "senal-wifi", grupo: "senal", etiqueta: "Wi-Fi", descripcion: "Calidad medida del enlace directo por red local con cada aparato",
    estado: "parcial",
    fuente: "Ida y vuelta y capacidad de los enlaces de red local (incluido Wi-Fi Directo) abiertos entre este aparato y cada neurona. Sin enlace abierto no hay medida (gris). La app no puede leer el nivel de la señal Wi-Fi.",
    tramos: TRAMOS_CALIDAD,
    valor: (m) => valorDeAntena(m, "wifi", "nivel sin medir"),
  },
  {
    id: "senal-local", grupo: "senal", etiqueta: "Red local (P2P)", descripcion: "Calidad del enlace P2P medida desde este aparato",
    estado: "parcial",
    fuente: "Latencia (RTT) del canal P2P abierto, medida desde ESTE aparato hacia cada neurona; este aparato y las neuronas sin canal abierto salen sin medir.",
    tramos: TRAMOS_CALIDAD,
    valor: (m) => {
      if (m.calidad.valor === null || m.enlace.latenciaMs === null) return desconocido();
      return { tramo: tramoDeCalidad(qualityFromRtt(m.enlace.latenciaMs)), texto: `${Math.round(m.enlace.latenciaMs)} ms`, t: m.calidad.t, medida: true };
    },
  },
  {
    id: "senal-internet", grupo: "senal", etiqueta: "Internet", descripcion: "Calidad de la conexión a internet de cada aparato",
    estado: "real",
    fuente: "Velocidad de bajada que estima el navegador (Network Information API) que cada neurona anuncia en la presencia; sin ella, sin medir. Sin conexión = mala.",
    tramos: TRAMOS_CALIDAD,
    valor: (m) => {
      const a = antena(m, "ip");
      if (!a?.medida) return desconocido();
      const q = a.calidad;
      return q === null ? { tramo: "desconocido", texto: `${a.valor}; calidad sin medir`, t: a.t, medida: false } : { tramo: tramoDeCalidad(q), texto: a.valor, t: a.t, medida: true };
    },
  },
  ...capasOferta(),
  // MAP1116 · Internet que ofrece la red: SOLO anuncios de sus dueños (faro `offersPublic` / presencia
  // `offerPublicInternet`) y filas publicadas con medio «internet». Sin anuncio no hay dato.
  {
    id: "oferta-internet-red", grupo: "oferta", etiqueta: "Internet que ofrece la red",
    descripcion: "Aparatos de la red que anuncian salida a internet a los demás",
    estado: "parcial",
    fuente: "Lo que anuncia cada dueño: `offersPublic` del faro (ai/astraura/mesh/signals.ts) y filas del espectrómetro con medio 'internet'. Si nadie lo anuncia, no se supone.",
    tramos: [
      { id: "si", etiqueta: "Ofrece internet · anunciado por su dueño", color: "#0ea5e9", estilo: "relleno" },
      { id: "no", etiqueta: "No lo anuncia", color: "#94a3b8", estilo: "anillo" },
      DESC,
    ],
    valor: (m) => {
      const filas = (m.publicadas ?? []).filter((s) => s.medio === "internet");
      if (filas.length) {
        const s = filas.reduce((a, b) => ((b.medidoEn ?? -Infinity) >= (a.medidoEn ?? -Infinity) ? b : a));
        return { tramo: "si", texto: `anunciado (${s.origen}) · internet${s.banda ? ` · ${s.banda}` : ""}`, t: s.medidoEn, medida: s.origen === "medida" };
      }
      if (m.oferta) return m.oferta.internet
        ? { tramo: "si", texto: "anunciado por su dueño", t: null, medida: true }
        : { tramo: "no", texto: "no lo anuncia", t: null, medida: true };
      return desconocido("sin fuente: nadie lo anuncia aún");
    },
  },
  {
    id: "oferta-modelos", grupo: "oferta", etiqueta: "Modelos de Astraura", descripcion: "Aparatos que pueden servir modelos de Astraura a la malla",
    estado: "parcial",
    fuente: "Ficha que cada neurona manda por su canal P2P (`sirveAstraura`); solo las que tienen canal abierto con este aparato.",
    tramos: [
      { id: "si", etiqueta: "Sirve modelos", color: "#8b5cf6", estilo: "relleno" },
      { id: "no", etiqueta: "No sirve", color: "#94a3b8", estilo: "anillo" },
      DESC,
    ],
    valor: (m) => {
      const h = m.hardware;
      if (h.sirveAstraura === null) return desconocido();
      return { tramo: h.sirveAstraura ? "si" : "no", texto: h.sirveAstraura ? `sirve Astraura${h.fuentesServibles ? ` · ${h.fuentesServibles} fuentes` : ""}` : "no sirve Astraura", t: h.t, medida: true };
    },
  },
  ...ORDEN_CONCIENCIA.map(capaConciencia),
  {
    id: "hw-ram", grupo: "hardware", etiqueta: "Memoria (RAM)", descripcion: "Clase de memoria que anuncia cada aparato",
    estado: "parcial",
    fuente: "Ficha P2P de cada neurona (`ramClase`, de navigator.deviceMemory); la de este aparato, de su propia ficha.",
    tramos: [...CLASES_RAM.map((c): Tramo => ({ id: c, etiqueta: c, color: COLOR_RAM[c], estilo: "relleno" })), DESC],
    valor: (m) => {
      const h = m.hardware;
      if (!h.ramClase || h.ramClase === "desconocida") return desconocido();
      return { tramo: h.ramClase, texto: h.ramClase, t: h.t, medida: true };
    },
  },

  {
    id: "hw-gpu", grupo: "hardware", etiqueta: "GPU", descripcion: "Modelo de GPU que anuncia cada aparato",
    estado: "parcial",
    fuente: "Ficha de capacidades P2P de cada neurona (`gpu`, deducida del renderizador WebGL); la de este aparato, de su propia ficha. Si el navegador oculta el modelo, queda sin medir.",
    tramos: [
      { id: "medido", etiqueta: "GPU medida", color: "#0ea5e9", estilo: "relleno" },
      DESC,
    ],
    valor: (m) => {
      const h = m.hardware;
      const gpu = typeof h.gpu === "string" ? h.gpu.trim() : "";
      return gpu ? { tramo: "medido", texto: gpu, t: h.t, medida: true } : desconocido();
    },
  },
  {
    id: "hw-almacenamiento", grupo: "hardware", etiqueta: "Almacenamiento libre", descripcion: "Almacenamiento libre que anuncia cada aparato",
    estado: "parcial",
    fuente: "Ficha de capacidades P2P de cada neurona (`almacenamientoLibreGb`: disco libre medido por la app nativa o cuota del navegador menos lo usado); la de este aparato, de su propia ficha.",
    tramos: [...CLASES_ALMACENAMIENTO.map((c): Tramo => ({ id: c, etiqueta: c, color: COLOR_ALMACENAMIENTO[c], estilo: "relleno" })), DESC],
    valor: (m) => {
      const h = m.hardware;
      const gb = h.almacenamientoLibreGb;
      if (typeof gb !== "number" || !Number.isFinite(gb) || gb < 0) return desconocido();
      return { tramo: claseAlmacenamiento(gb), texto: `${gb} GB libres`, t: h.t, medida: true };
    },
  },
  {
    id: "hw-chip", grupo: "hardware", etiqueta: "Tipo de chip", descripcion: "Familia de chip que anuncia cada aparato",
    estado: "parcial",
    fuente: "Ficha de capacidades P2P de cada neurona (`chip`, deducido de la plataforma y la GPU); la de este aparato, de su propia ficha. Sin dato, sin medir.",
    tramos: [...CHIPS_HARDWARE.map((c): Tramo => ({ id: c, etiqueta: ETIQUETA_CHIP[c], color: COLOR_CHIP[c], estilo: "relleno" })), DESC],
    valor: (m) => {
      const h = m.hardware;
      const chip = h.chip;
      if (!chip) return desconocido();
      const etiqueta = etiquetaChip(chip);
      return etiqueta ? { tramo: chip, texto: etiqueta, t: h.t, medida: true } : desconocido();
    },
  },

  // —— Grupo "red": Red completa (lo que cada dueño publica) ———————————————————————————————
  // (AUD1117) Las señales publicadas llegan a cada marca por su vínculo de neurona (`marcas.ts`);
  // cada capa pinta las suyas diciendo el origen del dato (medida, declarada o estimada).
  {
    id: "red-publica",
    grupo: "red",
    etiqueta: "Red pública",
    descripcion: "Señales que sus dueños publican en la capa pública del espectrómetro (zona aproximada, nunca punto exacto)",
    estado: "parcial",
    fuente: "espectro/leer-senales.ts (capa 'publica') · espectro/publicacion.ts (publicar en capa pública)",
    tramos: [
      { id: "medida", etiqueta: "Medida · publicado por su dueño · zona aproximada", color: "#10b981", estilo: "relleno" },
      { id: "declarada", etiqueta: "Declarada · publicado por su dueño · zona aproximada", color: "#10b981", estilo: "anillo" },
      { id: "estimada", etiqueta: "Estimada · publicado por su dueño · zona aproximada", color: "#10b981", estilo: "rayado" },
      { ...DESC, etiqueta: "Sin publicar en capa pública" },
    ],
    valor: (m) => valorRedPublicada("red-publica", m),
  },
  {
    id: "red-comunidad",
    grupo: "red",
    etiqueta: "Red de comunidad",
    descripcion: "Señales compartidas dentro de una comunidad (página/grupo) por sus miembros",
    estado: "parcial",
    fuente: "espectro/leer-senales.ts (capa 'comunidad') · espectro/publicacion.ts (publicar en capa comunidad)",
    tramos: [
      { id: "medida", etiqueta: "Medida · publicado por su dueño · zona aproximada", color: "#0ea5e9", estilo: "relleno" },
      { id: "declarada", etiqueta: "Declarada · publicado por su dueño · zona aproximada", color: "#0ea5e9", estilo: "anillo" },
      { id: "estimada", etiqueta: "Estimada · publicado por su dueño · zona aproximada", color: "#0ea5e9", estilo: "rayado" },
      { ...DESC, etiqueta: "Sin publicar en capa comunidad" },
    ],
    valor: (m) => valorRedPublicada("red-comunidad", m),
  },
  {
    id: "red-privada",
    grupo: "red",
    etiqueta: "Red privada (lo propio de mi cuenta)",
    descripcion: "Señales de las neuronas de esta cuenta, compartidas solo por el canal privado de posición",
    estado: "parcial",
    fuente: "espectro/leer-senales.ts (capa 'privada') · espectro/publicacion.ts (publicar en capa privada) · geo/canal-posicion.ts (canal pos:<uid>)",
    tramos: [
      { id: "medida", etiqueta: "Medida · publicado por su dueño · zona aproximada", color: "#a855f7", estilo: "relleno" },
      { id: "declarada", etiqueta: "Declarada · publicado por su dueño · zona aproximada", color: "#a855f7", estilo: "anillo" },
      { id: "estimada", etiqueta: "Estimada · publicado por su dueño · zona aproximada", color: "#a855f7", estilo: "rayado" },
      { ...DESC, etiqueta: "Sin canal privado de posición" },
    ],
    valor: (m) => valorRedPublicada("red-privada", m),
  },
  {
    id: "red-externa",
    grupo: "red",
    etiqueta: "Red externa (fuera de StarSeed)",
    descripcion: "Redes IP, estaciones de radio y otras señales detectadas fuera de StarSeed OS",
    estado: "sin-fuente",
    fuente: "espectro/leer-senales.ts (capa 'externa') · espectro/publicacion.ts (importar de fuentes externas) — las filas publicadas con capa 'externa' pintan aquí; hoy ninguna fuente las crea",
    tramos: [
      { id: "medida", etiqueta: "Medida · publicado por su dueño · zona aproximada", color: "#f59e0b", estilo: "relleno" },
      { id: "declarada", etiqueta: "Declarada · publicado por su dueño · zona aproximada", color: "#f59e0b", estilo: "anillo" },
      { id: "estimada", etiqueta: "Estimada · publicado por su dueño · zona aproximada", color: "#f59e0b", estilo: "rayado" },
      { ...DESC, etiqueta: "Sin fuente externa" },
    ],
    valor: (m) => valorRedPublicada("red-externa", m),
  },
];

export const CAPA_POR_ID: Readonly<Record<string, CapaSenal>> = Object.fromEntries(CAPAS_SENALES.map((c) => [c.id, c]));

export function tramoDe(capa: CapaSenal, id: string): Tramo {
  return capa.tramos.find((t) => t.id === id) ?? DESC;
}

/** Lo que se pinta de una marca en una capa: el tramo y su valor. */
export function pintarMarca(capa: CapaSenal, m: MarcaGeo): { tramo: Tramo; valor: ValorCapa } {
  const valor = capa.valor(m);
  return { tramo: tramoDe(capa, valor.tramo), valor };
}

/** De qué capa de red (`CapaRed` del espectrómetro) pinta cada capa `red-*` del mapa. */
export const CAPA_RED_POR_ID: Readonly<Record<string, CapaRed>> = {
  "red-publica": "publica",
  "red-comunidad": "comunidad",
  "red-privada": "privada",
  "red-externa": "externa",
};

const ETIQUETA_ORIGEN: Record<OrigenDato, string> = { medida: "medida", declarada: "declarada", estimada: "estimada" };

/**
 * (AUD1117) Valor de una capa `red-*` para UNA marca, según las señales publicadas que la marca trae
 * (`MarcaGeo.publicadas`, ya repartidas por su vínculo de neurona). Con filas de esa capa, pinta la más
 * reciente y dice el origen del dato (medida, declarada o estimada); sin filas, «sin publicar».
 */
export function valorRedPublicada(idCapa: string, m: MarcaGeo): ValorCapa {
  const capaRed = CAPA_RED_POR_ID[idCapa];
  const filas = capaRed ? (m.publicadas ?? []).filter((s) => s.capa === capaRed) : [];
  if (!filas.length) return { tramo: "desconocido", texto: "sin publicar", t: null, medida: false };
  const s = filas.reduce((a, b) => ((b.medidoEn ?? -Infinity) >= (a.medidoEn ?? -Infinity) ? b : a));
  return {
    tramo: s.origen,
    texto: `${ETIQUETA_ORIGEN[s.origen]} · ${s.medio}${s.banda ? ` · ${s.banda}` : ""}`,
    t: s.medidoEn,
    medida: s.origen === "medida",
  };
}

/** (AUD1117) Lo que el panel de capas dice cuando la lectura de señales publicadas no llegó a buen puerto; null = nada que avisar. */
export function motivoSenalesPublicadas(estado: EstadoLectura, motivo?: string): string | null {
  if (estado === "ok") return null;
  const detalle = motivo?.trim() || "no se pudo leer la tabla de señales publicadas";
  return `Señales publicadas de la red: ${detalle}.`;
}

export interface ItemLeyenda {
  etiqueta: string;
  color: string;
  estilo: EstiloTramo;
}

/** La leyenda sale de los mismos tramos que el pintado. */
export function leyendaDe(capa: CapaSenal): ItemLeyenda[] {
  return capa.tramos.map((t) => ({ etiqueta: t.etiqueta, color: t.color, estilo: t.estilo }));
}

export const NOTA_PARCHE = "El color marca el punto donde se midió; su tamaño no es un alcance de cobertura.";
export const NOTA_ALCANCE = "Los campos rayados son alcance estimado (cifra típica del medio), no una medida. Lo medido va en trazo sólido.";

// ── Estado guardado de las capas (por persona, en este navegador) ─────────────────────────────

export interface EstadoCapas {
  activas: string[];
  opacidad: Record<string, number>;
}

export const OPACIDAD_POR_DEFECTO = 0.8;
export const CLAVE_CAPAS_SENALES = "starseed.senales.mapa.capas.v1";
export const CLAVE_VISTA_SENALES = "starseed.senales.mapa.view.v1";

export function estadoCapasInicial(): EstadoCapas {
  return { activas: ["senal-internet", "cobertura-ble", "cobertura-wifi", "enlaces-medidos"], opacidad: {} };
}

/** Lee lo guardado sin fiarse de su forma: ids desconocidos fuera, opacidad acotada a 0.1..1. */
export function sanearEstadoCapas(x: unknown): EstadoCapas {
  const base = estadoCapasInicial();
  if (!x || typeof x !== "object") return base;
  const o = x as Record<string, unknown>;
  const activas = Array.isArray(o.activas) ? o.activas.filter((i): i is string => typeof i === "string" && i in CAPA_POR_ID) : base.activas;
  const opacidad: Record<string, number> = {};
  if (o.opacidad && typeof o.opacidad === "object") {
    for (const [k, v] of Object.entries(o.opacidad as Record<string, unknown>)) {
      if (k in CAPA_POR_ID && typeof v === "number" && Number.isFinite(v)) opacidad[k] = Math.max(0.1, Math.min(1, v));
    }
  }
  return { activas: Array.from(new Set(activas)), opacidad };
}
