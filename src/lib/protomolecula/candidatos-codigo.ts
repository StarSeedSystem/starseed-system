/**
 * Protomolécula · CANDIDATOS DE CÓDIGO (PM1010F7A, contrato §8.2). La IA PROPONE cambios para
 * una capa `codigo` de la molécula: nada se ejecuta, la capa no se toca y solo una persona con
 * la mano acapta. El destino es SIEMPRE una capa de la molécula: nunca un archivo del OS ni el
 * núcleo (`nucleo/*`). Módulo PURO: sin React, sin red y sin `node:*`.
 */
import { decidir } from "./permisos";
import type { Autor, Molecula, Origen, Rol } from "./tipos";

/** Un cambio de código propuesto y revisable, por capa, con avisos y estado. */
export interface Candidato {
  id: string; capaId: string; lenguajeOrigen: string; lenguajeDestino?: string;
  propuesto: string; original: string; autor: Autor;
  estado: "propuesto" | "aceptado" | "rechazado";
  avisos: string[];
}

/** Lo que una IA deja al proponer (el id se genera aquí si no llega). */
export interface EntradaCandidato {
  capaId: string; original: string; propuesto: string; autor: Autor;
  lenguajeOrigen?: string; lenguajeDestino?: string; id?: string;
}

/** Quien acepta y sobre qué molécula: `origen` «mano» exige aplicar-código por mano. */
export interface ContextoAceptacion {
  rol: Rol | null; origen: Origen; molecula: Molecula; ahora?: number;
}

export type ResultadoAceptacion =
  | { ok: true; molecula: Molecula; candidato: Candidato; avisos: string[] }
  | { ok: false; motivo: string };

/** El contenido de una capa `codigo` vive en `Molecula.valores` (texto de la molécula, no un archivo). */
export const claveContenido = (capaId: string): string => `${capaId}::codigo`;

/* Avisos (los escribe `revisar`). Un aviso «secreto» BLOQUEA la aceptación; el resto solo avisa. */
export const avisosDeSecreto = (a: string): boolean => a.startsWith("secreto");
const AVISO_SECRETO = "secreto: contiene lo que parece una clave o un token con forma real.";
const AVISO_EJECUCION = "peligro: ejecutaría código (eval, new Function, import dinámico o un módulo node:) y el núcleo no hace eso.";
const AVISO_RUTA = "cuidado: cita rutas del disco local, que no viajan y delatan el aparato.";
/* Los secretos de ejemplo se construyen en las pruebas en tiempo de ejecución: GitHub bloquea empujes con claves con forma real. */
const PATRONES: readonly { p: RegExp; a: string }[] = [
  { p: /\bsk-[A-Za-z0-9]{8,}/, a: AVISO_SECRETO }, { p: /\bgsk_[A-Za-z0-9]{8,}/, a: AVISO_SECRETO },
  { p: /\bBearer\s+[A-Za-z0-9._~-]{8,}/, a: AVISO_SECRETO },
  { p: /(?:^|[\s"'])\/(?:Users|home|root|tmp|var|etc|opt)\//, a: AVISO_RUTA },
  { p: /[A-Za-z]:\\(?:Users|Windows)\//, a: AVISO_RUTA },
  { p: /\beval\s*\(/, a: AVISO_EJECUCION }, { p: /\bnew\s+Function\s*\(/, a: AVISO_EJECUCION },
  { p: /\bimport\s*\(/, a: AVISO_EJECUCION }, { p: /(?:^|["'])node:\/?/, a: AVISO_EJECUCION },
];

/** Marca los avisos del texto propuesto: sin ejecutar nada y sin repetir lo encontrado. */
export const revisar = (propuesto: string): string[] => {
  const avisos: string[] = [];
  for (const { p, a } of PATRONES) if (p.test(propuesto) && !avisos.includes(a)) avisos.push(a);
  return avisos;
};
export const diff = (original: string, propuesto: string): string[] => [];
export const listarCandidatos = (): Candidato[] => [];
export const limpiarCandidatos = (): void => {};
export const rechazar = (id: string): Candidato | undefined => undefined;
export const proponer = (e: EntradaCandidato, deps: { nuevoId?: () => string } = {}): Candidato =>
  ({ ...e, lenguajeOrigen: "", id: "", estado: "propuesto", avisos: [] });
export const aceptar = (c: Candidato, ctx: ContextoAceptacion): ResultadoAceptacion =>
  ({ ok: false, motivo: "" });
