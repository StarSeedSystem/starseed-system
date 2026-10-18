// src/lib/cerebros/telepatia-aplicar.ts
import { type Brain, saveBrain, getBrain } from "@/lib/brains/brains";
import { type VinculoTelepatico, planSincronizacion } from "./telepatia";
import { createClient } from "@/utils/supabase/client";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
import { pushPreferences } from "@/lib/settings-sync";
import { upsertGrant } from "@/lib/sharing/access";
import { fetchEvents } from "@/lib/os-social";
import { senalEsencial } from "@/lib/consumo/guardian";
import { MemoryFile, saveMemoryFile, updateMemoryContent } from "@/lib/cerebro/memory-files";

export async function guardarVinculo(cerebro: Brain, v: VinculoTelepatico): Promise<Brain | null> {
  const telepatia = (cerebro.config.telepatia as VinculoTelepatico[]) || [];
  const next = [...telepatia.filter((vt) => vt.id !== v.id), v];
  return saveBrain({ ...cerebro, config: { ...cerebro.config, telepatia: next } });
}

export async function quitarVinculo(cerebro: Brain, id: string): Promise<Brain | null> {
  const telepatia = (cerebro.config.telepatia as VinculoTelepatico[]) || [];
  const next = telepatia.filter((v) => v.id !== id);
  return saveBrain({ ...cerebro, config: { ...cerebro.config, telepatia: next } });
}

export async function sincronizarAhora(
  cerebro: Brain,
  v: VinculoTelepatico
): Promise<{ ok: boolean; operaciones: number; estado: VinculoTelepatico['estado']; motivo?: string; token?: string }> {
  switch (v.destino.tipo) {
    case "cerebro": {
      try {
        const origenBrain = cerebro;
        const destinoBrain = await getBrain(v.destino.id);
        if (!destinoBrain) {
          return { ok: false, operaciones: 0, estado: v.estado ?? "pendiente", motivo: "Destino brain not found" };
        }

        const origenFiles = await listMemoryFiles(origenBrain.id);
        const destinoFiles = await listMemoryFiles(destinoBrain.id);

        const operaciones = planSincronizacion(v, origenBrain, destinoBrain, origenFiles, destinoFiles);

        // Process file operations
        for (const op of operaciones) {
          if (op.tipo === "archivo") {
            const sourceBrainId = op.de === "origen" ? origenBrain.id : destinoBrain.id;
            const targetBrainId = op.a === "origen" ? origenBrain.id : destinoBrain.id;
            const isOriginToTarget = op.de === "origen" && op.a === "destino";

            // Get source file
            const sourceFile = origenFiles.find(f => f.name === op.nombre);
            if (!sourceFile) {
              continue; // skip if source file not found (should not happen)
            }

            // Check if target file exists
            const targetFileExists = destinoFiles.some(f => f.name === op.nombre);

            if (targetFileExists) {
              // Update existing file: update content and set meta.telepatia = v.id
              // Fetch the full file record to preserve other fields
              const fileRecord = destinoFiles.find(f => f.name === op.nombre);
              if (fileRecord) {
                const updatedFile: Partial<MemoryFile> = {
                  id: fileRecord.id,
                  content: sourceFile.content,
                  meta: {
                    ...fileRecord.meta,
                    telepatia: v.id
                  }
                };
                await saveMemoryFile(updatedFile);
              }
            } else {
              // Insert new file: copy from source file, set meta.telepatia = v.id
              const newFile: Partial<MemoryFile> = {
                brain_id: targetBrainId,
                name: sourceFile.name,
                content: sourceFile.content,
                source: sourceFile.source,
                server_config: sourceFile.server_config,
                meta: {
                  ...sourceFile.meta,
                  telepatia: v.id
                },
                sync: sourceFile.sync
              };
              await saveMemoryFile(newFile);
            }
          }
        }

        // Process config operations (copy localStorage keys)
        for (const op of operaciones) {
          if (op.tipo === "config") {
            const sourceBrainId = op.de === "origen" ? origenBrain.id : destinoBrain.id;
            const targetBrainId = op.a === "origen" ? origenBrain.id : destinoBrain.id;
            const key = `starseed.brain.${sourceBrainId}.${op.nombre}`;
            const value = window.localStorage.getItem(key);
            if (value !== null) {
              window.localStorage.setItem(`starseed.brain.${targetBrainId}.${op.nombre}`, value);
            }
          }
        }

        // Update vínculo's ultimaSync and save it
        const updatedVinculo = { ...v, ultimaSync: new Date().toISOString() };
        await guardarVinculo(cerebro, updatedVinculo);

        // Sync localStorage to server
        await pushPreferences();

        return {
          ok: true,
          operaciones: operaciones.length,
          estado: "activo",
          motivo: undefined,
          token: undefined
        };
      } catch (error) {
        console.error("Error in sincronizarAhora (cerebro):", error);
        return {
          ok: false,
          operaciones: 0,
          estado: v.estado ?? "pendiente",
          motivo: error instanceof Error ? error.message : "Unknown error",
          token: undefined
        };
      }
    }
    case "grupo":
    case "comunidad":
    case "pagina": {
      const supa = createClient();
      let slug: string | undefined;
      try {
        const { data, error } = await supa
          .from(v.destino.tipo === "grupo" ? "os_groups" : "os_pages")
          .select("slug")
          .eq("id", v.destino.id)
          .single();
        if (!error && data?.slug) slug = data.slug;
      } catch {
        /* ignorar */
      }
      if (!slug) return { ok: false, operaciones: 0, estado: v.estado ?? "pendiente", motivo: "No se pudo determinar el slug del grupo/comunidad/página." };
      const rol = v.acceso === "escribir" ? "edit" : "view";
      const ref: import("@/lib/sharing/access").ResourceRef = {
        type: "brain",
        id: cerebro.id,
        ownerId: cerebro.owner ?? undefined,
        title: cerebro.name,
      };
      const grant: import("@/lib/sharing/access").AccessGrant = {
        granteeKind: v.destino.tipo === "grupo" || v.destino.tipo === "comunidad" ? "group" : "page",
        granteeId: slug,
        role: rol,
        sections: v.alcance?.memorias?.length ? v.alcance.memorias : undefined,
      };
      try {
        await upsertGrant(ref, grant);
        await guardarVinculo(cerebro, { ...v, estado: "activo", ultimaSync: new Date().toISOString() });
        return {
          ok: true,
          operaciones: 1,
          estado: "activo",
          motivo: undefined,
          token: undefined,
        };
      } catch (e) {
        return { ok: false, operaciones: 0, estado: v.estado ?? "pendiente", motivo: (e as Error).message };
      }
    }
    case "cuenta": {
      const body = JSON.stringify({
        accion: "crear",
        ambitoTipo: "cerebro",
        ambitoId: v.destino.id,
        nombre: `Vínculo cerebro-${cerebro.id}`,
        permisos: { leer: true, escribir: v.acceso === "escribir", memoria: v.alcance?.completo ?? false, herramientas: false, hablar: false },
      });
      try {
        const resp = await fetch("/api/externos/vinculos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "Error creando vínculo externo");
        return {
          ok: true,
          operaciones: 1,
          estado: "activo",
          motivo: undefined,
          token: data.token,
        };
      } catch (e) {
        return { ok: false, operaciones: 0, estado: v.estado ?? "pendiente", motivo: (e as Error).message, token: undefined };
      }
    }
    default: {
      return { ok: false, operaciones: 0, estado: v.estado ?? "pendiente", motivo: "Tipo de destino no soportado" };
    }
  }
}
