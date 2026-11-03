/**
 * Almacén de directivas aprendidas por la automejora Meta^n de las capas (MTN1027C).
 * Cliente puro: sin `node:*`, sin red ni relojes. La fuente de verdad del formato es
 * `./directivas.ts` y el contrato `architecture/automejora-meta-n.md` §3–§4.
 *
 * La clave viaja con la cuenta: está registrada en `settings-sync.ts` y su evento en
 * `sync/realtime-sync.ts` (igual que `starseed.mausbot.v1`). Toda lectura es defensiva.
 */
import type { ArchivoDirectivas, DirectivaCapa } from "./directivas";

/** Clave de localStorage donde se guardan las directivas por capa. */
export const DIRECTIVAS_KEY = "starseed.capas.directivas.v1";

/** Evento emitido cuando se actualizan las directivas de una capa. */
export const DIRECTIVAS_EVENT = "starseed:capas-directivas";

type AlmacenDirectivas = Record<string, ArchivoDirectivas>;

const almacen = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Navegador con almacenamiento bloqueado: se comporta como si no hubiera dato.
    return null;
  }
};

const leerTodo = (disco: Storage): AlmacenDirectivas => {
  try {
    const raw = disco.getItem(DIRECTIVAS_KEY);
    if (!raw) return {};
    const dato: unknown = JSON.parse(raw);
    if (!dato || typeof dato !== "object" || Array.isArray(dato)) return {};
    return dato as AlmacenDirectivas;
  } catch {
    return {};
  }
};

/** Lee las directivas de una capa. `null` si no hay dato legible. */
export function leerDirectivas(capa: string): ArchivoDirectivas | null {
  const disco = almacen();
  if (!disco) return null;
  const archivo = leerTodo(disco)[capa];
  if (!archivo || typeof archivo !== "object") return null;
  return archivo;
}

/**
 * Guarda las directivas de una capa. Solo escribe si su versión activa es más nueva
 * o si cambió el historial (p. ej. una retirada o una vuelta atrás). Devuelve si guardó.
 */
export function guardarDirectivas(
  capa: string,
  archivo: ArchivoDirectivas,
): boolean {
  const disco = almacen();
  if (!disco) return false;
  try {
    const todo = leerTodo(disco);
    const existe = todo[capa];
    const versionNueva =
      existe === undefined ||
      (archivo.activa !== null &&
        (existe.activa === null || archivo.activa > existe.activa));
    const historialCambio =
      existe === undefined ||
      JSON.stringify(archivo.historial) !== JSON.stringify(existe.historial);
    if (!versionNueva && !historialCambio) return false;
    todo[capa] = archivo;
    disco.setItem(DIRECTIVAS_KEY, JSON.stringify(todo));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(DIRECTIVAS_EVENT));
    }
    return true;
  } catch {
    // JSON imposible de serializar o cuota llena: no se actualiza.
    return false;
  }
}

/** La directiva activa de una capa, si su versión y su estado cuadran. */
export function directivaActiva(capa: string): DirectivaCapa | undefined {
  const archivo = leerDirectivas(capa);
  if (!archivo || !Array.isArray(archivo.historial)) return undefined;
  if (archivo.activa === null) return undefined;
  return archivo.historial.find(
    (d) => d.version === archivo.activa && d.estado === "activa",
  );
}
