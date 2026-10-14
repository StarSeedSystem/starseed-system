"use client";

/**
 * Función para recuperar recuerdos que coinciden con una consulta.
 */

import { 
  listMemoryFiles,
  type MemoryFile
} from "@/lib/cerebro/memory-files";
import { 
  memoriaVisible,
  type Bot
} from "@/lib/astraura-bots/permisos";
import { 
  parseFrontmatter
} from "@/lib/brains/memory-types";

/**
 * Recupera fragmentos de memoria que coinciden con una consulta.
 * @param bot El bot que quiere recordar.
 * @param consulta Una cadena de texto para buscar en los fragmentos.
 * @param dep Dependencias, se espera que contenga { brainId: string }.
 * @returns Una promesa que se resuelve con un array de fragmentos de memoria (con los campos de FragmentoMemoria).
 */
export async function recuerdos(
  bot: Bot,
  consulta: string,
  dep: { brainId: string }
): Promise<Array<{
  id: string;
  alcance: string;
  texto: string;
  origen: string;
  at: number;
  etiquetas?: string[];
}>> {
  // 1. List all memory files for the given brainId
  const files = await listMemoryFiles(dep.brainId);
  const resultados: Array<{
    id: string;
    alcance: string;
    texto: string;
    origen: string;
    at: number;
    etiquetas?: string[];
  }> = [];

  // 2. Get the visible alcances for the bot
  const visibleAlcances = memoriaVisible(bot);

  // 3. Process each file
  for (const file of files) {
    // 4. Parse the frontmatter from the content
    const parsed = parseFrontmatter(file.content);
    let recuerdo: {
      id: string;
      alcance: string;
      texto: string;
      origen: string;
      at: number;
      etiquetas?: string[];
    } | null = null;

    if (parsed.data.recuerdo) {
      try {
        recuerdo = JSON.parse(parsed.data.recuerdo) as {
          id: string;
          alcance: string;
          texto: string;
          origen: string;
          at: number;
          etiquetas?: string[];
        };
      } catch (e) {
        // If parsing fails, skip this file
        continue;
      }
    }

    if (!recuerdo) continue;

    // 5. Check if the alcance is visible to the bot
    if (!visibleAlcances.includes(recuerdo.alcance)) continue;

    // 6. Check if the texto contains the consulta (case-insensitive)
    if (recuerdo.texto.toLowerCase().includes(consulta.toLowerCase())) {
      resultados.push(recuerdo);
    }
  }

  return resultados;
}