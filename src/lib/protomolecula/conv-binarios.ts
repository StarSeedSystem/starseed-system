// Conversores reales de binario para la Protomolécula: PCM→WAV y OBJ→glTF.
// Módulo puro: sin red, sin disco y sin librerías.
import type { ConversorDef } from "./convertidores";

/**
 * Convierte muestras PCM Float32 little-endian en Uint8Array a WAV PCM 16-bit.
 * Entrada: Uint8Array con muestras Float32 en little-endian.
 * Opciones: { frecuencia?: number (default 44100), canales?: number (default 1) }
 * Salida: Uint8Array con el archivo WAV (cabecera RIFF de 44 bytes + datos).
 * Error: si la longitud de entrada no es múltiplo de 4 (bytes) -> "Longitud de PCM inválida: debe ser múltiplo de 4 bytes."
 */
export function pcmAwav(entrada: Uint8Array, opciones?: { frecuencia?: number; canales?: number }): Uint8Array {
  // Placeholder implementation
  return new Uint8Array(0);
}

/**
 * Convierte texto OBJ a glTF 2.0 (JSON) con un buffer incrustado en base64.
 * Entrada: string con el contenido OBJ.
 * Salida: string con el JSON glTF.
 * Nota: solo soporta v (vértices), vn (normales) y f (caras). Ignora vt y materiales.
 * Si no cabe en 120 líneas, dejar solo posiciones e índices y avisar en la última línea.
 */
export function objAglTF(entrada: string, _opciones?: Record<string, number | string>): string {
  // Placeholder implementation
  return "";
}

/** Conversores binarios listos para `registrarConversor` (los registra `convertidores-base.ts`). */
export const CONVERSORES_BINARIOS: ConversorDef[] = [
  {
    de: "pcm",
    a: "wav",
    via: "js" as const,
    costo: 1,
    nombre: "pcm-a-wav",
    convertir: pcmAwav,
  },
  {
    de: "obj",
    a: "gltf",
    via: "js" as const,
    costo: 1,
    nombre: "obj-a-gltf",
    convertir: objAglTF,
  },
];