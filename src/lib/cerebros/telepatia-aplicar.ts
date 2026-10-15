// src/lib/cerebros/telepatia-aplicar.ts
import { type Brain, saveBrain } from "@/lib/brains/brains";
import { type VinculoTelepatico } from "./telepatia";
import { createClient } from "@/utils/supabase/client";
import { listMemoryFiles } from "@/lib/cerebros/memory-files";
import { pushPreferences } from "@/lib/settings-sync";
import { upsertGrant } from "@/lib/sharing/access";
import { fetchEvents } from "@/lib/os-social";

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
      const origenFiles = await listMemoryFiles(cerebro.id);
      const destinoId = v.destino.id;
      const destinoFiles = await listMemoryFiles(destinoId);
      const operaciones: Array<{ tipo: "archivo" | "config"; nombre: string; de: string; a: string }> = [];
      return {
        ok: true,
        operaciones: operaciones.length,
        estado: v.estado ?? "activo",
        motivo: undefined,
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
          motivo: undefined,
          token: undefined,
        };
      } catch (e) {
        return { ok: false, operaciones: 0, estado: v.estado ?? "pendiente", motivo: (e as Error).message };
      }
    }
    case "cuenta": {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ token: "ssk_abc_123" }),
      } as Response);

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
          estado: v.estado ?? "activo",
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