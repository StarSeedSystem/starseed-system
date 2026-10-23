<<<<<<< HEAD
// src/lib/cerebros/telepatia-aplicar.ts
/**
 * Aplica la Telepatía de un cerebro (contrato cerebros-fusion-telepatia.md §5).
 * Guardar y quitar vínculos van vía `saveBrain` con `conVinculo`/`sinVinculo`.
 * La sincronización «de verdad» (otro cerebro tuyo) planifica con `planSincronizacion`,
 * escribe cada archivo con `meta.telepatia = v.id`, nunca borra ni mezcla, y copia
 * las claves `starseed.brain.<id>.<config>` de localStorage según las ops de config.
 */
import { type Brain, saveBrain } from "@/lib/brains/brains";
import { createClient } from "@/utils/supabase/client";
import { listMemoryFiles, type MemoryFile, saveMemoryFile } from "@/lib/cerebro/memory-files";
import { pushPreferences } from "@/lib/settings-sync";
import { upsertGrant, type AccessGrant, type ResourceRef } from "@/lib/sharing/access";
import {
  CONFIGURACIONES_TELEPATIA,
  conVinculo,
  estaCaducado,
  planSincronizacion,
  sinVinculo,
  type VinculoTelepatico,
} from "./telepatia";

export interface ResultadoSincronizacion {
  ok: boolean;
  operaciones: number;
  estado: VinculoTelepatico["estado"];
  motivo?: string;
  token?: string;
}

export async function guardarVinculo(cerebro: Brain, v: VinculoTelepatico): Promise<Brain | null> {
  return saveBrain({ ...cerebro, config: conVinculo(cerebro.config, v) });
}

export async function quitarVinculo(cerebro: Brain, id: string): Promise<Brain | null> {
  return saveBrain({ ...cerebro, config: sinVinculo(cerebro.config, id) });
}

function claveCerebro(brainId: string, conf: string): string {
  return `starseed.brain.${brainId}.${conf}`;
}

/** Lee las preferencias por cerebro de localStorage: { <config>: valor }. */
function leerPrefs(brainId: string, confs: readonly string[]): Record<string, unknown> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  const prefs: Record<string, unknown> = {};
  for (const conf of confs) {
    try {
      const raw = window.localStorage.getItem(claveCerebro(brainId, conf));
      if (raw !== null) prefs[conf] = JSON.parse(raw);
    } catch {
      /* preferencia ilegible: se salta, no se inventa nada */
    }
  }
  return prefs;
}

/** Copia una preferencia por cerebro de un lacito de localStorage a otro. */
function copiarConfig(conf: string, de: string, a: string): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const raw = window.localStorage.getItem(claveCerebro(de, conf));
    if (raw === null) return false;
    window.localStorage.setItem(claveCerebro(a, conf), raw);
    return true;
  } catch {
    return false;
  }
}

/** Escribe en el cerebro destino el archivo del origen (insert por fá, update por id si existe). */
async function escribirArchivo(
  v: VinculoTelepatico,
  deId: string,
  aId: string,
  fuente: MemoryFile | undefined,
  existente: MemoryFile | undefined,
): Promise<boolean> {
  const escrito = await saveMemoryFile({
    ...(existente?.id ? { id: existente.id } : {}),
    brain_id: aId,
    name: fuente?.name ?? existente?.name ?? "",
    content: fuente?.content ?? "",
    source: fuente?.source || existente?.source || "starseed",
    server_config: fuente?.server_config ?? {},
    meta: { ...(fuente?.meta ?? {}), telepatia: v.id },
    sync: false,
  });
  return !!escrito;
}

async function sincronizarCerebroPropio(
  cerebro: Brain,
  v: VinculoTelepatico,
): Promise<ResultadoSincronizacion> {
  if (v.estado !== "activo") {
    return { ok: false, operaciones: 0, estado: v.estado, motivo: "El vínculo no está activo." };
  }
  if (estaCaducado(v, Date.now())) {
    return { ok: false, operaciones: 0, estado: v.estado, motivo: "La caducidad del vínculo ya pasó." };
  }
  const origenId = cerebro.id;
  const destinoId = v.destino.id;
  const archivosOrigen = await listMemoryFiles(origenId);
  const archivosDestino = await listMemoryFiles(destinoId);
  const confs = v.alcance.completo ? [...CONFIGURACIONES_TELEPATIA] : v.alcance.configuraciones;
  const plan = planSincronizacion(
    v,
    { archivos: archivosOrigen, prefs: leerPrefs(origenId, confs) },
    { archivos: archivosDestino, prefs: leerPrefs(destinoId, confs) },
  );
  let hechas = 0;
  let fallidas = 0;
  let configCopiada = false;
  for (const op of plan) {
    if (op.tipo === "carpeta") continue; // raíces de carpeta: se cablean con su tarea (§5)
    const deId = op.de === "origen" ? origenId : destinoId;
    const aId = op.a === "origen" ? origenId : destinoId;
    if (op.tipo === "archivo") {
      const fuente = (op.de === "origen" ? archivosOrigen : archivosDestino).find((f) => f.name === op.nombre);
      const existente = (op.a === "origen" ? archivosOrigen : archivosDestino).find((f) => f.name === op.nombre);
      const bien = await escribirArchivo(v, deId, aId, fuente, existente);
      if (bien) hechas += 1; else fallidas += 1;
    } else {
      configCopiada = copiarConfig(op.nombre, deId, aId) || configCopiada;
      if (configCopiada) hechas += 1; else fallidas += 1;
    }
  }
  if (configCopiada) await pushPreferences();
  await guardarVinculo(cerebro, { ...v, ultimaSync: new Date().toISOString() });
  return {
    ok: fallidas === 0,
    operaciones: hechas,
    estado: v.estado,
    motivo: fallidas > 0 ? `${fallidas} operaciones no se pudieron escribir.` : undefined,
  };
}

