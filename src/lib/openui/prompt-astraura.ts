import { promptDeSistema } from "./biblioteca";
import type { AjustesPerfilRespuesta } from "@/lib/astraura/ajustes-respuesta";
import { normalizarAjustesPerfil } from "@/lib/astraura/ajustes-respuesta";

/**
 * Añade el prompt de sistema de la biblioteca OpenUI cuando la interfaz no es "texto".
 * PuRO: entrada → salida, sin red, sin disco, sin procesos.
 *
 * @param promptBase - Prompt base al que añadir la instrucción de OpenUI
 * @param ajustes - Ajustes del perfil (interfaz: "auto" | "viva" | "texto")
 * @returns Prompt base + instrucción OpenUI (si procede)
 */
export function conInterfazViva(
  promptBase: string,
  ajustes: Partial<AjustesPerfilRespuesta> | null | undefined,
): string {
  const { interfaz } = normalizarAjustesPerfil(ajustes);
  if (interfaz === "texto") {
    return promptBase;
  }

  const promptOpenUI = promptDeSistema();
  if (!promptOpenUI) {
    return promptBase;
  }

  const instruccionCondicional =
    "\n\nINSTRUCCIÓN DE INTERFAZ VIVA: Usa OpenUI Lang (la biblioteca StarSeed) " +
    "SOLO cuando la respuesta tenga datos, pasos o comparaciones. " +
    "Para texto llano, conversación o explicaciones simples, responde en texto normal sin marcadores de OpenUI.";

  return `${promptBase}\n\n${promptOpenUI}${instruccionCondicional}`;
}