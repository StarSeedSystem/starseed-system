/**
 * Manifiesto de copias de las memorias de los cerebros (Ola 1025R · INF1025H).
 * ============================================================================
 * Spacedrive identifica cada archivo por el hash de su contenido (BLAKE3) y
 * así sabe qué copias hay en qué discos y nubes. Aquí se hace lo mismo para
 * las memorias, en puro TypeScript: la huella es SHA-256 de Web Crypto
 * (`globalThis.crypto.subtle`), no `node:crypto`, para que sirva también en
 * el navegador. BLAKE3 no está en el navegador sin dependencias; por eso se
 * usa SHA-256.
 *
 * Reglas del OS que este módulo respeta: «el más nuevo gana» (un empate no
 * escribe nada), «ningún borrado se propaga solo» (la limpieza solo PROPONE y
 * siempre pide confirmación) y nunca se quita la última copia ni la única
 * copia local. Puro: sin red, sin disco y sin reloj; los tiempos llegan en
 * cada copia.
 */

export type DestinoMemoria = "local" | "starseed" | "gdrive" | "p2p" | "externo";

export interface CopiaMemoria {
  cerebroId: string;
  memoriaId: string;
  destino: DestinoMemoria;
  huella: string;
  bytes: number;
  actualizadoMs: number | null;
}

export interface GrupoHuella {
  huella: string;
  copias: CopiaMemoria[];
  destinos: DestinoMemoria[];
  ultimaCopia: CopiaMemoria | null;
  divergente: boolean;
}

export interface ManifiestoMemoria {
  grupos: GrupoHuella[];
  totalCopias: number;
  totalMemorias: number;
  conCopiaUnica: number;
  divergentes: number;
}

export interface DivergenciaMemoria {
  cerebroId: string;
  memoriaId: string;
  huellas: string[];
  destinos: DestinoMemoria[];
  masNueva: CopiaMemoria | null;
  empate: boolean;
}

export interface PropuestaLimpieza {
  cerebroId: string;
  memoriaId: string;
  destino: DestinoMemoria;
  huella: string;
  copia: CopiaMemoria;
  motivo: string;
  requiereConfirmacion: true;
}

const ORDEN_DESTINOS: readonly DestinoMemoria[] = ["local", "starseed", "gdrive", "p2p", "externo"];

export async function huellaContenido(texto: string): Promise<string> {
  throw new Error("pendiente");
}

export function construirManifiesto(copias: CopiaMemoria[]): ManifiestoMemoria {
  throw new Error("pendiente");
}

export function divergencias(m: ManifiestoMemoria): DivergenciaMemoria[] {
  throw new Error("pendiente");
}

export function proponerLimpieza(m: ManifiestoMemoria): PropuestaLimpieza[] {
  throw new Error("pendiente");
}

export function resumenManifiesto(m: ManifiestoMemoria): string {
  throw new Error("pendiente");
}
