"use client";

import { 
  listMemoryFiles,
  deleteMemoryFile,
  type MemoryFile
} from "@/lib/cerebro/memory-files";
import { 
  regular, 
  type RecuerdoBot,
  cuotaPara
} from "@/lib/astraura-bots/memoria-bot";
import { 
  parseFrontmatter
} from "@/lib/brains/memory-types";
import { 
  esBotDeEntidad 
} from "@/lib/astraura-bots/tipos";
import { 
  crearMotorArchivos, 
  type MotorArchivos
} from "@/lib/network/archivos-malla";

export async function regularAhora(
  bot: Bot,
  medio: string,
  dep: { brainId: string }
): Promise<void> {
  const files = await listMemoryFiles(dep.brainId);
  const recuerdos: RecuerdoBot[] = [];
  const recuerdoIdToFileId = new Map<string, string>();
  for (const file of files) {
    const parsed = parseFrontmatter(file.content);
    if (parsed.data.recuerdo) {
      try {
        const recuerdo = JSON.parse(parsed.data.recuerdo) as RecuerdoBot;
        recuerdos.push(recuerdo);
        recuerdoIdToFileId.set(recuerdo.id, file.id);
      } catch { continue; }
    }
  }
  const cuotaBytes = cuotaPara(medio as any);
  const ahora = Date.now();
  const resultado = regular(recuerdos, cuotaBytes, ahora);
  for (const recuerdoOlvidado of resultado.olvidar) {
    const fileId = recuerdoIdToFileId.get(recuerdoOlvidado.id);
    if (fileId) await deleteMemoryFile(fileId);
  }
}

export async function transferir(
  bot: Bot,
  dep: { motorArchivos?: MotorArchivos }
): Promise<void> {
  throw new Error("Transferencia por la malla no implementada");
}