// StarSeed OS — Núcleo · Entorno completo.
//
// Guarda, duplica, replica y comparte el entorno de un perfil con la MISMA
// revisión que un paquete: los ajustes que transporta son SOLO los
// `SYNCED_KEYS` (lo que ya viaja con la cuenta: escritorios, dock, widgets,
// apariencia…); una clave de `NEVER_SYNCED_KEYS` jamás entra y, si llega
// envuelta a mano, `revisarEntorno` la detecta → NO instalable. Los volúmenes
// van POR REFERENCIA ({id, raiz}, manifiesto por bandas), nunca su contenido.
//
// Módulo PURO: sin red, sin disco, sin `node:*`. Lo importa el cliente.

import { SYNCED_KEYS, isNeverSyncedKey } from "@/lib/settings-sync";
import type { DependenciasNucleo, PaqueteSistema, Revision } from "./paquete-sistema";
import { CLAVES_PROHIBIDAS, revisar } from "./paquete-sistema";

export const VERSION_ENTORNO = 1;

export interface VolumenEntorno {
  /** Identidad lógica del volumen (la del manifiesto por bandas). */
  id: string;
  /** Raíz simbólica del volumen. Ruta RELATIVA, no del disco de nadie. */
  raiz: string;
}

export interface EntornoCompleto {
  version: number;
  nombre: string;
  paquete: PaqueteSistema;
  ajustes: Record<string, unknown>;
  volumenes: VolumenEntorno[];
}

/** Lectura de ajustes del medio actual (el cliente pasa su almacenamiento). */
export interface LectorAjustes {
  leer: (clave: string) => string | null;
}

export interface EscritorAjustes extends LectorAjustes {
  /** `escribir(clave, null)` significa quitar esa clave del medio. */
  escribir: (clave: string, valor: unknown) => void;
}

/** Lo que devuelve la revisión de un entorno. */
export interface RevisionEntorno {
  seguro: boolean;
  motivos: string[];
  revisionPaquete: Revision;
}

/**
 * Captura el entorno de un perfil: lee SOLO las claves de `SYNCED_KEYS` (con
 * la guardia extra de `isNeverSyncedKey`) y anota los volúmenes por
 * referencia. El valor crudo se desarman suave: si era JSON se guarda como
 * dato; si no, como texto.
 */
export function capturarEntorno(
  lector: LectorAjustes,
  paquete: PaqueteSistema,
  volumenes: VolumenEntorno[],
): EntornoCompleto {
  const ajustes: Record<string, unknown> = {};
  for (const clave of SYNCED_KEYS) {
    // Defensa en profundidad: el recorrido ya es «solo SYNCED_KEYS», pero
    // la guardia no se salta: si el día de mañana una clave con secreto
    // entra en la lista, aquí no embarca.
    if (isNeverSyncedKey(clave)) continue;
    const crudo = lector.leer(clave);
    if (crudo === null) continue;
    try {
      ajustes[clave] = JSON.parse(crudo);
    } catch {
      ajustes[clave] = crudo;
    }
  }
  return {
    version: VERSION_ENTORNO,
    nombre: paquete.nombre,
    paquete,
    ajustes,
    // Por referencia: id y raiz del manifiesto, NUNCA el contenido.
    volumenes: volumenes.map((v) => ({ id: v.id, raiz: v.raiz })),
  };
}

/**
 * La revisión de un paquete, extendida al ENTORNO: `revisar` del paquete +
 * secretos en los ajustes + claves prohibidas → no instalable, con sus
 * motivos. Sin guardianes registrados (`revisar` falla CERRADO) tampoco.
 * Nunca lanza; lo que va mal, lo cuenta.
 */
export function revisarEntorno(
  entorno: EntornoCompleto,
  deps?: DependenciasNucleo,
): RevisionEntorno {
  const rev = revisar(entorno.paquete, deps);
  const motivos: string[] = [];
  if (!rev.seguro) {
    motivos.push(...rev.violaciones.map((v) => v.que));
  }
  if (rev.secretosDetectados.length > 0) {
    motivos.push(
      `secreto detectado en el paquete: ${rev.secretosDetectados.join("; ")}`,
    );
  }
  const secretosAjustes = detectarSecretosSobreAjustes(entorno.ajustes);
  if (secretosAjustes.length > 0) {
    motivos.push(
      `secreto detectado en los ajustes: ${secretosAjustes.join("; ")}`,
    );
  }
  const prohibidas = Object.keys(entorno.ajustes).filter(isNeverSyncedKey);
  if (prohibidas.length > 0) {
    motivos.push(
      `claves prohibidas en los ajustes (jamás viajan): ${prohibidas.join(", ")}`,
    );
  }
  const seguro = rev.seguro && secretosAjustes.length === 0 && prohibidas.length === 0;
  return { seguro, motivos, revisionPaquete: rev };
}

/** Copia JSON de un dato puro; si no se serializa, devuelve el mismo valor (la copia honesta: no se inventa). */
function copiaProfunda<T>(valor: T): T {
  try {
    return JSON.parse(JSON.stringify(valor)) as T;
  } catch {
    return valor;
  }
}

