// Registro base de convertidores de la Protomolécula: texto (CSV↔JSON, SRT↔VTT) y binarios (PCM→WAV, OBJ→glTF).
// Módulo puro e idempotente: `registrarConversor` ya descarta la misma pareja con el mismo nombre.
import { CONVERSORES_BINARIOS } from "./conv-binarios";
import { CONVERSORES_TEXTO } from "./conv-texto";
import { registrarConversor, type ConversorDef } from "./convertidores";

/** Todo lo que el OS trae de serie en el grafo de conversores. */
export const CONVERSORES_BASE: ConversorDef[] = [...CONVERSORES_TEXTO, ...CONVERSORES_BINARIOS];

/** Registra los conversores base. Llamarla varias veces no duplica ninguno. */
export function registrarConvertidoresBase(): void {
  for (const def of CONVERSORES_BASE) registrarConversor(def);
}
