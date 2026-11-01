/**
 * Almacén de las directivas aprendidas por Meta^n por capa (MTN1027C · automejora recursiva).
 * Contrato: architecture/automejora-meta-n.md §3 — las directivas viajan con la cuenta
 * StarSeed ID: una clave única en localStorage (`CLAVE_CAPAS_DIRECTIVAS`) mapea capa → archivo
 * de directivas, y el evento `EVENTO_CAPAS_DIRECTIVAS` avisa a la UI local; realtime-sync
 * reemite el evento con el valor que llega de otro medio. Cliente puro: sin `node:*`,
 * lectura defensiva y try/catch en localStorage (patrón de `lib/mausbot/config.ts`).
 */
import type { ArchivoDirectivas, DirectivaCapa } from "./directivas";

export const CLAVE_CAPAS_DIRECTIVAS = "starseed.capas.directivas.v1";
export const EVENTO_CAPAS_DIRECTIVAS = "starseed:capas-directivas";

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const ESTADOS = ["activa", "propuesta", "anterior", "retirada"] as const;

const esDirectiva = (v: unknown): v is DirectivaCapa =>
  esObjeto(v) &&
  typeof v.capa === "string" && typeof v.version === "number" && typeof v.texto === "string" &&
  typeof v.sha256 === "string" && typeof v.acierto === "number" && typeof v.base === "number" &&
  typeof v.n === "number" && typeof v.fecha === "string" && typeof v.origen === "string" &&
  (ESTADOS as readonly string[]).includes(v.estado as string);

/** Normaliza un archivo llegando de cualquier medio; inválido → null. */
export function normalizarArchivoDirectivas(valor: unknown): ArchivoDirectivas | null {
  if (!esObjeto(valor) || valor.v !== 1 || typeof valor.capa !== "string") return null;
  const activa = typeof valor.activa === "number" && Number.isFinite(valor.activa)
    ? valor.activa
    : null;
  const historial = Array.isArray(valor.historial)
    ? valor.historial.filter(esDirectiva)
    : [];
  return { v: 1, capa: valor.capa, activa, historial };
}

/**
 * Decide si el archivo nuevo merece sustituir al guardado para su capa: solo si su
 * versión activa es más nueva o cambió el historial (empate de versión activa sin
 * historial nuevo ⇒ no escribir, y el eco de otro medio no reescribe lo mismo).
 */
export function debeEscribirArchivo(
  actual: ArchivoDirectivas | undefined,
  nuevo: ArchivoDirectivas,
): boolean {
  if (!actual) return true;
  const vActual = actual.activa ?? -1;
  const vNuevo = nuevo.activa ?? -1;
  if (vNuevo !== vActual) return vNuevo > vActual;
  return JSON.stringify(nuevo.historial) !== JSON.stringify(actual.historial);
}

/** Directiva activa de un archivo, si su versión y su estado cuadran. */
export function directivaActivaDe(
  archivo: ArchivoDirectivas | undefined,
): DirectivaCapa | undefined {
  if (!archivo || archivo.activa === null) return undefined;
  return archivo.historial.find(
    (d) => d.version === archivo.activa && d.estado === "activa",
  );
}

/** Lectura defensiva de la clave única: sin `window`, JSON roto o basura → vacío. */
function leerRegistro(): Record<string, ArchivoDirectivas> {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(CLAVE_CAPAS_DIRECTIVAS);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!esObjeto(parsed)) return {};
    const registro: Record<string, ArchivoDirectivas> = {};
    for (const [capa, valor] of Object.entries(parsed)) {
      const normalizado = normalizarArchivoDirectivas(valor);
      if (normalizado) registro[capa] = normalizado;
    }
    return registro;
  } catch {
    return {};
  }
}

/** Todas las directivas guardadas, por capa; lectura defensiva (JSON roto → vacío). */
export function leerDirectivas(): Record<string, ArchivoDirectivas> {
  return leerRegistro();
}

/** Directiva activa de una capa, o undefined si no la hay. */
export function directivaActiva(capa: string): DirectivaCapa | undefined {
  return directivaActivaDe(leerRegistro()[capa]);
}

/** Guarda el archivo de una capa si toca; emite `starseed:capas-directivas`. */
export function guardarDirectivas(capa: string, archivo: ArchivoDirectivas): boolean {
  try {
    if (typeof window === "undefined") return false;
    const limpio = normalizarArchivoDirectivas(archivo);
    if (!limpio || limpio.capa !== capa) return false;
    const registro = leerRegistro();
    const previo = registro[capa];
    if (!debeEscribirArchivo(previo, limpio)) return false;
    registro[capa] = limpio;
    window.localStorage.setItem(CLAVE_CAPAS_DIRECTIVAS, JSON.stringify(registro));
    window.dispatchEvent(new Event(EVENTO_CAPAS_DIRECTIVAS));
    return true;
  } catch {
    return false;
  }
}
