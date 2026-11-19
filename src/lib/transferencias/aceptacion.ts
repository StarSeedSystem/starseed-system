/**
 * aceptacion — todo envío entrante pide permiso, o lo tiene ya si la persona lo dejó dicho
 * (FMT1119 · 2026-11-19). Módulo PURO: sin red, sin disco y sin DOM.
 *
 * Regla de Alex: recibir archivos, carpetas y sincronizaciones de cerebros es libre; nada se
 * ejecuta ni se instala sin aceptación. Por defecto SIEMPRE se pregunta; solo una neurona que la
 * persona marcó como reconocida puede aceptarse sola, y solo si encendió «aceptar sin preguntar»
 * para ESA neurona. Una neurona desconocida nunca se acepta sola, diga lo que diga el ajuste.
 *
 * Nada se borra: el rechazo deja lo recibido en cuarentena. La decisión de abrir es de la persona.
 */

export type ClaseEnvio = "archivo" | "carpeta" | "cerebro";

export type MedioRecepcion = "malla" | "bluetooth" | "lan" | "nube" | "enlace" | "desconocido";

/** La neurona de la que viene el envío y si la persona la reconoce. */
export interface NeuronaOrigen {
  id: string;
  nombre: string;
  reconocida: boolean;
}

/** Lo que anuncia un envío antes de aceptarse: archivo, carpeta entera o sincronización de cerebro. */
export interface OfertaRecepcion {
  id: string;
  clase: ClaseEnvio;
  nombre: string;
  tamano: number;
  /** Tipo real (por sus bytes), no solo la extensión. */
  tipoReal: string;
  origen: NeuronaOrigen;
  medio: MedioRecepcion;
  /** Nº de archivos cuando es carpeta o sincronización de cerebro. */
  archivos?: number;
}

/** Ajustes de la persona. Los dos están apagados por defecto. */
export interface PreferenciasRecepcion {
  /** «Aceptar sin preguntar» por id de neurona; ausente = preguntar siempre. */
  aceptarSinPreguntar?: Readonly<Record<string, boolean>>;
  /** «Analizar siempre al recibir»; por defecto se ofrece el análisis, no se hace solo. */
  analizarAlRecibir?: "preguntar" | "siempre";
}

export const PREFERENCIAS_RECEPCION_POR_DEFECTO: Readonly<Required<PreferenciasRecepcion>> = Object.freeze({
  aceptarSinPreguntar: Object.freeze({}),
  analizarAlRecibir: "preguntar",
});

/** Lo que se enseña en la ventana antes de decidir. */
export interface FichaRecepcion {
  nombre: string;
  claseTexto: string;
  tamanoTexto: string;
  tipoReal: string;
  origenTexto: string;
  medioTexto: string;
  resumen: string;
}

export type DecisionAceptacion =
  | { tipo: "aceptar-sin-preguntar"; motivo: string }
  | { tipo: "preguntar"; motivo: string };

export type FaseRecepcion = "en-cuarentena" | "aceptada" | "rechazada";

/** «ofrecido» = Astraura lo ofrece y espera a la persona; «pendiente» = se pidió y aún no terminó. */
export type EstadoAnalisis = "no-pedido" | "ofrecido" | "pendiente" | "hecho";

export interface Recepcion {
  oferta: OfertaRecepcion;
  ficha: FichaRecepcion;
  fase: FaseRecepcion;
  analisis: EstadoAnalisis;
  autoaceptada: boolean;
  aceptadaPorLaPersona: boolean;
  /** Los originales se conservan siempre: ni aceptar ni rechazar borra nada de la persona. */
  conservaOriginal: true;
}

/** Tamaño legible en español neutro («1,5 KB», «2 MB»). Puro. */
export function formatearTamano(bytes: number): string {
  const n = Number.isFinite(bytes) ? Math.max(0, Math.round(bytes)) : 0;
  if (n < 1024) return `${n} B`;
  const unidades = ["KB", "MB", "GB", "TB"];
  let valor = n / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  const texto = valor >= 100 ? String(Math.round(valor)) : valor.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  return `${texto} ${unidades[i]}`;
}

/** Nombre legible de la clase de envío. Puro. */
export function nombreClase(clase: ClaseEnvio): string {
  if (clase === "carpeta") return "Carpeta";
  if (clase === "cerebro") return "Sincronización de cerebro";
  return "Archivo";
}

/** Nombre legible del medio por el que llega. Puro. */
export function textoMedio(medio: MedioRecepcion): string {
  switch (medio) {
    case "malla":
      return "Malla StarSeed";
    case "bluetooth":
      return "Bluetooth";
    case "lan":
      return "Red local";
    case "nube":
      return "Nube de Astraura";
    case "enlace":
      return "Enlace directo";
    default:
      return "Medio desconocido";
  }
}

