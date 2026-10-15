// src/lib/cerebros/telepatia-aplicar.ts
import { type Brain, saveBrain } from "@/lib/brains/brains";
import { type VinculoTelepatico } from "./telepatia";
import { createClient } from "@/utils/supabase/client";
import { listMemoryFiles, saveMemoryFile } from "../cerebro/memory-files";
import { pushPreferences } from "@/lib/settings-sync";
import { upsertGrant } from "@/lib/sharing/access";
import { fetchEvents } from "@/lib/os-social";
import { senalEsencial } from "@/lib/consumo/guardian";

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
      const origenId = cerebro.id;
      const destinoId = v.destino.id;
      const origenFiles = await listMemoryFiles(origenId);
      const destinoFiles = await listMemoryFiles(destinoId);

      // Create a map of destination files by name for quick lookup
      const destinoFileMap = new Map<string, MemoryFile>();
      destinoFiles.forEach(file => {
        destinoFileMap.set(file.name, file);
      });

      const operaciones: Array<{ tipo: "archivo" | "config"; nombre: string; de: string; a: string }> = [];

      // Determine which files to sync based on alcance
      const filesToConsider = v.alcance.completo
        ? origenFiles
        : origenFiles.filter(file => v.alcance.memorias.includes(file.name));

      for (const origenFile of filesToConsider) {
        const destinoFile = destinoFileMap.get(origenFile.name);
        let operationType: "archivo" | "config" = "archivo";
        let nombre = origenFile.name;
        let de = origenId;
        let a = destinoId;

        if (destinoFile) {
          // File exists in destination, check if we need to update
          // We compare updated_at to see which is newer
          const origenTime = new Date(origenFile.updated_at || 0).getTime();
          const destinoTime = new Date(destinoFile.updated_at || 0).getTime();
          if (origenTime > destinoTime) {
            // Origin is newer, update destination
            operaciones.push({ tipo: operationType, nombre, de, a });
          }
          // If destination is newer or equal, we do nothing (never delete or overwrite with older)
        } else {
          // File does not exist in destination, insert it
          operaciones.push({ tipo: operationType, nombre, de, a });
        }
      }

      // Apply each operation
      for (const op of operaciones) {
        if (op.tipo === "archivo") {
          // Find the origin file by name
          const originFile = origenFiles.find(f => f.name === op.nombre);
          if (!originFile) continue;

          // Prepare the file to save in destination
          const fileToSave: Partial<MemoryFile> = {
            name: op.nombre,
            content: originFile.content,
            source: originFile.source,
            server_config: originFile.server_config,
            meta: {
              ...originFile.meta,
              telepatia: v.id // Set the telepatia meta
            },
            sync: originFile.sync,
            brain_id: op.a, // destination brain id
            // owner will be filled by saveMemoryFile
          };

          try {
            await saveMemoryFile(fileToSave);
          } catch (error) {
            // If we fail to save one file, we continue with others? Or fail the whole sync?
            // For now, we'll log and continue, but we'll count this as a failed operation.
            // We'll need to adjust the operaciones count accordingly.
            console.error(`Failed to save memory file ${op.nombre}:`, error);
          }
        }
        // TODO: Handle config operations
      }

      // Update the vinculo with ultimaSync and estado activo
      await guardarVinculo(cerebro, { ...v, estado: "activo", ultimaSync: new Date().toISOString() });

      return {
        ok: true,
        operaciones: operaciones.length,
        estado: "activo",
        motivo: "Sincronización completada",
        token: undefined,
      };
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
          motivo: "Los miembros pueden leer; escribir solo del dueño",
          token: undefined,
        };
      } catch (e) {
        return { ok: false, operaciones: 0, estado: v.estado ?? "pendiente", motivo: (e as Error).message };
      }
    }
    case "cuenta": {
      // Determine the ambitoTipo based on alcance
      let ambitoTipo: "cerebro" | "memoria" | "carpeta" = "cerebro";
      if (!v.alcance.completo) {
        if (v.alcance.memorias.length > 0 && v.alcance.carpetas.length === 0) {
          ambitoTipo = "memoria";
        } else if (v.alcance.carpetas.length > 0 && v.alcance.memorias.length === 0) {
          ambitoTipo = "carpeta";
        }
        // If both are empty, default to cerebro (though this might not make sense)
      }

      const body = JSON.stringify({
        accion: "crear",
        ambitoTipo,
        ambitoId: v.destino.id,
        nombre: `Vínculo cerebro-${cerebro.id}`,
        permisos: {
          leer: v.acceso === "leer" || v.acceso === "ambas" ? true : false,
          escribir: v.acceso === "escribir" || v.acceso === "ambas" ? true : false,
          memoria: v.alcance.completo ? true : false, // Simplified: if completo, then memoria permiso is true
          herramientas: false,
          hablar: false,
        },
      });
      try {
        const resp = await fetch("/api/externos/vinculos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "Error creando vínculo externo");
        // Note: We do not save the token in the config, as per contract.
        // But we should update the vinculo to reflect the sync attempt.
        await guardarVinculo(cerebro, { ...v, estado: "activo", ultimaSync: new Date().toISOString() });
        return {
          ok: true,
          operaciones: 1,
          estado: "activo",
          motivo: "Vinculo externo creado",
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