// Registro de los conversores que el OS trae de serie: texto (F2C) y binarios (F2D).
// Módulo puro: sin red, sin disco ni `node:*`. Idempotente porque `registrarConversor` ya
// descarta duplicados por `de`, `a` y `nombre`: llamarla tras `limpiarConversores` vuelve a dejar
// el registro completo, y llamarla dos veces seguidas no añade nada.
import { registrarConversor } from "./convertidores";
import { CONVERSORES_BINARIOS } from "./conv-binarios";
import { CONVERSORES_TEXTO } from "./conv-texto";

export function registrarConvertidoresBase(): void {
  for (const conversor of [...CONVERSORES_TEXTO, ...CONVERSORES_BINARIOS]) {
    registrarConversor(conversor);
  }
}
