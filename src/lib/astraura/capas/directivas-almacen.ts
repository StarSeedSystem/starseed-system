import type { ArchivoDirectivas, DirectivaCapa } from "./directivas";

/** Clave de localStorage donde se guardan las directivas por capa. */
export const DIRECTIVAS_KEY = "starseed.capas.directivas.v1";

/** Evento emitido cuando se actualizan las directivas de una capa. */
export const DIRECTIVAS_EVENT = "starseed:capas-directivas";

/** Lee las directivas de una capa específica desde localStorage. */
export function leerDirectivas(capa: string): ArchivoDirectivas | null {
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(DIRECTIVAS_KEY);
      if (raw) {
        const directivas: Record<string, ArchivoDirectivas> = JSON.parse(raw);
        return directivas[capa] || null;
      }
    }
  } catch {
    // JSON roto o almacenamiento sin permiso: sigue sin dato.
  }
  return null;
}

/** Guarda las directivas de una capa en localStorage.
 * Solo actualiza si la versión activa es más nueva o si el historial cambió.
 */
export async function guardarDirectivas(capa: string, archivo: ArchivoDirectivas): Promise<boolean> {
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(DIRECTIVAS_KEY);
      const directivas: Record<string, ArchivoDirectivas> = raw ? JSON.parse(raw) : {};
      
      // Verificar si el archivo ya existe y si hay cambios relevantes.
      const existe = directivas[capa];
      const actualizar = 
        !existe || 
        archivo.activa !== existe.activa ||
        JSON.stringify(archivo.historial) !== JSON.stringify(existe.historial);
      
      if (actualizar) {
        directivas[capa] = archivo;
        window.localStorage.setItem(DIRECTIVAS_KEY, JSON.stringify(directivas));
        window.dispatchEvent(new Event(DIRECTIVAS_EVENT));
        return true;
      }
    }
  } catch {
    // Error al guardar: no se actualiza.
  }
  return false;
}

/** Obtiene la directiva activa de una capa específica.
 * Devuelve undefined si no hay directiva activa o si no existe el archivo.
 */
export function directivaActiva(capa: string): DirectivaCapa | undefined {
  const archivo = leerDirectivas(capa);
  if (!archivo) return undefined;
  
  const activa = archivo.historial.find((d) => d.version === archivo.activa && d.estado === "activa");
  return activa;
}