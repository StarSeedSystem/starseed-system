// src/lib/cerebros/telepatia-aplicar.ts
/**
 * Aplica la Telepatía de un cerebro (contrato cerebros-fusion-telepatia.md §5).
 * Guardar y quitar vínculos van vía `saveBrain` con `conVinculo`/`sinVinculo`.
 * La sincronización «de verdad» (otro cerebro tuyo) planifica con `planSincronizacion`,
 * escribe cada archivo con `meta.telepatia = v.id`, nunca borra ni mezcla, y copia
 * las claves `starseed.brain.<id>.<config>` de localStorage según las ops de config.
 */
import { saveBrain, type Brain } from "@/lib/brains/brains";
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
  /** El cerebro guardado con el vínculo ya actualizado: la ficha pinta lo que de verdad quedó. */
  cerebroGuardado?: Brain;
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
  const guardado = await guardarVinculo(cerebro, { ...v, ultimaSync: new Date().toISOString() });
  return {
    ok: fallidas === 0,
    operaciones: hechas,
    estado: v.estado,
    motivo: fallidas > 0 ? `${fallidas} operaciones no se pudieron escribir.` : undefined,
    cerebroGuardado: guardado ?? undefined,
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
    const guardado = await guardarVinculo(cerebro, { ...v, estado: "activo", ultimaSync: new Date().toISOString() });
    return {
      ok: true,
      operaciones: 1,
      estado: "activo",
      motivo: "Con la lectura compartida ya aplicada, sus miembros leen este cerebro; la escritura sigue siendo solo del dueño.",
      cerebroGuardado: guardado ?? undefined,
    };
  } catch (e) {
    return { ok: false, operaciones: 0, estado: v.estado, motivo: e instanceof Error ? e.message : "No se pudo dar acceso." };
  }
}

async function crearVinculoCuenta(
  cerebro: Brain,
  v: VinculoTelepatico,
): Promise<ResultadoSincronizacion> {
  // El token se acuña UNA vez, al crear el vínculo: un vínculo que ya se entregó no crea otro.
  if (v.ultimaSync) {
    return {
      ok: true,
      operaciones: 0,
      estado: v.estado,
      motivo:
        "El token de la cuenta externa ya se entregó al crear el vínculo y no se vuelve a mostrar. Para compartir otra cosa, crea otro vínculo.",
    };
  }
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
    const guardado = await guardarVinculo(cerebro, {
      ...v,
      estado: "activo",
      ultimaSync: new Date().toISOString(),
      destino: { ...v.destino, id: data.vinculo?.id || data.vinculo?.prefijo || v.destino.id },
    });
    return { ok: true, operaciones: 1, estado: "activo", token: data.token, cerebroGuardado: guardado ?? undefined };
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
