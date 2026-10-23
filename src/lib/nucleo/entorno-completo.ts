// StarSeed OS — Núcleo · Entorno completo.
//
// Guarda, duplica, replica y comparte el entorno de un perfil con la misma
// revisión que un paquete. Solo viajan claves sincronizadas (`SYNCED_KEYS`);
// jamás las de `NEVER_SYNCED_KEYS`. Los volúmenes van por referencia
// (manifiesto por bandas), nunca su contenido.
//
// Módulo PURO: sin red, sin disco, sin `node:*`.

import { SYNCED_KEYS, SYNCED_PREFIXES, isNeverSyncedKey } from "@/lib/settings-sync";
import { CLAVES_PROHIBIDAS, revisar } from "./paquete-sistema";
import type { DependenciasNucleo, PaqueteSistema, Revision } from "./paquete-sistema";

export interface VolumenEntorno { id: string; raiz: string }

export interface EntornoCompleto {
  version: number;
  nombre: string;
  paquete: PaqueteSistema;
  ajustes: Record<string, unknown>;
  volumenes: VolumenEntorno[];
}

export interface LectorAjustes { leer: (clave: string) => string | null }
export interface EscritorAjustes extends LectorAjustes { escribir: (clave: string, valor: string | null) => void }

export const VERSION_ENTORNO = 1;

const clonar = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const sincronizable = (c: string): boolean =>
  !isNeverSyncedKey(c) && ((SYNCED_KEYS as readonly string[]).includes(c) || SYNCED_PREFIXES.some((p) => c.startsWith(p)));

function analizar(crudo: string): unknown {
  try { return JSON.parse(crudo); } catch { return crudo; }
}

/** Toma SOLO claves sincronizables presentes en `leer`; los volúmenes se copian por referencia. */
export function capturarEntorno(lector: LectorAjustes, paquete: PaqueteSistema, volumenes: VolumenEntorno[]): EntornoCompleto {
  const ajustes: Record<string, unknown> = {};
  for (const clave of SYNCED_KEYS) {
    const crudo = sincronizable(clave) ? lector.leer(clave) : null;
    if (crudo !== null) ajustes[clave] = analizar(crudo);
  }
  return {
    version: VERSION_ENTORNO,
    nombre: paquete.nombre,
    paquete: clonar(paquete),
    ajustes,
    volumenes: volumenes.map(({ id, raiz }) => ({ id, raiz })),
  };
}

export interface RevisionEntorno {
  instalable: boolean;
  motivos: string[];
  revisionPaquete: Revision;
}

/** Revisión del paquete + secretos y claves prohibidas en los ajustes. Falla cerrado. */
export function revisarEntorno(e: EntornoCompleto, deps?: DependenciasNucleo | null): RevisionEntorno {
  const revisionPaquete = deps === undefined ? revisar(e.paquete) : revisar(e.paquete, deps);
  const motivos: string[] = [];
  if (!revisionPaquete.seguro) {
    motivos.push(...revisionPaquete.violaciones.map((v) => v.que), ...revisionPaquete.secretosDetectados);
  }
  for (const clave of Object.keys(e.ajustes)) {
    if (isNeverSyncedKey(clave)) motivos.push(`clave prohibida en los ajustes: ${clave}`);
    else if (!sincronizable(clave)) motivos.push(`clave no sincronizable en los ajustes: ${clave}`);
  }
  let crudo = "";
  try { crudo = JSON.stringify(e.ajustes) ?? ""; } catch { motivos.push("los ajustes no se pueden serializar: imposible revisarlos"); }
  if (CLAVES_PROHIBIDAS.some((patron) => patron.test(crudo))) motivos.push("posible secreto en los ajustes (clave, token, contraseña o ruta de disco)");
  return { instalable: motivos.length === 0, motivos, revisionPaquete };
}

/** Copia profunda con otro nombre: nada se comparte por referencia con el original. */
export function duplicarEntorno(e: EntornoCompleto, nombre: string): EntornoCompleto {
  const copia = clonar(e);
  return { ...copia, nombre, paquete: { ...copia.paquete, nombre } };
}

export interface DiferenciaEntorno { anadidas: string[]; quitadas: string[]; cambiadas: string[]; iguales: string[] }

/** Qué claves de `b` hay que añadir, quitar o cambiar para que `a` quede como `b`. */
export function diferencia(a: EntornoCompleto, b: EntornoCompleto): DiferenciaEntorno {
  const d: DiferenciaEntorno = { anadidas: [], quitadas: [], cambiadas: [], iguales: [] };
  for (const c of Object.keys(b.ajustes)) {
    if (!(c in a.ajustes)) d.anadidas.push(c);
    else if (JSON.stringify(a.ajustes[c]) === JSON.stringify(b.ajustes[c])) d.iguales.push(c);
    else d.cambiadas.push(c);
  }
  d.quitadas = Object.keys(a.ajustes).filter((c) => !(c in b.ajustes));
  return d;
}

/** Escribe los ajustes del entorno (solo si es instalable) y devuelve cómo deshacer. */
export function aplicar(e: EntornoCompleto, destino: EscritorAjustes, deps?: DependenciasNucleo | null): { aplicado: boolean; motivos: string[]; cambios: string[]; deshacer: () => void } {
  const { instalable, motivos } = revisarEntorno(e, deps);
  if (!instalable) return { aplicado: false, motivos, cambios: [], deshacer: () => undefined };
  const previos = new Map<string, string | null>();
  const cambios = Object.keys(e.ajustes);
  for (const c of cambios) {
    previos.set(c, destino.leer(c));
    const v = e.ajustes[c];
    destino.escribir(c, typeof v === "string" ? v : JSON.stringify(v));
  }
  return { aplicado: true, motivos: [], cambios, deshacer: () => previos.forEach((p, c) => destino.escribir(c, p)) };
}
