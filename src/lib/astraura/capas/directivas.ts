/**
 * Directivas aprendidas por la automejora Meta^n de las capas de Astraura (MTN1027B).
 * Contrato: architecture/automejora-meta-n.md §3–§4 — Meta^n PROPONE dentro de una caja
 * sin red ni claves; el juez de StarSeed decide fuera; las funciones de ayuda nunca se
 * cargan en caliente. PURO: sin `node:*`, sin red, sin reloj. Mismo formato que
 * `starseed_memory_root/aprendizaje/directivas/<capa>.json` (clave del navegador:
 * `starseed.capas.directivas.v1`).
 */
export interface DirectivaCapa {
  capa: string; version: number; texto: string; sha256: string;
  acierto: number; base: number; n: number; fecha: string;
  origen: string; estado: "activa" | "propuesta" | "anterior" | "retirada";
  motivo?: string;
}

export interface ArchivoDirectivas {
  v: 1;
  capa: string;
  /** Versión de la directiva activa, o null si no hay ninguna. */
  activa: number | null;
  historial: DirectivaCapa[];
}

/** Medición de la directiva activa sobre sus experiencias confirmadas (acierto 0–1). */
export interface MedidasDirectiva { n: number; acierto: number; }

export type DirectivaSaneada =
  | { ok: true; texto: string; motivo?: undefined }
  | { ok: false; texto: string; motivo: string };

export const LIMITE_CARACTERES = 1200;
export const CASOS_MINIMOS_RETIRO = 50;
export const CAIDA_MINIMA_RETIRO = 0.03;

// Saneado (contrato §3.4): una directiva es TEXTO de estrategia; nada de URLs,
// código, claves, variables de entorno ni temas intocables.
const RE_URL = /(?:https?:\/\/|www\.)\S+/i;
const RE_DOMINIO = /\b[\w-]{2,}\.(?:com|net|org|io|dev|app|ai|xyz|info)\b/i;
const RE_BLOQUE_CODIGO = /```/;
const RE_FORMA_CLAVE = /\b(?:sk-|mv2_|ghp_)|AIza|\b[A-Za-z0-9]{20,}\b/;
const RE_VARIABLE_ENTORNO = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;
const RE_TEMAS_PROHIBIDOS =
  /\b(?:permisos?|permissions?|n[úu]cleos?|kernels?|contrase[ñn]as?|passwords?|passwd)\b/i;
const RE_IGNORAR_INSTRUCCIONES =
  /\b(?:ignor\w*|olv[íi]d\w*|desobedezc\w*|disregard\w*|bypass\w*|override)\b[^.;]{0,32}?\b(?:instrucciones|instrucci[óo]n|instructions?|reglas?|rules?|[óo]rdenes|orders?|prompts?|directivas|directives?)\b/i;

/** Sanea el texto de una pauta propuesta: la deja lista o dice por qué se rechaza. */
export function sanearDirectiva(texto: string): DirectivaSaneada {
  const limpio = texto.trim();
  if (!limpio) return { ok: false, texto: "", motivo: "vacía" };
  if (limpio.length > LIMITE_CARACTERES)
    return { ok: false, texto: "", motivo: `supera ${LIMITE_CARACTERES} caracteres` };
  if (RE_URL.test(limpio) || RE_DOMINIO.test(limpio))
    return { ok: false, texto: "", motivo: "contiene una URL" };
  if (RE_BLOQUE_CODIGO.test(limpio))
    return { ok: false, texto: "", motivo: "contiene un bloque de código" };
  if (RE_FORMA_CLAVE.test(limpio))
    return { ok: false, texto: "", motivo: "contiene algo con forma de clave" };
  if (RE_VARIABLE_ENTORNO.test(limpio))
    return { ok: false, texto: "", motivo: "contiene un nombre de variable de entorno" };
  if (RE_TEMAS_PROHIBIDOS.test(limpio))
    return { ok: false, texto: "", motivo: "habla de permisos, núcleo o contraseñas" };
  if (RE_IGNORAR_INSTRUCCIONES.test(limpio))
    return { ok: false, texto: "", motivo: "pide ignorar instrucciones" };
  return { ok: true, texto: limpio };
}

/** La directiva activa del archivo, si su versión y su estado cuadran. */
const directivaActiva = (archivo: ArchivoDirectivas): DirectivaCapa | undefined =>
  archivo.activa === null
    ? undefined
    : archivo.historial.find((d) => d.version === archivo.activa && d.estado === "activa");

/**
 * Bloque de pautas que Astraura añade a la sección de sistema de la capa, debajo de las
 * reglas y con su cabecera fija (contrato §4). "" si no hay activa o no pasa el saneado.
 */
export function seccionDirectivas(archivo: ArchivoDirectivas): string {
  const activa = directivaActiva(archivo);
  if (!activa) return "";
  const sana = sanearDirectiva(activa.texto);
  if (!sana.ok) return "";
  return (
    `Pautas aprendidas por la automejora de Astraura (versión ${activa.version}). ` +
    `No cambian permisos ni reglas.\n\n${sana.texto}`
  );
}

/** Retira la activa si con ≥ 50 casos mide 0,03 menos que la anterior (contrato §3.5). */
export function debeRetirar(
  activa: DirectivaCapa,
  anterior: DirectivaCapa | null,
  medidas: MedidasDirectiva,
): boolean {
  if (activa.estado !== "activa") return false;
  if (!anterior) return false;
  if (medidas.n < CASOS_MINIMOS_RETIRO) return false;
  // Margen 1e-9: una caída de exactamente 0,03 cuenta (error de coma flotante).
  return anterior.acierto - medidas.acierto >= CAIDA_MINIMA_RETIRO - 1e-9;
}

/**
 * Vuelta atrás (contrato §3.5 y §5): retira la activa y reactiva la «anterior» más
 * reciente de version menor; sin anterior, queda retirada y el archivo sin activa.
 * Devuelve un archivo NUEVO; el original queda intacto.
 */
export function volverALaAnterior(archivo: ArchivoDirectivas): ArchivoDirectivas {
  const activa = directivaActiva(archivo);
  if (!activa) return archivo;
  const anterior = archivo.historial
    .filter((d) => d.estado === "anterior" && d.version < activa.version)
    .sort((a, b) => b.version - a.version)[0];
  const historial = archivo.historial.map((d): DirectivaCapa => {
    if (d.version === activa.version)
      return { ...d, estado: "retirada", motivo: "vuelta a la anterior" };
    if (anterior && d.version === anterior.version) return { ...d, estado: "activa" };
    return d;
  });
  return { ...archivo, activa: anterior ? anterior.version : null, historial };
}
