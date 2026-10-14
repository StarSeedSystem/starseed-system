"use client";

/**
 * Función para recordar un fragmento de memoria en el cerebro.
 */

import { 
  saveMemoryFile, 
  updateMemoryContent,
  type MemoryFile
} from "@/lib/cerebro/memory-files";
import { 
  writeMemoryContentResilient 
} from "@/lib/brains/memory-offline";
import { 
  puedeEscribirMemoria,
  type Bot
} from "@/lib/astraura-bots/permisos";
import { 
  stringifyFrontmatter
} from "@/lib/brains/memory-types";
import { 
  esBotDeEntidad 
} from "@/lib/astraura-bots/tipos";
import { 
  crypto 
} from "crypto";

/**
 * Guarda un fragmento de memoria en el cerebro como un recuerdo de bot.
 * @param bot El bot que quiere recordar.
 * @param alcance El alcance de la memoria (personal, perfil, grupo, publica).
 * @param texto El texto de la memoria.
 * @param dep Dependencias, se espera que contenga { brainId: string }.
 * @returns Una promesa que se resuelve cuando la memoria se ha guardado.
 */
export async function recordar(
  bot: Bot,
  alcance: string,
  texto: string,
  dep: { brainId: string }
): Promise<void> {
  // 1. Check permission to write
  if (!puedeEscribirMemoria(bot, alcance as any)) {
    throw new Error(`El bot no tiene permiso para escribir en el alcance ${alcance}`);
  }

  // 2. Generate a unique id for the memory file
  let memId;
  if (crypto && crypto.randomUUID) {
    memId = crypto.randomUUID();
  } else {
    memId = Math.random().toString(36).substring(2, 15);
  }

  // 3. Determine the groupId if alcance is grupo and bot is an entity bot
  let grupoId: string | undefined;
  if (alcance === "grupo" && esBotDeEntidad(bot)) {
    grupoId = bot.dueno.id;
  }

  // 4. Create a RecuerdoBot object
  const ahora = Date.now();
  const textoBytes = new TextEncoder().encode(texto).length;
  const recuerdo = {
    id: memId,
    alcance,
    texto,
    origen: "desconocido",
    at: ahora,
    etiquetas: [],
    botId: bot.id,
    bytes: textoBytes,
    usos: 0,
    fijado: false,
    grupoId: grupoId,
  };

  // 5. Create a temporary memory file
  const tempFile: MemoryFile = {
    brain_id: dep.brainId,
    name: `recuerdo-${memId}.md`,
    content: "",
    source: "starseed",
    meta: {},
    sync: false,
  };

  // 6. Save the memory file to get the server-assigned id
  const savedFile = await saveMemoryFile(tempFile);
  if (!savedFile) {
    throw new Error("No se pudo crear el archivo de recuerdo");
  }

  // 7. Convert the RecuerdoBot to markdown with frontmatter
  const frontmatter = {
    recuerdo: JSON.stringify(recuerdo),
  };
  const markdownContent = stringifyFrontmatter(frontmatter, `# Recuerdo de bot\n\n${texto}\n`);

  // 8. Update the content of the memory file using the resilient write function
  await writeMemoryContentResilient(
    {
      id: savedFile.id,
      brain_id: savedFile.brain_id,
      name: savedFile.name,
      updated_at: savedFile.updated_at
    },
    markdownContent
  );
}