/**
 * Duplica un entorno con un nombre nuevo. Nada comparte referencias con el
 * original: paquete, ajustes y volúmenes son copias nuevas, así que editar
 * la copia no toca el original ni al revés.
 */
export function duplicarEntorno(
  e: EntornoCompleto,
  nombre: string,
): EntornoCompleto {
  return {
    version: e.version,
    nombre,
    paquete: copiaProfunda(e.paquete) as PaqueteSistema,
    ajustes: copiaProfunda(e.ajustes) as Record<string, unknown>,
    volumenes: e.volumenes.map((v) => ({ ...v })),
  };
}

/** Qué cambió de un entorno a otro en los ajustes (para replicar). */
export function diferencia(
  a: EntornoCompleto,
  b: EntornoCompleto,
): { anadidas: string[]; quitadas: string[]; cambiadas: string[]; iguales: string[] } {
  const anadidas: string[] = [];
  const quitadas: string[] = [];
  const cambiadas: string[] = [];
  const iguales: string[] = [];
  for (const [clave, valor] of Object.entries(a.ajustes)) {
    const enB = Object.hasOwn(b.ajustes, clave);
    if (!enB) {
      quitadas.push(clave);
      continue;
    }
    // Se compara como DATO (JSON), no como texto: `1` y `"1"` no son iguales.
    const sa = JSON.stringify(valor);
    const sb = JSON.stringify(b.ajustes[clave]);
    if (sa === sb) iguales.push(clave);
    else cambiadas.push(clave);
  }
  for (const clave of Object.keys(b.ajustes)) {
    if (!Object.hasOwn(a.ajustes, clave)) anadidas.push(clave);
  }
  return { anadidas, quitadas, cambiadas, iguales };
}

/**
 * Aplica los ajustes de un entorno al medio, pero solo por donde ya viajaron:
 * claves de `SYNCED_KEYS` que no estén prohibidas (lo que `revisarEntorno`
 * ya aprobó). Devuelve cómo deshacer: recuerda el valor previo de cada clave
 * aplicada y lo restaura — una que no estaba, vuelve a quitarse. Las claves
 * fuera de SYNCED_KEYS o prohibidas no se escriben y van en `omitidas`.
 */
export function aplicar(
  e: EntornoCompleto,
  escritor: EscritorAjustes,
): { cambios: string[]; omitidas: string[]; deshacer: () => void } {
  const cambios: string[] = [];
  const omitidas: string[] = [];
  const respaldo: Record<string, string | null> = {};
  for (const clave of Object.keys(e.ajustes)) {
    if (!(SYNCED_KEYS as readonly string[]).includes(clave) || isNeverSyncedKey(clave)) {
      // Ni viajó por aquí ni debe escribirse: honesto en `omitidas`.
      omitidas.push(clave);
      continue;
    }
    respaldo[clave] = escritor.leer(clave);
    escritor.escribir(clave, e.ajustes[clave]);
    cambios.push(clave);
  }
  return {
    cambios,
    omitidas,
    deshacer: () => {
      for (const clave of cambios) {
        const original = respaldo[clave];
        if (original === null) {
          escritor.escribir(clave, null);
          continue;
        }
        try {
          escritor.escribir(clave, JSON.parse(original));
        } catch {
          escritor.escribir(clave, original);
        }
      }
    },
  };
}

/** Nombre legible de cada patrón de `CLAVES_PROHIBIDAS`, en el mismo orden. */
const ETIQUETAS_AJUSTES: string[] = [
  "clave de API estilo «sk-»",
  "clave de API estilo «gsk_»",
  "cabecera de autorización «Bearer»",
  "mención a «api key»",
  "mención a «token»",
  "mención a «password»",
  "ruta absoluta de disco «/Users/…»",
  "ruta absoluta de disco «/home/…»",
];

/** Deja ver que hay algo sin volver a publicarlo entero (como en paquete-sistema). */
function enmascarar(coincidencia: string): string {
  const visible = coincidencia.slice(0, 4);
  return coincidencia.length <= 4 ? visible : `${visible}…(${coincidencia.length} caracteres)`;
}

/**
 * Rastrea los MISMOS patrones prohibidos del paquete (`CLAVES_PROHIBIDAS`)
 * sobre el JSON de los ajustes: claves de API, menciones a tokens y rutas
 * absolutas de disco. Devuelve descripciones enmascaradas, nunca el secreto
 * tal cual (preferimos un falso positivo a dejar salir una clave de casa).
 */
function detectarSecretosSobreAjustes(ajustes: Record<string, unknown>): string[] {
  let crudo: string;
  try {
    crudo = JSON.stringify(ajustes) ?? "";
  } catch {
    return ["los ajustes no se pueden serializar: imposible revisarlos"];
  }
  const hallazgos: string[] = [];
  CLAVES_PROHIBIDAS.forEach((patron, i) => {
    const encontrado = patron.exec(crudo);
    if (encontrado) {
      hallazgos.push(
        `${ETIQUETAS_AJUSTES[i] ?? patron.source}: «${enmascarar(encontrado[0])}»`,
      );
    }
  });
  return hallazgos;
}
