// Registro base de convertidores para la Protomolécula: texto y binario.
// Módulo puro: sin red, sin disco y sin librerías.
import { registrarConversor } from "./convertidores";
import { CONVERSORES_TEXTO } from "./conv-texto";
import { CONVERSORES_BINARIOS } from "./conv-binarios";

/**
 * Registra los convertidores de texto y binario básicos.
 * Idempotente: llamar múltiples veces tiene el mismo efecto que llamar una vez.
 */
export function registrarConvertidoresBase(): void {
  for (const conversor of CONVERSORES_TEXTO) {
    registrarConversor(conversor);
  }
  for (const conversor of CONVERSORES_BINARIOS) {
    registrarConversor(conversor);
  }
}