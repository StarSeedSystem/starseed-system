// StarSeed OS — Núcleo · Entorno completo.
//
// Guarda, duplica y comparte el entorno de un perfil con la misma revisión
// que un paquete. Solo las claves sincronizadas (`SYNCED_KEYS`) viajan;
// los volúmenes van por referencia (manifiesto por bandas), nunca su contenido.
//
// Módulo PURO: sin red, sin disco, sin `node:*`. Importa el cliente.

import { SYNCED_KEYS, NEVER_SYNCED_KEYS, isNeverSyncedKey } from "@/lib/settings-sync";
import type { PaqueteSistema, Revision } from "./paquete-sistema";
import { revisar, detectarSecretos, esInstalable } from "./paquete-sistema";

export interface VolumenEntorno {
  id: string;
  raiz: string;
}

export interface EntornoCompleto {
  version: number;
  nombre: string;
  paquete: PaqueteSistema;
  ajustes: Record<string, unknown>;
  volumenes: VolumenEntorno[];
}

export interface LectorAjustes {
  leer: (clave: string) => string | null;
}

/** Captura el entorno actual: solo claves de `SYNCED_KEYS`, nunca de `NEVER_SYNCED_KEYS`.
 *  Los volúmenes se toman por referencia (manifiesto por bandas), sin contenido. */
export function capturarEntorno(
  lector: LectorAjustes,
  paquete: PaqueteSistema,
  volumenes: VolumenEntorno[],
): EntornoCompleto {
  const ajustes: Record<string, unknown> = {};
  for (const clave of SYNCED_KEYS) {
    if (NEVER_SYNCED_KEYS.includes(clave)) continue;
    const valor = lector.leer(clave);
    if (valor !== null) {
      try {
        ajustes[clave] = JSON.parse(valor);
      } catch {
        ajustes[clave] = valor;
      }
    }
  }
  return {
    version: 1,
    nombre: paquete.nombre,
    paquete,
    ajustes,
    volumenes: volumenes.map((v) => ({ id: v.id, raiz: v.raiz })),
  };
}

/** Revisión de un entorno: la del paquete + secretos en ajustes + claves prohibidas. */
export function revisarEntorno(
  entorno: EntornoCompleto,
  deps?: { validarUiSpec?: (bruto: unknown) => { spec: import("./ui-spec").UiSpec | null; problemas: string[] }; validarContraInvariantes?: (cambio: import("./paquete-sistema").CambioDeInterfaz) => import("./invariantes").Violacion[] } | null,
): { seguro: boolean; motivos: string[]; revisionPaquete: Revision } {
  const revPaquete = revisar(entorno.paquete, deps as Parameters<typeof revisar>[1] ?? undefined);
  const secretosAjustes = detectarSecretosSobreAjustes(entorno.ajustes);
  const motivos: string[] = [];
  if (!revPaquete.seguro) {
    motivos.push(...revPaquete.violaciones.map((v) => v.que));
  }
  if (secretosAjustes.length > 0) {
    motivos.push(`secreto detectado en ajustes: ${secretosAjustes.join("; ")}`);
  }
  for (const clave of Object.keys(entorno.ajustes)) {
    if (NEVER_SYNCED_KEYS.includes(clave)) {
      motivos.push(`clave prohibida en ajustes: ${clave}`);
    }
  }
  const seguro = revPaquete.seguro && secretosAjustes.length === 0 && motivos.filter((m) => m.startsWith("clave prohibida")).length === 0;
  return { seguro, motivos, revisionPaquete: revPaquete };
}

/** Duplica un entorno con un nuevo nombre, sin compartir referencias en ajustes ni volúmenes. */
export function duplicarEntorno(e: EntornoCompleto, nombre: string): EntornoCompleto {
  return {
    version: e.version,
    nombre,
    paquete: { ...e.paquete, nombre },
    ajustes: { ...e.ajustes },
    volumenes: e.volumenes.map((v) => ({ id: v.id, raiz: v.raiz })),
  };
}

/** Diferencia entre dos entornos: qué claves de ajustes cambiaron, para replicar. */
export function diferencia(
  a: EntornoCompleto,
  b: EntornoCompleto,
): { anadidas: string[]; quitadas: string[]; cambiadas: string[]; iguales: string[] } {
  const clavesA = Object.keys(a.ajustes);
  const clavesB = Object.keys(b.ajustes);
  const anadidas: string[] = [];
  const quitadas: string[] = [];
  const cambiadas: string[] = [];
  const iguales: string[] = [];
  for (const clave of clavesB) {
    if (!clavesA.includes(clave)) {
      anadidas.push(clave);
    } else {
      const valA = JSON.stringify(a.ajustes[clave]);
      const valB = JSON.stringify(b.ajustes[clave]);
      if (valA === valB) iguales.push(clave);
      else cambiadas.push(clave);
    }
  }
  for (const clave of clavesA) {
    if (!clavesB.includes(clave)) quitadas.push(clave);
  }
  return { anadidas, quitadas, cambiadas, iguales };
}

export interface EscritorAjustes {
  escribir: (clave: string, valor: unknown) => void;
  leer: (clave: string) => string | null;
}

/** Aplica los ajustes del entorno; devuelve cómo deshacer. */
export function aplicar(
  e: EntornoCompleto,
  acciones: EscritorAjustes,
): { deshacer: () => void; cambios: string[] } {
  const cambios: string[] = [];
  const respaldo: Record<string, string | null> = {};
  for (const clave of Object.keys(e.ajustes)) {
    respaldo[clave] = acciones.leer(clave);
    acciones.escribir(clave, e.ajustes[clave]);
    cambios.push(clave);
  }
  return {
    deshacer: () => {
      for (const clave of cambios) {
        const original = respaldo[clave];
        if (original === null) {
          acciones.escribir(clave, null);
        } else {
          try {
            acciones.escribir(clave, JSON.parse(original));
          } catch {
            acciones.escribir(clave, original);
          }
        }
      }
    },
    cambios,
  };
}

function detectarSecretosSobreAjustes(ajustes: Record<string, unknown>): string[] {
  const hallazgos: string[] = [];
  try {
    const crudo = JSON.stringify(ajustes) ?? "";
    const patrones = [
      /\bsk-[A-Za-z0-9_-]{4,}/,
      /\bgsk_[A-Za-z0-9_-]{4,}/,
      /\bBearer\s+[A-Za-z0-9._~+/-]{6,}/i,
      /api[_-]?key/i,
      /\btokens?\b/i,
      /\bpass(?:word|wd)\b/i,
    ];
    const etiquetas = [
      "clave de API estilo «sk-»",
      "clave de API estilo «gsk_»",
      "cabecera «Bearer»",
      "mención a «api key»",
      "mención a «token»",
      "mención a «password»",
    ];
    patrones.forEach((patron, i) => {
      const encontrado = patron.exec(crudo);
      if (encontrado) {
        hallazgos.push(`${etiquetas[i] ?? patron.source}: «${encontrado[0].slice(0, 4)}…»`);
      }
    });
  } catch {
    hallazgos.push("no se pudo revisar los ajustes");
  }
  return hallazgos;
}
