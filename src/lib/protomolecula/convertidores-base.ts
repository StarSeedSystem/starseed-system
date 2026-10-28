// Protomolécula · Registro base de conversores (PM1010F2D): los de texto y los binarios.
// Idempotente por construcción: `registrarConversor` descarta duplicados por de/a/nombre,
// así que llamarlo dos veces (o tras `limpiarConversores`) nunca duplica nada.
import { registrarConversor } from "./convertidores";
import { CONVERSORES_BINARIOS } from "./conv-binarios";
import { CONVERSORES_TEXTO } from "./conv-texto";

/** Registra los conversores de serie en el grafo. Se puede llamar varias veces sin efecto extra. */
export function registrarConvertidoresBase(): void {
  for (const def of [...CONVERSORES_TEXTO, ...CONVERSORES_BINARIOS]) registrarConversor(def);
}