/** La ficha que se enseña antes de decidir: nombre, tamaño, tipo real, neurona de origen y medio. Puro. */
export function fichaDeOferta(oferta: OfertaRecepcion): FichaRecepcion {
  const claseTexto = nombreClase(oferta.clase);
  const medioTexto = textoMedio(oferta.medio);
  const tamanoTexto = formatearTamano(oferta.tamano);
  const tipoReal = String(oferta.tipoReal || "").trim() || "sin determinar";
  const origenTexto = `${oferta.origen?.nombre || "Remitente sin nombre"}${oferta.origen?.reconocida ? " (neurona reconocida)" : " (neurona no reconocida)"}`;
  const cuantos = oferta.clase === "archivo" ? 0 : Math.max(0, Math.round(oferta.archivos ?? 0));
  const resumen = [
    `${claseTexto}: ${oferta.nombre || "sin nombre"}`,
    `Tamaño: ${tamanoTexto}`,
    `Tipo real: ${tipoReal}`,
    `Origen: ${origenTexto}`,
    `Medio: ${medioTexto}`,
    ...(cuantos > 0 ? [`Contenido: ${cuantos} archivo${cuantos === 1 ? "" : "s"}`] : []),
    "Nada se ejecuta ni se instala sin tu aceptación.",
  ].join("\n");
  return { nombre: oferta.nombre, claseTexto, tamanoTexto, tipoReal, origenTexto, medioTexto, resumen };
}

function preferenciasDe(p?: PreferenciasRecepcion): Required<PreferenciasRecepcion> {
  return {
    aceptarSinPreguntar: p?.aceptarSinPreguntar ?? {},
    analizarAlRecibir: p?.analizarAlRecibir === "siempre" ? "siempre" : "preguntar",
  };
}

/** Decide si este envío se pregunta o se acepta solo. Puro. */
export function decidirAceptacion(oferta: OfertaRecepcion, prefs?: PreferenciasRecepcion): DecisionAceptacion {
  const p = preferenciasDe(prefs);
  const reconocida = oferta.origen?.reconocida === true;
  const encendido = !!p.aceptarSinPreguntar[oferta.origen?.id ?? ""];
  if (reconocida && encendido) {
    return { tipo: "aceptar-sin-preguntar", motivo: "Neurona reconocida con «aceptar sin preguntar» encendido por la persona." };
  }
  if (!reconocida) {
    return { tipo: "preguntar", motivo: "La neurona no es reconocida: siempre se pide aceptación." };
  }
  return { tipo: "preguntar", motivo: "«Aceptar sin preguntar» está apagado para esta neurona." };
}

/** Enciende o apaga «aceptar sin preguntar» para UNA neurona sin tocar las demás. Puro. */
export function ajustarAceptarSinPreguntar(prefs: PreferenciasRecepcion | undefined, neuronaId: string, activo: boolean): PreferenciasRecepcion {
  const p = preferenciasDe(prefs);
  const mapa = { ...p.aceptarSinPreguntar };
  const id = String(neuronaId || "");
  if (id) {
    if (activo) mapa[id] = true;
    else delete mapa[id];
  }
  return { aceptarSinPreguntar: mapa, analizarAlRecibir: p.analizarAlRecibir };
}

/**
 * Crea la recepción de un envío. Queda en cuarentena y se pide aceptación, salvo que la persona
 * haya encendido «aceptar sin preguntar» para una neurona reconocida. El análisis se ofrece; solo
 * queda pendiente de entrada si la persona dejó «analizar siempre al recibir». Puro.
 */
export function recibirOferta(oferta: OfertaRecepcion, prefs?: PreferenciasRecepcion): Recepcion {
  const p = preferenciasDe(prefs);
  const decision = decidirAceptacion(oferta, p);
  const autoaceptada = decision.tipo === "aceptar-sin-preguntar";
  return {
    oferta,
    ficha: fichaDeOferta(oferta),
    fase: autoaceptada ? "aceptada" : "en-cuarentena",
    analisis: p.analizarAlRecibir === "siempre" ? "pendiente" : "ofrecido",
    autoaceptada,
    aceptadaPorLaPersona: false,
    conservaOriginal: true,
  };
}

/** La persona acepta. Si pide análisis, no se podrá abrir hasta que termine. Puro. */
export function aceptarRecepcion(recepcion: Recepcion, opciones: { analizar?: boolean } = {}): Recepcion {
  if (recepcion.fase === "rechazada") return recepcion;
  const pendiente = recepcion.analisis === "pendiente";
  const analisis: EstadoAnalisis = opciones.analizar || pendiente ? "pendiente" : "no-pedido";
  return { ...recepcion, fase: "aceptada", analisis, aceptadaPorLaPersona: true };
}

/** La persona rechaza. No se borra nada: lo recibido sigue conservado en cuarentena. Puro. */
export function rechazarRecepcion(recepcion: Recepcion): Recepcion {
  return { ...recepcion, fase: "rechazada", aceptadaPorLaPersona: false, conservaOriginal: true };
}

/** La persona pide el análisis (o Astraura se lo ofrece y ella lo enciende). Puro. */
export function solicitarAnalisis(recepcion: Recepcion): Recepcion {
  if (recepcion.fase === "rechazada") return recepcion;
  return { ...recepcion, analisis: recepcion.analisis === "hecho" ? "hecho" : "pendiente" };
}

/** El análisis terminó: el resultado ya se puede enseñar antes de abrir. Puro. */
export function marcarAnalisisHecho(recepcion: Recepcion): Recepcion {
  return { ...recepcion, analisis: "hecho" };
}

/** Solo se abre lo aceptado y sin un análisis pedido a medias. Puro. */
export function puedeAbrir(recepcion: Recepcion): boolean {
  return recepcion.fase === "aceptada" && recepcion.analisis !== "pendiente";
}
