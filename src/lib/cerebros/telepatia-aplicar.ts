"use client";
/** Telepatía aplicada: guarda el vínculo y lo ejecuta sin mezclar cerebros.
 * Un cerebro propio recibe lo más nuevo y nunca pierde lo suyo; una entidad
 * recibe un permiso de lectura; una cuenta externa recibe un token de un solo uso. */
import { type Brain, saveBrain } from "@/lib/brains/brains";
import { type MemoryFile } from "@/lib/cerebro/memory-files";
import { senalEsencial } from "@/lib/consumo/guardian";
import { pushPreferences } from "@/lib/settings-sync";
import { upsertGrant, type AccessGrant, type ResourceRef } from "@/lib/sharing/access";
import { createClient } from "@/utils/supabase/client";
import { CONFIGURACIONES_TELEPATIA, conVinculo, planSincronizacion, sinVinculo, type VinculoTelepatico } from "./telepatia";
export interface ResultadoSincronizacion { ok: boolean; operaciones: number; estado: VinculoTelepatico["estado"]; motivo?: string; token?: string }
type Cliente = ReturnType<typeof createClient>;
export async function guardarVinculo(cerebro: Brain, v: VinculoTelepatico): Promise<Brain | null> {
  return saveBrain({ ...cerebro, config: conVinculo(cerebro.config, v) });
}
export async function quitarVinculo(cerebro: Brain, id: string): Promise<Brain | null> { return saveBrain({ ...cerebro, config: sinVinculo(cerebro.config, id) }); }
async function leerArchivos(sb: Cliente, brainId: string): Promise<MemoryFile[]> {
  const { data, error } = await sb.from("brain_memory_files").select("*").eq("brain_id", brainId).abortSignal(senalEsencial());
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[] | null) ?? []).map((f) => ({
    id: String(f.id ?? ""), owner: typeof f.owner === "string" ? f.owner : undefined,
    brain_id: typeof f.brain_id === "string" ? f.brain_id : brainId, name: String(f.name ?? ""),
    content: String(f.content ?? ""), source: String(f.source ?? "starseed"),
    server_config: (f.server_config as Record<string, unknown> | null) ?? {},
    meta: (f.meta as Record<string, unknown> | null) ?? {},
    sync: Boolean(f.sync), updated_at: f.updated_at ? String(f.updated_at) : undefined,
  }));
}
function claveDePref(brainId: string, clave: string): string { return `starseed.brain.${brainId}.${clave}`; }
function leerPrefs(brainId: string, claves: readonly string[]): Record<string, unknown> {
  const prefs: Record<string, unknown> = {};
  if (typeof window === "undefined") return prefs;
  for (const clave of claves) {
    const bruto = window.localStorage.getItem(claveDePref(brainId, clave));
    if (bruto === null) continue;
    try { prefs[clave] = JSON.parse(bruto); } catch { prefs[clave] = bruto; }
  }
  return prefs;
}
async function sincronizarCerebro(cerebro: Brain, v: VinculoTelepatico): Promise<ResultadoSincronizacion> {
  const claves = v.alcance.completo ? CONFIGURACIONES_TELEPATIA : v.alcance.configuraciones;
  let operaciones = 0;
  try {
    const sb = createClient();
    const { data: sesion } = await sb.auth.getUser();
    const owner = sesion?.user?.id ?? cerebro.owner ?? "";
    const origen = await leerArchivos(sb, cerebro.id); const destino = await leerArchivos(sb, v.destino.id);
    const plan = planSincronizacion(v, { archivos: origen, prefs: leerPrefs(cerebro.id, claves) }, { archivos: destino, prefs: leerPrefs(v.destino.id, claves) });
    let huboConfig = false;
    for (const op of plan) {
      if (op.tipo === "carpeta") continue;
      const desde = op.de === "origen" ? cerebro.id : v.destino.id; const hacia = op.a === "origen" ? cerebro.id : v.destino.id;
      if (op.tipo === "config") {
        if (typeof window === "undefined") continue;
        const bruto = window.localStorage.getItem(claveDePref(desde, op.nombre));
        if (bruto === null) continue;
        window.localStorage.setItem(claveDePref(hacia, op.nombre), bruto);
        operaciones += 1; huboConfig = true; continue;
      }
      const fuente = (op.de === "origen" ? origen : destino).find((f) => f.name === op.nombre);
      const objetivo = (op.a === "origen" ? origen : destino).find((f) => f.name === op.nombre);
      if (!fuente) continue;
      const datos = { content: fuente.content, meta: { ...fuente.meta, telepatia: v.id }, updated_at: new Date().toISOString() };
      const error = objetivo?.id
        ? (await sb.from("brain_memory_files").update(datos).eq("id", objetivo.id)).error
        : (await sb.from("brain_memory_files").insert({ ...datos, owner, brain_id: hacia, name: fuente.name, source: fuente.source, server_config: fuente.server_config, sync: fuente.sync })).error;
      if (error) throw new Error(error.message);
      operaciones += 1;
    }
    if (huboConfig) await pushPreferences();
    await guardarVinculo(cerebro, { ...v, estado: "activo", ultimaSync: new Date().toISOString() });
    return { ok: true, operaciones, estado: "activo" };
  } catch (e) {
    return { ok: false, operaciones, estado: v.estado, motivo: e instanceof Error ? e.message : "No se pudo sincronizar entre los cerebros." };
  }
}
async function compartirEntidad(cerebro: Brain, v: VinculoTelepatico): Promise<ResultadoSincronizacion> {
  try {
    const sb = createClient();
    const tabla = v.destino.tipo === "pagina" ? "os_pages" : "os_groups";
    const { data, error } = await sb.from(tabla).select("slug").eq("id", v.destino.id).maybeSingle();
    const slug = !error && data && typeof data.slug === "string" ? data.slug : "";
    if (!slug) return { ok: false, operaciones: 0, estado: "pendiente", motivo: "No se pudo leer el identificador (slug) de la entidad; el vínculo queda pendiente." };
    const secciones = v.alcance.completo ? undefined : [...v.alcance.memorias, ...v.alcance.carpetas, ...v.alcance.configuraciones];
    const ref: ResourceRef = { type: "brain", id: cerebro.id, ownerId: cerebro.owner, title: cerebro.name };
    const grant: AccessGrant = { granteeKind: v.destino.tipo === "pagina" ? "page" : "group", granteeId: slug, role: v.acceso === "escribir" ? "edit" : "view", sections: secciones };
    await upsertGrant(ref, grant);
    await guardarVinculo(cerebro, { ...v, estado: "activo", ultimaSync: new Date().toISOString() });
    return { ok: true, operaciones: 1, estado: "activo", motivo: "Los miembros pueden leer el cerebro compartido; escribir sigue siendo solo del dueño." };
  } catch (e) {
    return { ok: false, operaciones: 0, estado: v.estado, motivo: e instanceof Error ? e.message : "No se pudo compartir con la entidad." };
  }
}
async function vincularCuenta(cerebro: Brain, v: VinculoTelepatico): Promise<ResultadoSincronizacion> {
  const soloMemorias = !v.alcance.completo && v.alcance.memorias.length > 0 && v.alcance.carpetas.length === 0 && v.alcance.configuraciones.length === 0;
  const soloCarpetas = !v.alcance.completo && v.alcance.carpetas.length > 0 && v.alcance.memorias.length === 0 && v.alcance.configuraciones.length === 0;
  const ambitoTipo = soloMemorias ? "memoria" : soloCarpetas ? "carpeta" : "cerebro";
  try {
    const resp = await fetch("/api/externos/vinculos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "crear", ambitoTipo, ambitoId: cerebro.id, nombre: `Telepatía · ${cerebro.name}`,
        permisos: { leer: true, escribir: v.acceso === "escribir", memoria: v.alcance.completo || v.alcance.memorias.length > 0, herramientas: false, hablar: false } }),
    });
    const datos = (await resp.json()) as Record<string, unknown>;
    if (!resp.ok) throw new Error(typeof datos.error === "string" ? datos.error : "No se pudo crear el vínculo externo.");
    const token = typeof datos.token === "string" ? datos.token : undefined;
    const externo = datos.vinculo as Record<string, unknown> | undefined;
    const idExterno = externo && typeof externo.id === "string" ? externo.id : v.destino.id;
    await guardarVinculo(cerebro, { ...v, destino: { tipo: "cuenta", id: idExterno }, estado: "activo", ultimaSync: new Date().toISOString() });
    return { ok: true, operaciones: 1, estado: "activo", token, motivo: "Guarda el token ahora: no se volverá a mostrar." };
  } catch (e) {
    return { ok: false, operaciones: 0, estado: v.estado, motivo: e instanceof Error ? e.message : "No se pudo crear el vínculo externo." };
  }
}
export async function sincronizarAhora(cerebro: Brain, v: VinculoTelepatico): Promise<ResultadoSincronizacion> {
  if (v.destino.tipo === "cerebro") return sincronizarCerebro(cerebro, v);
  return v.destino.tipo === "cuenta" ? vincularCuenta(cerebro, v) : compartirEntidad(cerebro, v);
}
