/**
 * Almacén de las directivas de las capas en el navegador (MTN1027C).
 * Contrato: architecture/automejora-meta-n.md §4 — la clave `starseed.capas.directivas.v1`
 * viaja con la cuenta (SYNCED_KEYS en settings-sync.ts y su evento en realtime-sync.ts).
 * Valor: `Record<capa, ArchivoDirectivas>`, mismo formato que
 * `starseed_memory_root/aprendizaje/directivas/<capa>.json`.
 * Solo cliente y sin `node:*`; sin `window` (SSR) todo devuelve vacío. Lectura defensiva:
 * lo que llegue roto de otro medio se ignora, nunca rompe la página.
 */
import type { ArchivoDirectivas, DirectivaCapa } from "./directivas";

export type { ArchivoDirectivas, DirectivaCapa } from "./directivas";

/** Clave de localStorage (sincronizada con la cuenta). */
export const DIRECTIVAS_KEY = "starseed.capas.directivas.v1";
/** Evento al guardar o al llegar el valor de otro dispositivo. */
export const DIRECTIVAS_EVENT = "starseed:capas-directivas";

const ESTADOS = new Set(["activa", "propuesta", "anterior", "retirada"]);

function esDirectiva(d: unknown): d is DirectivaCapa {
  if (!d || typeof d !== "object") return false;
  const x = d as Record<string, unknown>;
  return (
    typeof x.capa === "string" && typeof x.version === "number" && Number.isFinite(x.version) &&
    typeof x.texto === "string" && typeof x.sha256 === "string" &&
    typeof x.acierto === "number" && typeof x.base === "number" && typeof x.n === "number" &&
    typeof x.fecha === "string" && typeof x.origen === "string" &&
    typeof x.estado === "string" && ESTADOS.has(x.estado)
  );
}

/** Normaliza un archivo leído; null si no tiene la forma del contrato. */
function normalizarArchivo(capa: string, valor: unknown): ArchivoDirectivas | null {
  if (!valor || typeof valor !== "object") return null;
  const x = valor as Record<string, unknown>;
  if (x.v !== 1 || !Array.isArray(x.historial)) return null;
  const activa = typeof x.activa === "number" && Number.isFinite(x.activa) ? x.activa : null;
  if (x.activa !== null && activa === null) return null;
  return { v: 1, capa, activa, historial: x.historial.filter(esDirectiva) };
}

function leerTodo(): Record<string, ArchivoDirectivas> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DIRECTIVAS_KEY);
    if (!raw) return {};
    const datos: unknown = JSON.parse(raw);
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) return {};
    const fuera: Record<string, ArchivoDirectivas> = {};
    for (const [capa, valor] of Object.entries(datos as Record<string, unknown>)) {
      const archivo = normalizarArchivo(capa, valor);
      if (archivo) fuera[capa] = archivo;
    }
    return fuera;
  } catch {
    return {}; // JSON roto o almacenamiento bloqueado: sin dato.
  }
}

/** Las directivas de una capa, o null si no hay (o lo guardado está roto). */
export function leerDirectivas(capa: string): ArchivoDirectivas | null {
  return leerTodo()[capa] ?? null;
}

/**
 * Guarda el archivo de una capa solo si su versión activa es más nueva que la guardada o
 * cambió el historial (una vuelta atrás siempre cambia el historial: la activa pasa a
 * «retirada»). Devuelve true si escribió; emite DIRECTIVAS_EVENT al escribir.
 */
export function guardarDirectivas(capa: string, archivo: ArchivoDirectivas): boolean {
  if (typeof window === "undefined") return false;
  const nuevo = normalizarArchivo(capa, archivo);
  if (!nuevo) return false;
  try {
    const todo = leerTodo();
    const antes = todo[capa];
    if (antes) {
      const masNueva = (nuevo.activa ?? -Infinity) > (antes.activa ?? -Infinity);
      const historialCambio = JSON.stringify(nuevo.historial) !== JSON.stringify(antes.historial);
      if (!masNueva && !historialCambio) return false;
    }
    todo[capa] = nuevo;
    window.localStorage.setItem(DIRECTIVAS_KEY, JSON.stringify(todo));
  } catch {
    return false; // cuota llena o almacenamiento bloqueado
  }
  try {
    window.dispatchEvent(new Event(DIRECTIVAS_EVENT));
  } catch {
    /* sin eventos (entorno raro): lo guardado vale igual */
  }
  return true;
}

/** La directiva activa de una capa (versión y estado cuadran), o undefined. */
export function directivaActiva(capa: string): DirectivaCapa | undefined {
  const archivo = leerDirectivas(capa);
  if (!archivo || archivo.activa === null) return undefined;
  return archivo.historial.find((d) => d.version === archivo.activa && d.estado === "activa");
}