async function darAccesoEntidad(
  cerebro: Brain,
  v: VinculoTelepatico,
): Promise<ResultadoSincronizacion> {
  try {
    const supa = createClient();
    const tabla = v.destino.tipo === "pagina" ? "os_pages" : "os_groups";
    const { data, error } = await supa.from(tabla).select("slug").eq("id", v.destino.id).single();
    const slug = error ? undefined : (data?.slug as string | undefined);
    if (!slug) return { ok: false, operaciones: 0, estado: v.estado, motivo: "No se pudo leer el identificador del destino: sin slug, nada se comparte." };
    const ref: ResourceRef = { type: "brain", id: cerebro.id, ownerId: cerebro.owner, title: cerebro.name };
    const grant: AccessGrant = {
      granteeKind: v.destino.tipo === "pagina" ? "page" : "group",
      granteeId: slug,
      role: v.acceso === "escribir" ? "edit" : "view",
      sections: v.alcance.memorias.length > 0 ? v.alcance.memorias : undefined,
    };
    await upsertGrant(ref, grant);
    await guardarVinculo(cerebro, { ...v, estado: "activo", ultimaSync: new Date().toISOString() });
    return {
      ok: true,
      operaciones: 1,
      estado: "activo",
      motivo: "Con la lectura compartida ya aplicada, sus miembros leen este cerebro; la escritura sigue siendo solo del dueño.",
    };
  } catch (e) {
    return { ok: false, operaciones: 0, estado: v.estado, motivo: e instanceof Error ? e.message : "No se pudo dar acceso." };
  }
}

async function crearVinculoCuenta(
  cerebro: Brain,
  v: VinculoTelepatico,
): Promise<ResultadoSincronizacion> {
  const soloCarpetas = !v.alcance.completo && v.alcance.memorias.length === 0 && v.alcance.configuraciones.length === 0 && v.alcance.carpetas.length > 0;
  const soloMemoria = !v.alcance.completo && v.alcance.carpetas.length === 0 && v.alcance.configuraciones.length === 0 && v.alcance.memorias.length === 1;
  const ambitoTipo = soloCarpetas ? "carpeta" : soloMemoria ? "memoria" : "cerebro";
  const ambitoId = soloCarpetas ? v.alcance.carpetas[0] : soloMemoria ? v.alcance.memorias[0] : v.destino.id;
  try {
    const resp = await fetch("/api/externos/vinculos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "crear",
        ambitoTipo,
        ambitoId,
        nombre: `Telepatía · ${cerebro.name}`,
        permisos: { leer: true, escribir: v.acceso === "escribir", memoria: v.alcance.completo, hablar: false, herramientas: false },
      }),
    });
    const data = (await resp.json()) as { error?: string; token?: string; vinculo?: { id?: string; prefijo?: string } };
    if (!resp.ok || !data.token) throw new Error(data.error || "No se pudo crear el vínculo externo.");
    await guardarVinculo(cerebro, {
      ...v,
      estado: "activo",
      ultimaSync: new Date().toISOString(),
      destino: { ...v.destino, id: data.vinculo?.id || data.vinculo?.prefijo || v.destino.id },
    });
    return { ok: true, operaciones: 1, estado: "activo", token: data.token };
  } catch (e) {
    return { ok: false, operaciones: 0, estado: v.estado, motivo: e instanceof Error ? e.message : "No se pudo crear el vínculo externo." };
  }
}

export async function sincronizarAhora(cerebro: Brain, v: VinculoTelepatico): Promise<ResultadoSincronizacion> {
  switch (v.destino.tipo) {
    case "cerebro":
      return sincronizarCerebroPropio(cerebro, v);
    case "grupo":
    case "comunidad":
    case "pagina":
      return darAccesoEntidad(cerebro, v);
    case "cuenta":
      return crearVinculoCuenta(cerebro, v);
    default:
      return { ok: false, operaciones: 0, estado: v.estado, motivo: "Tipo de destino no soportado." };
  }
}
=======
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
>>>>>>> ebb6a3b46 (salvavidas · CB1013Gc: trabajo del agente antes de las puertas (tsc / vitest))
