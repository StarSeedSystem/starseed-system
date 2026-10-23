// StarSeed OS — Núcleo · Entorno completo.
//
// Guarda, duplica, replica y comparte el entorno de un perfil con la misma
// revisión que un paquete. Solo viajan claves de `SYNCED_KEYS`; los volúmenes
// van por referencia (manifiesto por bandas), nunca su contenido.
// Módulo PURO: sin red, sin disco, sin `node:*` (lo importa el cliente).

import { SYNCED_KEYS, isNeverSyncedKey } from "@/lib/settings-sync";
import { detectarSecretos, revisar } from "./paquete-sistema";
import type { DependenciasNucleo, PaqueteSistema, Revision } from "./paquete-sistema";

export interface VolumenEntorno {
  id: string;
  raiz: string;
}

/** `ajustes` guarda el texto crudo de cada clave, para que aplicar y deshacer sean exactos. */
export interface EntornoCompleto {
  version: number;
  nombre: string;
  paquete: PaqueteSistema;
  ajustes: Record<string, string>;
  volumenes: VolumenEntorno[];
}

export interface LectorAjustes {
  leer: (clave: string) => string | null;
}

export interface EscritorAjustes extends LectorAjustes {
  /** `null` borra la clave. */
  escribir: (clave: string, valor: string | null) => void;
}

export interface RevisionEntorno {
  instalable: boolean;
  motivos: string[];
  revision: Revision;
}

export const VERSION_ENTORNO = 1;

const permitida = (clave: string): boolean => !isNeverSyncedKey(clave);

/** Toma solo las claves sincronizadas y permitidas; los volúmenes, solo su referencia. */
export function capturarEntorno(
  lector: LectorAjustes,
  paquete: PaqueteSistema,
  volumenes: readonly VolumenEntorno[],
): EntornoCompleto {
  const ajustes: Record<string, string> = {};
  for (const clave of SYNCED_KEYS) {
    if (!permitida(clave)) continue;
    const valor = lector.leer(clave);
    if (valor !== null) ajustes[clave] = valor;
  }
  return {
    version: VERSION_ENTORNO,
    nombre: paquete.nombre,
    paquete: structuredClone(paquete),
    ajustes,
    volumenes: volumenes.map((v) => ({ id: v.id, raiz: v.raiz })),
  };
}

/** La revisión del paquete + secretos en los ajustes + claves prohibidas. */
export function revisarEntorno(e: EntornoCompleto, deps?: DependenciasNucleo | null): RevisionEntorno {
  const revision = deps === undefined ? revisar(e.paquete) : revisar(e.paquete, deps);
  const motivos = [...revision.violaciones.map((v) => v.que), ...revision.secretosDetectados];
  // Los patrones de secreto del paquete, aplicados a los ajustes.
  const enAjustes = detectarSecretos({ ...e.paquete, apariencia: e.ajustes });
  for (const s of enAjustes) {
    if (!revision.secretosDetectados.includes(s)) motivos.push(`ajustes: ${s}`);
  }
  for (const clave of Object.keys(e.ajustes)) {
    if (!permitida(clave)) motivos.push(`clave prohibida en los ajustes: ${clave}`);
  }
  return { instalable: revision.seguro && motivos.length === 0, motivos, revision };
}

/** Copia independiente con otro nombre: no comparte ninguna referencia con el original. */
export function duplicarEntorno(e: EntornoCompleto, nombre: string): EntornoCompleto {
  const copia = structuredClone(e);
  return { ...copia, nombre, paquete: { ...copia.paquete, nombre } };
}

export interface DiferenciaEntorno {
  anadidas: string[];
  quitadas: string[];
  cambiadas: string[];
}

/** Qué claves cambian al pasar de `a` a `b` (para replicar). */
export function diferencia(a: EntornoCompleto, b: EntornoCompleto): DiferenciaEntorno {
  const tiene = (o: Record<string, string>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  return {
    anadidas: Object.keys(b.ajustes).filter((k) => !tiene(a.ajustes, k)),
    quitadas: Object.keys(a.ajustes).filter((k) => !tiene(b.ajustes, k)),
    cambiadas: Object.keys(b.ajustes).filter((k) => tiene(a.ajustes, k) && a.ajustes[k] !== b.ajustes[k]),
  };
}

/** Escribe los ajustes del entorno (las claves prohibidas se ignoran) y devuelve cómo deshacer. */
export function aplicar(e: EntornoCompleto, destino: EscritorAjustes): { cambios: string[]; deshacer: () => void } {
  const respaldo = new Map<string, string | null>();
  for (const [clave, valor] of Object.entries(e.ajustes)) {
    if (!permitida(clave)) continue;
    respaldo.set(clave, destino.leer(clave));
    destino.escribir(clave, valor);
  }
  return {
    cambios: [...respaldo.keys()],
    deshacer: () => respaldo.forEach((previo, clave) => destino.escribir(clave, previo)),
  };
}
