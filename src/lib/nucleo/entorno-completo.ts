// StarSeed OS — Núcleo · Entorno completo (ENT1020Ab · Ola 1020U).
// ─────────────────────────────────────────────────────────────────────────────
// Guardar, duplicar, replicar y compartir el entorno de un perfil con la MISMA
// revisión que un paquete (architecture/repos-libreria-1020d.md §2: «gallery-dl no
// guarda entornos; esto sí»).
//
// El entorno son DATOS: el paquete, los ajustes que la cuenta ya sincroniza y los
// volúmenes POR REFERENCIA (manifiesto por bandas). Nunca viaja el contenido de un
// volumen, ni una clave, ni la ruta del disco de nadie.
//
// Módulo PURO: sin red, sin disco, sin `node:*`. El almacén va inyectado y las
// claves salen de la lista REAL de la cuenta (`@/lib/settings-sync`).

import { CLAVES_PROHIBIDAS, esInstalable, revisar, type DependenciasNucleo, type PaqueteSistema, type Revision } from "@/lib/nucleo/paquete-sistema";
import { SYNCED_KEYS, isNeverSyncedKey } from "@/lib/settings-sync";

/** Versión del formato de entorno. Sube si cambia la forma, no el contenido. */
export const VERSION_ENTORNO = 1;

/** Un volumen del entorno: POR REFERENCIA (id y raíz), nunca su contenido. */
export interface VolumenEntorno { id: string; raiz: string; }

/** El entorno completo de un perfil: paquete + ajustes + volúmenes por referencia. */
export interface EntornoCompleto {
    version: number; nombre: string; paquete: PaqueteSistema;
    ajustes: Record<string, unknown>; volumenes: VolumenEntorno[];
}

/** El almacén de ajustes del perfil: valor crudo (JSON) o null si no está. */
export interface AlmacenAjustes { leer: (clave: string) => string | null; escribir: (clave: string, valor: string | null) => void; }

/** Copia profunda por JSON: los ajustes son datos (JSON), no código. */
function clonar<T>(valor: T): T {
    try { return JSON.parse(JSON.stringify(valor)) as T; } catch { return valor; }
}

/**
 * Captura el entorno del perfil: SOLO las claves que la cuenta ya sincroniza (dock,
 * widgets, apariencia…), nunca las prohibidas. Los volúmenes se copian por
 * referencia (id y raíz), nunca su contenido.
 */
export function capturarEntorno(almacen: AlmacenAjustes, paquete: PaqueteSistema, volumenes: VolumenEntorno[]): EntornoCompleto {
    const ajustes: Record<string, unknown> = {};
    for (const clave of SYNCED_KEYS.filter((c) => !isNeverSyncedKey(c))) {
        const crudo = almacen.leer(clave);
        if (crudo === null) continue;
        try { ajustes[clave] = JSON.parse(crudo) as unknown; } catch { ajustes[clave] = crudo; }
    }
    return { version: VERSION_ENTORNO, nombre: paquete.nombre, paquete: clonar(paquete), ajustes,
        volumenes: volumenes.map((v) => ({ id: v.id, raiz: v.raiz })) };
}

/** Duplica el entorno con otro nombre, sin compartir NI UN objeto con el original. */
export function duplicarEntorno(entorno: EntornoCompleto, nombre: string): EntornoCompleto {
    const ajustes: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(entorno.ajustes)) ajustes[clave] = clonar(valor);
    return { version: entorno.version, nombre, paquete: { ...clonar(entorno.paquete), nombre }, ajustes,
        volumenes: entorno.volumenes.map((v) => ({ id: v.id, raiz: v.raiz })) };
}

/** Los ocho patrones del núcleo, con su nombre legible (mismo orden). */
const ETIQUETAS: readonly string[] = ["«sk-»", "«gsk_»", "«Bearer»", "«api key»", "«token»", "«password»", "«/Users/…»", "«/home/…»"];

/** Rastrea en los ajustes los MISMOS patrones prohibidos que el paquete. */
export function detectarSecretosAjustes(ajustes: Record<string, unknown>): string[] {
    let crudo: string;
    try { crudo = JSON.stringify(ajustes) ?? ""; } catch { return ["los ajustes no se pueden revisar"]; }
    return CLAVES_PROHIBIDAS.flatMap((patron, i) => {
        const encontrado = patron.exec(crudo);
        return encontrado ? [`${ETIQUETAS[i] ?? patron.source}: «${encontrado[0].slice(0, 4)}…»`] : [];
    });
}

/**
 * Revisa el entorno entero: la revisión del paquete (invariantes, interfaz y secretos)
 * + los secretos de los ajustes + las claves prohibidas. Cada motivo dice POR QUÉ.
 */
export function revisarEntorno(entorno: EntornoCompleto, deps?: DependenciasNucleo | null): { instalable: boolean; motivos: string[]; secretosAjustes: string[]; revisionPaquete: Revision } {
    const revisionPaquete = revisar(entorno.paquete, deps);
    const secretosAjustes = detectarSecretosAjustes(entorno.ajustes);
    const motivos: string[] = [
        ...revisionPaquete.violaciones.map((v) => v.que),
        ...revisionPaquete.secretosDetectados.map((s) => `secreto en el paquete: ${s}`), ...secretosAjustes.map((s) => `secreto en los ajustes: ${s}`),
        ...Object.keys(entorno.ajustes).filter((c) => isNeverSyncedKey(c)).map((c) => `clave prohibida en los ajustes: «${c}»`),
    ];
    const instalable = esInstalable(revisionPaquete) && motivos.length === 0;
    return { instalable, motivos, secretosAjustes, revisionPaquete };
}

/** Qué claves cambian de `a` a `b`: lo que hay que replicar de `b` sobre `a`. */
export function diferencia(a: EntornoCompleto, b: EntornoCompleto): { anadidas: string[]; quitadas: string[]; cambiadas: string[]; iguales: string[] } {
    const clavesA = Object.keys(a.ajustes), clavesB = Object.keys(b.ajustes);
    const anadidas = clavesB.filter((c) => !(c in a.ajustes));
    const quitadas = clavesA.filter((c) => !(c in b.ajustes));
    const comunes = clavesA.filter((c) => c in b.ajustes);
    const cambiadas = comunes.filter((c) => JSON.stringify(a.ajustes[c]) !== JSON.stringify(b.ajustes[c]));
    const iguales = comunes.filter((c) => !cambiadas.includes(c));
    return { anadidas, quitadas, cambiadas, iguales };
}

/**
 * Aplica los ajustes del entorno al perfil y devuelve CÓMO deshacerlo: se guarda el
 * valor crudo de cada clave tocada y se vuelve a escribir tal cual. Las claves
 * prohibidas NO se escriben: pisarían los secretos del aparato.
 */
export function aplicar(entorno: EntornoCompleto, almacen: AlmacenAjustes): { cambios: string[]; omitidas: string[]; deshacer: () => void } {
    const respaldo: Array<[string, string | null]> = [], omitidas: string[] = [];
    for (const [clave, valor] of Object.entries(entorno.ajustes)) {
        if (isNeverSyncedKey(clave)) { omitidas.push(clave); continue; }
        respaldo.push([clave, almacen.leer(clave)]);
        // Como el motor de sincronización: los textos van tal cual, el resto como JSON.
        almacen.escribir(clave, typeof valor === "string" ? valor : JSON.stringify(valor) ?? "");
    }
    return { cambios: respaldo.map(([clave]) => clave), omitidas,
        deshacer: () => { for (const [clave, original] of respaldo) almacen.escribir(clave, original); } };
}
