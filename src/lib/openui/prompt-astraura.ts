import { promptDeSistema } from "./biblioteca";
import {
  debeUsarInterfazViva,
  type AjustesPerfilRespuesta,
  type SenalesDeContenido,
} from "@/lib/astraura/ajustes-respuesta";

/**
 * Añade las instrucciones de OpenUI cuando la interfaz no es solo texto.
 * Módulo puro, sin dependencias de Node.
 *
 * - Si `interfaz === "texto"`: devuelve el prompt base sin cambios.
 * - Si `interfaz === "viva"`: añade las instrucciones de OpenUI.
 * - Si `interfaz === "auto"` (o undefined): añade las instrucciones solo si
 *   hay señales de contenido (datos, pasos o comparaciones).
 */
export function conInterfazViva(
  promptBase: string,
  ajustes?: Partial<AjustesPerfilRespuesta> | null,
  senales?: SenalesDeContenido,
): string {
  if (!debeUsarInterfazViva(ajustes, senales ?? {})) {
    return promptBase;
  }

  const instruccionesOpenUI = promptDeSistema();

  return `${promptBase}\n\n--- INSTRUCCIONES DE INTERFAZ VIVA (OPENUI) ---\n${instruccionesOpenUI}\n\nInstrucción: Usa OpenUI Lang SOLAMENTE si la respuesta contiene datos, pasos o comparaciones.`;
}
