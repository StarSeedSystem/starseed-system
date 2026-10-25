"use client";

/**
 * Aplica la fusión de cerebros (cerebros-fusion-telepatia.md §4 y §9 b).
 * Orden: copia de seguridad descargada (la hace el diálogo) → memorias →
 * cerebro destino → preferencias → quitar orígenes solo si todo fue bien.
 * Un cerebro origen con selecciones no se borra: su traslado llega con §9 b.
 */

import type { Brain } from "@/lib/brains/brains";
import type { ArchivoMemoria, PlanFusion, PrefsCerebro } from "./fusion";
import { createClient } from "@/utils/supabase/client";
import { deleteBrain, getBrain, saveBrain } from "@/lib/brains/brains";
import { senalEsencial } from "@/lib/consumo/guardian";
import { pushPreferences } from "@/lib/settings-sync";

export type LecturaFusion =
  | {
      ok: true;
      destino: Brain;
      origenes: Brain[];
      archivos: ArchivoMemoria[];
      prefs: Record<string, PrefsCerebro>;
    }
  | { ok: false; motivo: string };

export type CopiaDeSeguridad = { nombre: string; texto: string };

export type ResultadoFusion = {
  ok: boolean;
  archivosEscritos: number;
  bytes: number;
  origenesQuitados: string[];
  origenesConservados: Array<{ id: string; motivo: string }>;
  error?: string;
};

const REGEX_PREF = /^starseed\.brain\.([^.]+)\.(.+)$/;

export async function leerParaFusion(destinoId: string, origenIds: string[]): Promise<LecturaFusion> {
  const destino = await getBrain(destinoId);
  if (!destino) return { ok: false, motivo: `No se pudo leer el cerebro de destino (${destinoId}).` };
  const origenes: Brain[] = [];
  for (const id of origenIds) {
    const origen = await getBrain(id);
    if (!origen) return { ok: false, motivo: `No se pudo leer el cerebro de origen (${id}).` };
    origenes.push(origen);
  }
  const sb = createClient();
  const ids = [destinoId, ...origenIds];
  const { data, error } = await sb
    .from("brain_memory_files")
    .select("id,brain_id,name,content,updated_at,meta")
    .in("brain_id", ids)
    .abortSignal(senalEsencial());
  if (error) return { ok: false, motivo: `No se pudo leer la memoria de los cerebros (${error.message}).` };
  const archivos = (data ?? []) as ArchivoMemoria[];
  return { ok: true, destino, origenes, archivos, prefs: leerPrefs(ids) };
}

/** Preferencias por cerebro de `localStorage` (`starseed.brain.<id>.<clave>`), con JSON.parse defensivo. */
function leerPrefs(ids: string[]): Record<string, PrefsCerebro> {
  const prefs: Record<string, PrefsCerebro> = {};
  if (typeof window === "undefined") return prefs;
  const deseados = new Set(ids);
  try {
    const almacen = window.localStorage;
    for (let i = 0; i < almacen.length; i++) {
      const clave = almacen.key(i);
      if (!clave) continue;
      const m = REGEX_PREF.exec(clave);
      if (!m || !deseados.has(m[1])) continue;
      try {
        (prefs[m[1]] ??= {})[m[2]] = JSON.parse(almacen.getItem(clave) ?? "");
      } catch {
        /* preferencia rota: se ignora, no tumba la lectura */
      }
    }
  } catch {
    /* almacenamiento bloqueado: se devuelve lo que haya */
  }
  return prefs;
}

export function copiaDeSeguridad(datos: LecturaFusion, fecha: string): CopiaDeSeguridad {
  return { nombre: `cerebros-fusion-${fecha}.json`, texto: JSON.stringify(datos, null, 2) };
}

export function descargarCopia(copia: CopiaDeSeguridad): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const blob = new Blob([copia.texto], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = copia.nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function aplicarFusion(
  plan: PlanFusion,
  o: { destino: Brain; origenIds: string[]; quitarOrigenes: boolean }
): Promise<ResultadoFusion> {
  const r: ResultadoFusion = { ok: false, archivosEscritos: 0, bytes: 0, origenesQuitados: [], origenesConservados: [] };
  try {
    const sb = createClient();
    // (1) Memorias: escribir cada archivo del plan (el destino ya tiene nombre; el insert lleva «source: fusion»).
    for (const a of plan.archivos) {
      if (a.accion === "omitir") continue;
      const { error } = a.idDestino
        ? await sb
            .from("brain_memory_files")
            .update({ content: a.contenido, updated_at: new Date().toISOString() })
            .eq("id", a.idDestino)
            .abortSignal(senalEsencial())
        : await sb
            .from("brain_memory_files")
            .insert({ brain_id: o.destino.id, name: a.name, content: a.contenido, source: "fusion" })
            .abortSignal(senalEsencial());
      if (error) return { ...r, error: `No se pudo escribir la memoria «${a.name}» (${error.message}).` };
      r.archivosEscritos++;
      r.bytes += a.bytesQueEntran;
    }
    // (2) El cerebro destino con includes, servidores y config fusionados.
    const guardado = await saveBrain({
      ...o.destino,
      includes: plan.includes,
      servers: plan.servers,
      config: plan.config,
    });
    if (!guardado) return { ...r, error: `No se pudo guardar el cerebro «${o.destino.name}».` };
    // (3) Preferencias del destino en localStorage y sincronizadas a la cuenta.
    try {
      for (const [sufijo, valor] of Object.entries(plan.prefs)) {
        window.localStorage.setItem(`starseed.brain.${o.destino.id}.${sufijo}`, JSON.stringify(valor));
      }
    } catch (error) {
      return { ...r, error: `No se pudieron guardar las preferencias (${motivo(error)}).` };
    }
    const prefsSincronizadas = await pushPreferences();
    if (!prefsSincronizadas.ok) {
      return { ...r, error: `No se pudieron sincronizar las preferencias (${prefsSincronizadas.message}).` };
    }
    // (4) Quitar los orígenes solo si todo lo anterior fue bien y así se pidió.
    if (o.quitarOrigenes) {
      for (const id of o.origenIds) {
        const { data, error } = await sb
          .from("brain_selections")
          .select("brain_id")
          .eq("brain_id", id)
          .abortSignal(senalEsencial());
        if (error) {
          r.origenesConservados.push({ id, motivo: "no se pudieron comprobar sus selecciones" });
          continue;
        }
        if ((data ?? []).length > 0) {
          r.origenesConservados.push({ id, motivo: "tiene selecciones; se moverán cuando se aplique §9 b" });
          continue;
        }
        if (await deleteBrain(id)) r.origenesQuitados.push(id);
        else r.origenesConservados.push({ id, motivo: "no se pudo borrar, quedará cuando vuelva la conexión" });
      }
    }
    return { ...r, ok: true };
  } catch (error) {
    return { ...r, error: `No se aplicó la fusión (${motivo(error)}).` };
  }
}

function motivo(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
