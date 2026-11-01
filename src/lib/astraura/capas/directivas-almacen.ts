/**
 * Almacén en el navegador de las directivas de la automejora Meta^n (MTN1027C).
 * Contrato: architecture/automejora-meta-n.md §3–§4 — solo pautas saneadas, con
 * su versión e historial; las funciones de ayuda JAMÁS se cargan en caliente.
 * La clave `starseed.capas.directivas.v1` = `Record<capa, ArchivoDirectivas>`
 * viaja con la cuenta (SYNCED_KEYS) y el evento `starseed:capas-directivas`
 * refresca las pantallas que la leen. PURO: sin `node:*`, sin red, sin reloj.
 */
import type { ArchivoDirectivas, DirectivaCapa } from "./directivas";

export const CLAVE_DIRECTIVAS = "starseed.capas.directivas.v1";
export const EVENTO_DIRECTIVAS = "starseed:capas-directivas";

const ESTADOS = ["activa", "propuesta", "anterior", "retirada"] as const;
type EstadoDirectiva = (typeof ESTADOS)[number];
const esEstado = (v: unknown): v is EstadoDirectiva => typeof v === "string" && (ESTADOS as readonly string[]).includes(v);

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const esEntero = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
const esTexto = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Sanea UNA directiva del historial: un campo roto tumba la entrada entera. */
function normalizarDirectiva(valor: unknown): DirectivaCapa | null {
  if (!esObjeto(valor) || !esTexto(valor.capa) || !esEntero(valor.version)) return null;
  if (!esTexto(valor.texto) || !esTexto(valor.sha256) || !esTexto(valor.fecha)) return null;
  if (!esTexto(valor.origen) || !esEstado(valor.estado)) return null;
  if (typeof valor.acierto !== "number" || !Number.isFinite(valor.acierto)) return null;
  if (typeof valor.base !== "number" || !Number.isFinite(valor.base)) return null;
  if (!esEntero(valor.n)) return null;
  return {
    capa: valor.capa, version: valor.version, texto: valor.texto, sha256: valor.sha256,
    acierto: valor.acierto, base: valor.base, n: valor.n, fecha: valor.fecha,
    origen: valor.origen, estado: valor.estado,
    motivo: esTexto(valor.motivo) ? valor.motivo : undefined,
  };
}

// ── Lectura defensiva: JSON roto, campos sueltos o versión distinta → null. ──
export function normalizarArchivoDirectivas(valor: unknown): ArchivoDirectivas | null {
  if (!esObjeto(valor) || valor.v !== 1 || !esTexto(valor.capa)) return null;
  if (!esEntero(valor.activa) && valor.activa !== null) return null;
  if (!Array.isArray(valor.historial)) return null;
  const historial = valor.historial.map(normalizarDirectiva)
    .filter((d): d is DirectivaCapa => d !== null);
  if (valor.activa !== null && !historial.some((d) => d.version === valor.activa)) return null;
  return { v: 1, capa: valor.capa, activa: valor.activa, historial };
}

/** normalizarArchivoDirectivas de TODO el mapa: lo inválido se cae sin tumba al resto. */
export function normalizarDirectivas(valor: unknown): Record<string, ArchivoDirectivas> {
  if (!esObjeto(valor)) return {};
  const mapa: Record<string, ArchivoDirectivas> = {};
  for (const [capa, archivo] of Object.entries(valor)) {
    const saneado = normalizarArchivoDirectivas(archivo);
    if (saneado) mapa[capa] = saneado;
  }
  return mapa;
}

/** Lee el mapa COMPLETO de directivas: sin dato o JSON roto → {} (nunca lanza). */
export function leerDirectivas(): Record<string, ArchivoDirectivas> {
  try {
    if (typeof window === "undefined") return {};
    const crudo = window.localStorage.getItem(CLAVE_DIRECTIVAS);
    if (!crudo) return {};
    return normalizarDirectivas(JSON.parse(crudo) as unknown);
  } catch {
    return {};
  }
}

/** La directiva ACTIVA de una capa (su versión y estado cuadran), o undefined. */
export function directivaActiva(capa: string): DirectivaCapa | undefined {
  const archivo = leerDirectivas()[capa];
  if (!archivo || archivo.activa === null) return undefined;
  return archivo.historial.find(
    (d) => d.version === archivo.activa && d.estado === "activa",
  );
}

/** Historiales iguales (mismo orden y mismo contenido) → no hace falta escribir. */
const mismoHistorial = (a: DirectivaCapa[], b: DirectivaCapa[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Emite el evento que refresca las pantallas en la MISMA pestaña. */
function emitir(): void {
  try { window.dispatchEvent(new Event(EVENTO_DIRECTIVAS)); } catch { /* sin ventana */ }
}

/**
 * Guarda el archivo de UNA capa (y emite el evento) SOLO si aporta algo nuevo:
 * una versión activa más nueva que la guardada, o un historial distinto. Ante
 * lo mismo o algo viejo no escribe: el sync no puede hacer retroceder la capa
 * (contrato §3.5 — la directiva activa nunca baja de versión sin juez). Devuelve
 * false si no escribió. El archivo entra por su saneado defensivo.
 */
export function guardarDirectivas(capa: string, archivo: ArchivoDirectivas): boolean {
  const entrante = normalizarArchivoDirectivas(archivo);
  if (!entrante || entrante.capa !== capa) return false;
  try {
    if (typeof window === "undefined") return false;
    const mapa = leerDirectivas();
    const actual = mapa[capa];
    const versionNueva = entrante.activa !== null &&
      (actual?.activa == null || entrante.activa > actual.activa);
    // Regla: escribir SOLO si la versión activa es más nueva O cambió el historial
    // (una retirada sincronizada viene con historial distinto). Con lo viejo que no
    // aporta nada no se escribe: el sync nunca resta por su cuenta.
    if (actual && !versionNueva && mismoHistorial(actual.historial, entrante.historial))
      return false;
    mapa[capa] = entrante;
    window.localStorage.setItem(CLAVE_DIRECTIVAS, JSON.stringify(mapa));
    emitir();
    return true;
  } catch { return false; }
}
