"use client";
/**
 * Almacén de las directivas aprendidas por Meta^n (MTN1027C · automejora recursiva):
 * `localStorage["starseed.capas.directivas.v1"]` = `Record<capa, ArchivoDirectivas>`.
 * Las directivas VIAJAN CON LA CUENTA: la clave va en SYNCED_KEYS y al aplicarse en otro
 * medio suena EVENTO_DIRECTIVAS (EVENT_BY_KEY, realtime-sync.ts). Contrato §3–§4 de
 * architecture/automejora-meta-n.md: aquí solo se guarda y se lee, nunca se ejecuta nada.
 */
import type { ArchivoDirectivas, DirectivaCapa } from "./directivas";

export const CLAVE_DIRECTIVAS = "starseed.capas.directivas.v1";
export const EVENTO_DIRECTIVAS = "starseed:capas-directivas";

export type RegistroDirectivas = Record<string, ArchivoDirectivas>;

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const ESTADOS = new Set<string>(["activa", "propuesta", "anterior", "retirada"]);

/** Sanea una directiva del historial: los valores desconocidos se caen, nunca explotan. */
function normalizarDirectiva(v: unknown): DirectivaCapa | null {
  if (!esObjeto(v)) return null;
  const esTexto = (x: unknown): x is string => typeof x === "string";
  const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  if (
    typeof v.version !== "number" || !Number.isFinite(v.version) ||
    !esTexto(v.texto) || !esTexto(v.fecha) || !esTexto(v.origen) ||
    !ESTADOS.has(String(v.estado))
  ) return null;
  const d: DirectivaCapa = {
    capa: typeof v.capa === "string" ? v.capa : "",
    version: v.version,
    texto: v.texto,
    sha256: typeof v.sha256 === "string" ? v.sha256 : "",
    acierto: num(v.acierto),
    base: num(v.base),
    n: num(v.n),
    fecha: v.fecha,
    origen: v.origen,
    estado: v.estado as DirectivaCapa["estado"],
  };
  if (typeof v.motivo === "string") d.motivo = v.motivo;
  return d;
}

/** Sanea un archivo de directivas de una capa; versión ajena o capa vacía → null. */
export function normalizarArchivoDirectivas(valor: unknown): ArchivoDirectivas | null {
  if (!esObjeto(valor) || valor.v !== 1 || typeof valor.capa !== "string" || !valor.capa) return null;
  const historial = (Array.isArray(valor.historial) ? valor.historial : [])
    .map(normalizarDirectiva)
    .filter((d): d is DirectivaCapa => d !== null);
  return {
    v: 1, capa: valor.capa, historial,
    activa: typeof valor.activa === "number" && Number.isFinite(valor.activa) ? valor.activa : null,
  };
}

/** Sanea el registro entero (`Record<capa, ArchivoDirectivas>`) tal como baja de la cuenta. */
export function normalizarRegistroDirectivas(valor: unknown): RegistroDirectivas {
  if (!esObjeto(valor)) return {};
  const registro: RegistroDirectivas = {};
  for (const [capa, archivo] of Object.entries(valor)) {
    const saneado = normalizarArchivoDirectivas(archivo);
    if (saneado) registro[capa] = saneado;
  }
  return registro;
}

/**
 * Puerta de llegada (MTN1027C): un archivo solo entra si su versión activa es
 * MÁS NUEVA que la actual, o si con la misma activa cambió el historial
 * (propuesta nueva, retiro, vuelta atrás). Un gemelo idéntico o una versión
 * vieja no toca la pestaña que ya lo tiene.
 */
export function debeGuardarDirectiva(
  actual: ArchivoDirectivas | undefined,
  nuevo: ArchivoDirectivas | null,
): boolean {
  if (!nuevo) return false;
  if (!actual) return true;
  const activaMasNueva =
    nuevo.activa !== null &&
    (actual.activa === null || nuevo.activa > actual.activa);
  // Margen JSON: el historial viaja saneado en ambos lados, así que basta compararlo entero.
  return activaMasNueva || JSON.stringify(actual.historial) !== JSON.stringify(nuevo.historial);
}

/** Lectura defensiva del registro entero; sin clave, JSON roto o permiso → {}. */
export function leerDirectivas(): RegistroDirectivas {
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(CLAVE_DIRECTIVAS);
      if (raw) return normalizarRegistroDirectivas(JSON.parse(raw) as unknown);
    }
  } catch {
    /* JSON roto o almacenamiento sin permiso: sigue el registro vacío. */
  }
  return {};
}

/** Guarda el archivo de una capa SOLO si gana según `debeGuardarDirectiva`; suena EVENTO_DIRECTIVAS. */
export function guardarDirectivas(capa: string, archivo: ArchivoDirectivas): boolean {
  try {
    if (typeof window === "undefined" || !capa) return false;
    const registro = leerDirectivas();
    const saneado = normalizarArchivoDirectivas(archivo);
    if (!saneado || !debeGuardarDirectiva(registro[capa], saneado)) return false;
    registro[capa] = saneado;
    window.localStorage.setItem(CLAVE_DIRECTIVAS, JSON.stringify(registro));
    window.dispatchEvent(new Event(EVENTO_DIRECTIVAS));
    return true;
  } catch {
    return false;
  }
}

/** La directiva activa de una capa, si su versión y su estado cuadran. */
export function directivaActiva(capa: string): DirectivaCapa | undefined {
  const archivo = leerDirectivas()[capa];
  if (!archivo || archivo.activa === null) return undefined;
  return archivo.historial.find((d) => d.version === archivo.activa && d.estado === "activa");
}
