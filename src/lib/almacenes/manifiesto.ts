/**
 * Manifiesto portable .starseed/almacen.json
 *
 * Estructura portable que vive en la raíz de cualquier almacén (USB, disco, NAS, nube).
 * Versión de formato y validación estricta (rechaza campos de secretos).
 */

import {
  ManifiestoAlmacen,
  ValidacionManifiesto,
  validarManifiestoAlmacen,
  VERSIONES_SOPORTADAS,
} from "./modelo";

export const RUTA_MANIFIESTO = ".starseed/almacen.json" as const;
export const VERSION_FORMATO_ACTUAL = 1 as const;

export interface ResultadoLecturaManifiesto {
  ok: boolean;
  manifiesto?: ManifiestoAlmacen;
  error?: string;
  ruta: string;
}

export interface ResultadoEscrituraManifiesto {
  ok: boolean;
  error?: string;
  ruta: string;
}

/**
 * Lee y valida el manifiesto de un almacén desde un objeto JSON parseado.
 * Función pura: no hace I/O, solo valida la estructura.
 */
export function leerManifiestoDesdeObjeto(
  obj: unknown,
  ruta: string = RUTA_MANIFIESTO
): ResultadoLecturaManifiesto {
  const validacion = validarManifiestoAlmacen(obj);
  if (!validacion.valido) {
    return {
      ok: false,
      error: `Manifiesto inválido en ${ruta}: ${validacion.errores.join("; ")}`,
      ruta,
    };
  }
  return {
    ok: true,
    manifiesto: obj as ManifiestoAlmacen,
    ruta,
  };
}

/**
 * Crea un manifiesto nuevo con valores por defecto sensatos.
 */
export function crearManifiesto(params: {
  idVolumen: string;
  numeroSerie: string;
  dueño: string;
  cerebros?: string[];
  partes?: Record<string, string>;
  cifrado?: boolean;
  algoritmosCifrado?: string[];
}): ManifiestoAlmacen {
  const ahora = new Date().toISOString();
  return {
    versionFormato: VERSION_FORMATO_ACTUAL,
    idVolumen: params.idVolumen,
    numeroSerie: params.numeroSerie,
    dueño: params.dueño,
    cerebros: params.cerebros ?? [],
    partes: params.partes ?? {},
    cifrado: params.cifrado ?? true,
    algoritmosCifrado: params.algoritmosCifrado ?? ["AES-GCM-256"],
    fechaCreacion: ahora,
    fechaActualizacion: ahora,
  };
}

/**
 * Actualiza la fecha de actualización de un manifiesto existente.
 */
export function actualizarFechaManifiesto(manifiesto: ManifiestoAlmacen): ManifiestoAlmacen {
  return {
    ...manifiesto,
    fechaActualizacion: new Date().toISOString(),
  };
}

/**
 * Añade un cerebro a la lista del manifiesto.
 */
export function agregarCerebroAManifiesto(
  manifiesto: ManifiestoAlmacen,
  cerebroId: string
): ManifiestoAlmacen {
  if (manifiesto.cerebros.includes(cerebroId)) {
    return manifiesto;
  }
  return actualizarFechaManifiesto({
    ...manifiesto,
    cerebros: [...manifiesto.cerebros, cerebroId],
  });
}

/**
 * Elimina un cerebro de la lista del manifiesto.
 */
export function eliminarCerebroDeManifiesto(
  manifiesto: ManifiestoAlmacen,
  cerebroId: string
): ManifiestoAlmacen {
  return actualizarFechaManifiesto({
    ...manifiesto,
    cerebros: manifiesto.cerebros.filter((id) => id !== cerebroId),
  });
}

/**
 * Añade o actualiza una parte (carpeta -> cerebroId) en el manifiesto.
 */
export function establecerParteEnManifiesto(
  manifiesto: ManifiestoAlmacen,
  ruta: string,
  cerebroId: string
): ManifiestoAlmacen {
  return actualizarFechaManifiesto({
    ...manifiesto,
    partes: { ...manifiesto.partes, [ruta]: cerebroId },
  });
}

/**
 * Elimina una parte del manifiesto.
 */
export function eliminarParteDeManifiesto(
  manifiesto: ManifiestoAlmacen,
  ruta: string
): ManifiestoAlmacen {
  const { [ruta]: _eliminada, ...restoPartes } = manifiesto.partes;
  return actualizarFechaManifiesto({
    ...manifiesto,
    partes: restoPartes,
  });
}

/**
 * Serializa el manifiesto a JSON con formato legible.
 */
export function serializarManifiesto(manifiesto: ManifiestoAlmacen): string {
  return JSON.stringify(manifiesto, null, 2);
}

/**
 * Parsea y valida un manifiesto desde string JSON.
 */
export function parsearManifiesto(
  json: string,
  ruta: string = RUTA_MANIFIESTO
): ResultadoLecturaManifiesto {
  try {
    const obj = JSON.parse(json);
    return leerManifiestoDesdeObjeto(obj, ruta);
  } catch (e) {
    return {
      ok: false,
      error: `Error parseando JSON en ${ruta}: ${e instanceof Error ? e.message : String(e)}`,
      ruta,
    };
  }
}

/**
 * Verifica si un manifiesto está en la versión actual y migra si es necesario.
 * Por ahora solo soporta versión 1.
 */
export function asegurarVersionActual(
  manifiesto: ManifiestoAlmacen
): { manifiesto: ManifiestoAlmacen; migrado: boolean } {
  if (manifiesto.versionFormato === VERSION_FORMATO_ACTUAL) {
    return { manifiesto, migrado: false };
  }
  // Futuras migraciones irían aquí
  return { manifiesto, migrado: false };
}

/**
 * Valida que un manifiesto no tenga campos de secretos (validación estricta).
 * Esta es la función principal de validación que rechaza cualquier campo sospechoso.
 */
export function validarManifiestoEstricto(manifiesto: unknown): ValidacionManifiesto {
  return validarManifiestoAlmacen(manifiesto);
}

/**
 * Comprueba si un manifiesto pertenece al dueño indicado.
 */
export function verificarDueño(manifiesto: ManifiestoAlmacen, dueñoEsperado: string): boolean {
  return manifiesto.dueño === dueñoEsperado;
}

/**
 * Comprueba si el almacén del manifiesto está cifrado.
 */
export function estaCifrado(manifiesto: ManifiestoAlmacen): boolean {
  return manifiesto.cifrado === true && manifiesto.algoritmosCifrado.length > 0;
}

/**
 * Obtiene los IDs de cerebros que viven en este almacén (completos o parciales).
 */
export function cerebrosEnManifiesto(manifiesto: ManifiestoAlmacen): string[] {
  const completos = new Set(manifiesto.cerebros);
  const parciales = new Set(Object.values(manifiesto.partes));
  return [...new Set([...completos, ...parciales])];
}