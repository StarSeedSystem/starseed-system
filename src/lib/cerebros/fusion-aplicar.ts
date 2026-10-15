"use client";
import { createClient } from "@/utils/supabase/client";
import type { Brain, BrainIncludes, BrainServer } from "@/lib/brains/brains";
import { senalEsencial } from "@/lib/consumo/guardian";
import { getBrain, saveBrain, deleteBrain, uid } from "@/lib/brains/brains";
import { pushPreferences } from "@/lib/settings-sync";
import type { MemoryFile } from "@/lib/cerebro/memory-files";
export type LecturaFusionResult = | { ok: true; destino: Brain; origenes: Brain[]; archivos: MemoryFile[]; prefs: Record<string, unknown> } | { ok: false; motivo: string };
export interface ResultadoFusion { ok: boolean; archivosEscritos: number; bytes: number; origenesQuitados: string[]; origenesConservados: Array<{ id: string; motif: string }>; error?: string; }
interface PlanFusion = { archivos: { nombre: string; content: string; bytesEntrada: number; origenId: string }[]; incluye: BrainIncludes; servidores: BrainServer[]; config: Record<string, unknown>; prefs: Record<string, unknown>; };
export async function leerParaFusion(destinoId: string, origenIds: string[]): Promise<LecturaFusionResult> {
  try {
    const sb = createClient();
    const destino = await getBrain(destinoId);
    if (!destino) return { ok: false, motivo: `Cerebro destino ${destinoId} no encontrado` };
    const origenes: Brain[] = [];
    for (const id of origenIds) {
      const cerebro = await getBrain(id);
      if (!cerebro) return { ok: false, motivo: `Cerebro origen ${id} no encontrado` };
      origenes.push(cerebro);
    }
    const todosLosIds = [destinoId, ...origenIds];
    const { data: archivosData, error: archivosError } = await sb.from("brain_memory_files").select("id,brain_id,name,content,updated_at,meta").in("brain_id", todosLosIds).order("brain_id", { ascending: true }).order("name", { ascending: true }).abortSignal(senalEsencial());
    if (archivosError || !Array.isArray(archivosData)) return { ok: false, motivo: "Error al leer archivos de memoria" };
    const archivos: MemoryFile[] = (archivosData as Record<string, unknown>[]).map(r => ({
      id: String(r.id ?? ""),
      owner: (r.owner as string) ?? undefined,
      brain_id: (r.brain_id as string) ?? null,
      name: (r.name as string) || "nota.md",
      content: (r.content as string) ?? "",
      source: (r.source as string) || "starseed",
      server_config: (r.server_config as Record<string, unknown>) || {},
      meta: (r.meta as Record<string, unknown>) || {},
      sync: !!r.sync,
      updated_at: (r.updated_at as string) ?? undefined,
      created_at: (r.created_at as string) ?? undefined,
    }));
    const prefs: Record<string, unknown> = {};
    for (const cerebro of [destino, ...origenes]) {
      if (!cerebro.id) continue;
      const prefix = `starseed.brain.${cerebro.id}.`;
      if (typeof window === "undefined") { prefs[cerebro.id] = {}; continue; }
      const cerebroPrefs: Record<string, unknown> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          try {
            const value = localStorage.getItem(key);
            if (value !== null) {
              let parsed: unknown;
              try { parsed = JSON.parse(value); } catch { parsed = value; }
              const sufijo = key.substring(prefix.length);
              cerebroPrefs[sufijo] = parsed;
            }
          } catch { }
        }
      }
      prefs[cerebro.id] = cerebroPrefs;
    }
    return { ok: true, destino, origenes, archivos, prefs };
  } catch (e) {
    return { ok: false, motivo: "Error interno" };
  }
}
export function copiaDeSeguridad(datos: { destino: Brain; origenes: Brain[]; archivos: MemoryFile[]; prefs: Record<string, unknown> }, fecha: string): { nombre: string; texto: string } {
  const nombre = `cerebros-fusion-${fecha}.json`;
  const serializable = {
    destino: { id: datos.destino.id, name: datos.destino.name, scope: datos.destino.scope, scope_ref: datos.destino.scope_ref, description: datos.destino.description, config: datos.destino.config, includes: datos.destino.includes, servers: datos.destino.servidores, created_at: datos.destino.created_at, updated_at: datos.destino.updated_at },
    origenes: datos.origenes.map(o => ({ id: o.id, name: o.name, scope: o.scope, scope_ref: o.scope_ref, description: o.description, config: o.config, includes: o.includes, servers: o.servidores, created_at: o.created_at, updated_at: o.updated_at })),
    archivos: datos.archivos.map(a => ({ id: a.id, owner: a.owner, brain_id: a.brain_id, name: a.name, content: a.content, source: a.source, server_config: a.server_config, meta: a.meta, sync: a.sync, updated_at: a.updated_at, created_at: a.created_at })),
    prefs: datos.prefs
  };
  return { nombre, texto: JSON.stringify(serializable) };
}
export function descargarCopia(copia: { nombre: string; texto: string }): boolean {
  if (typeof window === "undefined") return false;
  try {
    const blob = new Blob([copia.texto], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = copia.nombre;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch { return false; }
}
export async function aplicarFusion(plan: PlanFusion, o: { destino: Brain; origenIds: string[]; quitarOrigenes: boolean }): Promise<ResultadoFusion> {
  try {
    const sb = createClient();
    const { destino, origenIds, quitarOrigenes } = o;
    const fecha = new Date().toISOString().split("T")[0];
    descargarCopia(copiaDeSeguridad({ destino, origenes: [], archivos: [], prefs: plan.prefs }, fecha));
    const { data: archivosDestinoData, error: archivosDestinoError } = await sb.from("brain_memory_files").select("id,name").eq("brain_id", destino.id).abortSignal(senalEsencial());
    if (archivosDestinoError || !Array.isArray(archivosDestinoData)) throw new Error("Error al leer archivos de destino");
    const archivosDestino = archivosDestinoData ?? [];
    const mapa = new Map<string, string>();
    for (const a of archivosDestino as any[]) mapa.set(a.name, a.id);
    let archivosEscritos = 0;
    let bytesEscritos = 0;
    for (const { nombre, content, bytesEntrada } of plan.archivos) {
      const idExistente = mapa.get(nombre);
      if (idExistente) {
        const { error: updateError } = await sb.from("brain_memory_files").update({ content, updated_at: new Date().toISOString() }).eq("id", idExistente).abortSignal(senalEsencial());
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await sb.from("brain_memory_files").insert({ owner: (await uid()) ?? null, brain_id: destino.id, name: nombre, content: content, source: "fusion", server_config: {}, meta: {}, sync: false, updated_at: new Date().toISOString() }).abortSignal(senalEsencial());
        if (insertError) throw insertError;
      }
      archivosEscritos++;
      bytesEscritos += bytesEntrada;
    }
    const { error: saveError } = await saveBrain({ ...destino, incluye: plan.incluye, servidores: plan.servidores, config: plan.config });
    if (saveError) throw saveError;
    if (typeof window !== "undefined") {
      for (const [clave, valor] of Object.entries(plan.prefs)) {
        try { window.localStorage.setItem(`starseed.brain.${destino.id}.${clave}`, JSON.stringify(valor)); } catch { }
      }
    }
    await pushPreferences();
    const origenesQuitados: string[] = [];
    const origenesConservados: Array<{ id: string; motif: string }> = [];
    if (quitarOrigenes && origenIds.length > 0) {
      for (const origenId of origenIds) {
        const { data: selecciones, error: selError } = await sb.from("brain_selections").select("id").eq("brain_id", origenId).abortSignal(senalEsencial());
        if (selError) throw selError;
        if ((selecciones as any[]).length > 0) {
          origenesConservados.push({ id: origenId, motif: "tiene selecciones; se moverán cuando se aplique §9 b" });
        } else {
          const { error: deleteError } = await deleteBrain(origenId);
          if (deleteError) throw deleteError;
          origenesQuitados.push(origenId);
        }
      }
    }
    return { ok: true, archivosEscritos, bytes: bytesEscritos, origenesQuitados, origenesConservados };
  } catch (e: any) {
    return { ok: false, archivosEscritos: 0, bytes: 0, origenesQuitados: [], origenesConservados: [], error: e.message ?? "Error desconocido" };
  }
}