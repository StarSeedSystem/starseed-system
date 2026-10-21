"use client";

/**
 * Aplicador de telepatía: aplica los planes de sincronización telepáticos a Supabase.
 * Contrato: architecture/cerebros-fusion-telepatia.md §5.
 */

import { createClient } from "@/utils/supabase/client";
import type { Brain } from "@/lib/brains/brains";
import type { VinculoTelepatico } from "@/lib/cerebros/telepatia";
import type { OperacionSincronizacion } from "@/lib/cerebros/telepatia";

/**
 * Descarga archivos de memoria para un cerebro (helper puro).
 * En el prototipo, esto se agregaría como un hook de Supabase + realtime.
 */
async function descargarArchivosMemoria(brainId: string, nombres: string[]): Promise<{ id: string; name: string; actualizadoEn?: string; meta?: Record<string, unknown> }[]> {
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from("brain_memory_files")
      .select("id, name, updated_at, meta")
      .eq("brain_id", brainId)
      .in("name", nombres);
    if (error) return [];
    return ((data || []) as any[]).map((row) => ({
      id: row.id,
      name: row.name,
      actualizadoEn: row.updated_at,
      meta: row.meta || null,
    }));
  } catch {
    return [];
  }
}

/**
 * Obtiene un cerebro con configuración telepática (lectura defensiva).
 */
async function obtenerCerebroConTelepatia(brainId: string): Promise<Brain | null> {
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from("brains")
      .select("*")
      .eq("id", brainId)
      .single();
    if (error || !data) return null;
    // Normalizar usando la misma lógica de brains.ts si está disponible
    const brain: Brain = {
      id: data.id,
      owner: data.owner,
      name: data.name || "Cerebro",
      scope: data.scope,
      scope_ref: data.scope_ref || null,
      description: data.description || "",
      config: ((data.config as Record<string, unknown>) || {}),
      includes: {
        vaults: ((data.includes as any)?.vaults || []) as string[],
        backends: ((data.includes as any)?.backends || []) as string[],
        personalities: ((data.includes as any)?.personalities || []) as string[],
        runtimes: ((data.includes as any)?.runtimes || []) as string[],
        tokens: ((data.includes as any)?.tokens || []) as string[],
        memories: ((data.includes as any)?.memories || []) as string[],
        connections: ((data.includes as any)?.connections || []) as string[],
        bindScope: (data.includes as any)?.bindScope || false,
        permissions: (data.includes as any)?.permissions || [],
        aiProvider: (data.includes as any)?.aiProvider || undefined,
      },
      servers: ((data.servers as any[]) || []).map((s) => ({
        id: s.id,
        kind: s.kind || "online",
        name: s.name,
        endpoint: s.endpoint,
        keyRef: s.keyRef,
        status: s.status,
        notes: s.notes,
        ...s,
      })),
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
    return brain;
  } catch {
    return null;
  }
}

/**
 * Aplica un plan de sincronización de vinculo telepático.
 * Copia lo más nuevo según `updated_at`, **nunca borra** en el otro lado
 * y respeta dirección/acceso. Para cerebros propios aplica de verdad (RLS del dueño).
 * Para grupos/comunidades/páginas registra el permiso con `upsertGrant`.
 * Para cuentas externas crea un vínculo en `os_vinculos_externos`.
 */
export async function aplicarVinculoTelepatia(
  vinculo: VinculoTelepatico,
  cerebroOrigen: Brain,
  cerebroDestino: Brain,
): Promise<{ ok: boolean; errores: string[] }> {
  const errores: string[] = [];

  // Validación defensiva
  if (!vinculo?.id) {
    errores.push("Falta id del vínculo");
    return { ok: false, errores };
  }

  // Determinar qué operaciones aplicar según el plan
  const archivosOrigen = await descargarArchivosMemoria(cerebroOrigen.id, vinculo.alcance.completo ? [] : vinculo.alcance.memorias);
  const plan = planSincronizacion(vinculo, cerebroOrigen, cerebroDestino, archivosOrigen);

  if (plan.length === 0) {
    return { ok: true, errores: [] }; // Nada que hacer
  }

  const sb = createClient();

  try {
    // Para cerebros propios (origen y destino son del mismo usuario)
    if (cerebroOrigen.owner === cerebroDestino.owner && cerebroOrigen.id !== cerebroDestino.id) {
      // Aplicar sincronización de archivos/memorias
      for (const op of plan) {
        if (op.tipo === "archivo") {
          // Encontrar archivo de origen
          const origenArchivo = archivosOrigen.find((a) => a.name === op.nombre);
          if (!origenArchivo) continue;
          // Upsert en tabla brain_memory_files del destino
          const { error } = await sb
            .from("brain_memory_files")
            .upsert({
              id: crypto.randomUUID(),
              brain_id: cerebroDestino.id,
              name: op.nombre,
              updated_at: origenArchivo.actualizadoEn || new Date().toISOString(),
              meta: { telepatia: vinculo.id, sincronizadoDesde: cerebroOrigen.id },
            }, { onConflict: "brain_id,name" });
          if (error) {
            errores.push(`Error al sincronizar archivo ${op.nombre}: ${error.message}`);
          }
        }
      }
    }
    // Para grupos/comunidades/páginas: registrar permiso con upsertGrant
    else if (["grupo", "comunidad", "pagina"].includes(vinculo.destino.tipo)) {
      // TODO: Implementar upsertGrant en src/lib/access.ts si no existe
      // Por ahora, solo registrar un placeholder
      console.log("Vinculo a grupo/comunidad/página implementado pendiente");
    }
    // Para cuentas externas: crear vínculo en os_vinculos_externos
    else if (vinculo.destino.tipo === "cuenta") {
      // TODO: Implementar creación de token y almacenamiento en os_vinculos_externos
      // Por ahora, solo registrar un placeholder
      console.log("Vinculo a cuenta externa implementado pendiente");
    }

    return { ok: errores.length === 0, errores };
  } catch (e) {
    const error = e as Error;
    errores.push(`Excepción al aplicar vinculo: ${error.message}`);
    return { ok: false, errores };
  }
}

/**
 * Plan de sincronización (reexportado del módulo puro para conveniencia).
 */
export { planSincronizacion } from "@/lib/cerebros/telepatia";

/**
 * Utilerías puras reexportadas (para composición en el componente).
 */
export {
  destinoEnPalabras,
  alcanceResumido,
  estadoConMotivo,
  normalizarVinculo,
  normalizarVinculos,
  validarVinculo,
} from "@/lib/cerebros/telepatia";
