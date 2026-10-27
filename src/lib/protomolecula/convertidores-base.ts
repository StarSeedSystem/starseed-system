// Registro de los conversores base de la Protomolécula (F2C texto + F2D binarios).
// Idempotente: `registrarConversor` ignora la misma pareja de/a con el mismo nombre.
import { CONVERSORES_BINARIOS } from "./conv-binarios";
import { CONVERSORES_TEXTO } from "./conv-texto";
import { registrarConversor } from "./convertidores";

/** Deja disponibles CSV↔JSON, SRT↔VTT, PCM→WAV y OBJ→glTF en el registro de conversión. */
export function registrarConvertidoresBase(): void {
  for (const def of [...CONVERSORES_TEXTO, ...CONVERSORES_BINARIOS]) registrarConversor(def);
}
