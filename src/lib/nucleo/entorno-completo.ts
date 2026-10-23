// StarSeed OS — Núcleo · Entorno completo.
//
// Guarda, duplica, replica y comparte el entorno de un perfil con la misma
// revisión que un paquete. Solo viajan claves de `SYNCED_KEYS` (jamás las
// prohibidas) y los volúmenes van por referencia (manifiesto por bandas),
// nunca su contenido. Módulo PURO: sin red, sin disco, sin `node:*`.

import { SYNCED_KEYS, isNeverSyncedKey } from "@/lib/settings-sync";
import { CLAVES_PROHIBIDAS, revisar } from "./paquete-sistema";
import type { DependenciasNucleo, PaqueteSistema, Revision } from "./paquete-sistema";

export interface VolumenEntorno {
  id: string;
  raiz: string;
}

export interface EntornoCompleto {
  version: number;
  nombre: string;
  paquete: PaqueteSistema;
  /** Valor tal y como se guarda (texto crudo), por clave sincronizada. */
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
  revisionPaquete: Revision;
}

/** Toma SOLO claves de `SYNCED_KEYS` que no estén prohibidas; volúmenes por referencia. */
export function capturarEntorno(
  { leer }: LectorAjustes,
  paquete: PaqueteSistema,
  volumenes: readonly VolumenEntorno[],
): EntornoCompleto {
  const ajustes: Record<string, string> = {};
  for (const clave of SYNCED_KEYS) {
    if (isNeverSyncedKey(clave)) continue;
    const valor = leer(clave);
    if (valor !== null) ajustes[clave] = valor;
  }
  return {
    version: 1,
    nombre: paquete.nombre,
    paquete: structuredClone(paquete),
    ajustes,
    volumenes: volumenes.map(({ id, raiz }) => ({ id, raiz })),
  };
}

/** `revisar` del paquete + secretos en ajustes y volúmenes + claves prohibidas. */
export function revisarEntorno(e: EntornoCompleto, deps?: DependenciasNucleo | null): RevisionEntorno {
  const revisionPaquete = deps === undefined ? revisar(e.paquete) : revisar(e.paquete, deps);
  const motivos: string[] = [];
  if (!revisionPaquete.seguro) motivos.push(`el paquete no es seguro: ${revisionPaquete.resumen}`);
  for (const clave of Object.keys(e.ajustes)) {
    if (isNeverSyncedKey(clave)) motivos.push(`clave prohibida en los ajustes: ${clave}`);
    else if (!(SYNCED_KEYS as readonly string[]).includes(clave)) motivos.push(`clave no sincronizable: ${clave}`);
  }
  let crudo: string;
  try {
    crudo = JSON.stringify({ ajustes: e.ajustes, volumenes: e.volumenes });
  } catch {
    crudo = "";
    motivos.push("los ajustes no se pueden serializar: imposible revisarlos");
  }
  CLAVES_PROHIBIDAS.forEach((patron) => {
    const hallazgo = patron.exec(crudo);
    if (hallazgo) motivos.push(`posible secreto en ajustes o volúmenes: «${hallazgo[0].slice(0, 4)}…»`);
  });
  return { instalable: motivos.length === 0, motivos, revisionPaquete };
}

/** Copia independiente con otro nombre: no comparte ninguna referencia. */
export function duplicarEntorno(e: EntornoCompleto, nombre: string): EntornoCompleto {
  const copia = structuredClone(e);
  copia.nombre = nombre;
  copia.paquete.nombre = nombre;
  return copia;
}

/** Qué claves cambian al replicar `b` sobre `a`. */
export function diferencia(a: EntornoCompleto, b: EntornoCompleto) {
  const claves = new Set([...Object.keys(a.ajustes), ...Object.keys(b.ajustes)]);
  const res = { anadidas: [] as string[], quitadas: [] as string[], cambiadas: [] as string[], iguales: [] as string[] };
  for (const k of [...claves].sort()) {
    const enA = k in a.ajustes;
    const enB = k in b.ajustes;
    if (!enA) res.anadidas.push(k);
    else if (!enB) res.quitadas.push(k);
    else if (a.ajustes[k] === b.ajustes[k]) res.iguales.push(k);
    else res.cambiadas.push(k);
  }
  return res;
}

/** Escribe los ajustes del entorno y devuelve cómo dejarlo todo como estaba. */
export function aplicar(e: EntornoCompleto, { leer, escribir }: EscritorAjustes) {
  const previos = new Map<string, string | null>();
  for (const [clave, valor] of Object.entries(e.ajustes)) {
    if (isNeverSyncedKey(clave)) continue; // defensa en profundidad
    previos.set(clave, leer(clave));
    escribir(clave, valor);
  }
  return {
    cambios: [...previos.keys()],
    deshacer: () => previos.forEach((antes, clave) => escribir(clave, antes)),
  };
}
