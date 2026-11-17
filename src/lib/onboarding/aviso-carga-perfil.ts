import { clasificarErrorServicio, textoErrorServicio } from "@/lib/onboarding/onboarding";

/**
 * AVISO DE CARGA DE PERFIL (IMG · catch silencioso) — costura PURA.
 * La ventana de perfil inicial cargaba lo guardado con un catch que tragaba el
 * error en silencio: el usuario veía el formulario vacío sin saber que falló la
 * carga. Aquí se decide qué aviso mostrar (entrada error → salida aviso o
 * null), sin red ni disco.
 */

/** Aviso clasificado para la carga del perfil guardado. */
export interface AvisoCargaPerfil {
  tipo: "red" | "indisponible";
  texto: string;
  detalle: string;
}

/** Devuelve el aviso del error de carga, o null si no hay error que avisar. */
export function avisoCargaPerfil(error: unknown): AvisoCargaPerfil | null {
  if (!error) return null;
  const tipo = clasificarErrorServicio(error);
  const texto = textoErrorServicio(error);
  const detalle = error instanceof Error ? error.message : String(error);
  return { tipo, texto, detalle };
}
