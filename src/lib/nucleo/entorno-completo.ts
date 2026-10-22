// StarSeed OS — Núcleo · Entorno completo.
// Guarda, duplica y comparte el entorno de un perfil con la misma revisión que
// un paquete. Solo viajan claves de `SYNCED_KEYS`; `NEVER_SYNCED_*` no sale
// nunca. Los volúmenes van por referencia (manifiesto por bandas), sin contenido.
// Módulo PURO: sin red, sin disco, sin `node:*`. Lo importa el cliente.
import { SYNCED_KEYS, isNeverSyncedKey } from "@/lib/settings-sync";
import type { DependenciasNucleo, PaqueteSistema, Revision } from "./paquete-sistema";
import { detectarSecretos, revisar } from "./paquete-sistema";
export const VERSION_ENTORNO = 1;
export interface VolumenEntorno { id: string; raiz: string }
export interface EntornoCompleto {
  version: number; nombre: string; paquete: PaqueteSistema;
  ajustes: Record<string, unknown>; volumenes: VolumenEntorno[];
}
export interface LectorAjustes { leer: (clave: string) => string | null }
export interface EscritorAjustes extends LectorAjustes {
  escribir: (clave: string, valor: unknown) => void;
}
const CLAVES: readonly string[] = SYNCED_KEYS;
function esClaveSincronizable(clave: string): boolean {
  return CLAVES.includes(clave) && !isNeverSyncedKey(clave);
}
function clonar<T>(valor: T): T { return structuredClone(valor); }

/** Captura solo claves sincronizadas; los volúmenes van por referencia. */
export function capturarEntorno(
  lector: LectorAjustes, paquete: PaqueteSistema, volumenes: VolumenEntorno[],
): EntornoCompleto {
  const ajustes: Record<string, unknown> = {};
  for (const clave of CLAVES) {
    if (!esClaveSincronizable(clave)) continue;
    const crudo = lector.leer(clave);
    if (crudo === null) continue;
    try { ajustes[clave] = JSON.parse(crudo); }
    catch { ajustes[clave] = crudo; }
  }
  return {
    version: VERSION_ENTORNO, nombre: paquete.nombre, paquete: clonar(paquete),
    ajustes, volumenes: volumenes.map((v) => ({ id: v.id, raiz: v.raiz })),
  };
}
/** Revisa paquete, secretos de ajustes y claves prohibidas. Sin guardianes del
 *  núcleo, `revisar` falla cerrado: nada se declara instalable. */
export function revisarEntorno(
  entorno: EntornoCompleto, deps: DependenciasNucleo | null = null,
): { seguro: boolean; instalable: boolean; motivos: string[]; revisionPaquete: Revision } {
  const revisionPaquete = revisar(entorno.paquete, deps);
  const motivos: string[] = revisionPaquete.violaciones.map((v) => v.que);
  for (const secreto of revisionPaquete.secretosDetectados) {
    motivos.push(`secreto en el paquete: ${secreto}`);
  }
  for (const secreto of detectarSecretosEnAjustes(entorno.ajustes)) {
    motivos.push(`secreto detectado en ajustes: ${secreto}`);
  }
  for (const clave of Object.keys(entorno.ajustes)) {
    if (isNeverSyncedKey(clave)) motivos.push(`clave prohibida en ajustes: ${clave}`);
    else if (!CLAVES.includes(clave)) motivos.push(`clave no sincronizable: ${clave}`);
  }
  const seguro = motivos.length === 0;
  return { seguro, instalable: seguro, motivos, revisionPaquete };
}
/** Duplica con otro nombre sin compartir referencias. */
export function duplicarEntorno(e: EntornoCompleto, nombre: string): EntornoCompleto {
  return {
    version: e.version ?? VERSION_ENTORNO, nombre,
    paquete: { ...clonar(e.paquete), nombre }, ajustes: clonar(e.ajustes),
    volumenes: e.volumenes.map((v) => ({ id: v.id, raiz: v.raiz })),
  };
}
/** Qué claves de ajustes cambian entre dos entornos, para replicar. */
export function diferencia(
  a: EntornoCompleto, b: EntornoCompleto,
): { anadidas: string[]; quitadas: string[]; cambiadas: string[]; iguales: string[] } {
  const clavesA = Object.keys(a.ajustes);
  const clavesB = Object.keys(b.ajustes);
  const d = { anadidas: [] as string[], quitadas: [] as string[], cambiadas: [] as string[], iguales: [] as string[] };
  for (const clave of clavesB) {
    if (!clavesA.includes(clave)) d.anadidas.push(clave);
    else if (JSON.stringify(a.ajustes[clave]) === JSON.stringify(b.ajustes[clave])) d.iguales.push(clave);
    else d.cambiadas.push(clave);
  }
  for (const clave of clavesA) if (!clavesB.includes(clave)) d.quitadas.push(clave);
  return d;
}
/** Aplica solo claves sincronizables y devuelve cómo deshacer. */
export function aplicar(
  e: EntornoCompleto, acciones: EscritorAjustes,
): { deshacer: () => void; cambios: string[]; omitidas: string[] } {
  const cambios: string[] = [];
  const omitidas: string[] = [];
  const respaldo: Record<string, string | null> = {};
  for (const clave of Object.keys(e.ajustes)) {
    if (!esClaveSincronizable(clave)) { omitidas.push(clave); continue; }
    respaldo[clave] = acciones.leer(clave);
    acciones.escribir(clave, clonar(e.ajustes[clave]));
    cambios.push(clave);
  }
  const deshacer = (): void => {
    for (const clave of [...cambios].reverse()) {
      const original = respaldo[clave];
      if (original === null) acciones.escribir(clave, null);
      else {
        try { acciones.escribir(clave, JSON.parse(original)); }
        catch { acciones.escribir(clave, original); }
      }
    }
  };
  return { deshacer, cambios, omitidas };
}

/** Reutiliza `detectarSecretos` sobre los ajustes: una sonda con forma de
 *  paquete cuyo único contenido variable son los ajustes. */
function detectarSecretosEnAjustes(ajustes: Record<string, unknown>): string[] {
  const sonda: PaqueteSistema = {
    id: "", nombre: "", autor: { perfil: "", nombre: "" }, creadoEn: 0,
    uiSpec: { version: 1, superficie: "", bloques: [] }, apariencia: ajustes,
    permisosPedidos: [], requiere: [], version: 1,
  };
  return detectarSecretos(sonda);
}
