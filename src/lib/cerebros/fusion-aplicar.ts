"use client";

/**
 * Aplica el plan de «Fusionar» de verdad (cerebros-fusion-telepatia.md §4).
 *
 * · `leerParaFusion` lee destino, orígenes, memorias y preferencias (marcando
 *   la lectura como esencial con `senalEsencial`).
 * · `copiaDeSeguridad` y `descargarCopia` protegen el camino ANTES de escribir.
 * · `aplicarFusion` escribe en orden: memorias → cerebro → preferencias →
 *   (solo si todo fue bien) quitar orígenes, menos los que tienen selecciones.
 *
 * Nunca lanza: todo fallo sale en el resultado. Lo que no se puede medir no se
 * inventa: si algo cae, «ok» es falso con el motivo.
 */

import { createClient } from "@/utils/supabase/client";
import { getBrain, saveBrain, deleteBrain, type Brain } from "@/lib/brains/brains";
import { senalEsencial } from "@/lib/consumo/guardian";
import { pushPreferences } from "@/lib/settings-sync";
import type { ArchivoMemoria, PlanFusion, PrefsCerebro } from "@/lib/cerebros/fusion";

export interface DatosFusion {
  destino: Brain;
  origenes: Brain[];
  archivos: ArchivoMemoria[];
  prefs: Record<string, PrefsCerebro>;
}

export type LecturaFusion =
  | { ok: true; destino: Brain; origenes: Brain[]; archivos: ArchivoMemoria[]; prefs: Record<string, PrefsCerebro> }
  | { ok: false; motivo: string };

export interface CopiaDeSeguridad {
  nombre: string;
  texto: string;
}

export interface ResultadoFusion {
  ok: boolean;
  archivosEscritos: number;
  bytes: number;
  origenesQuitados: string[];
  origenesConservados: Array<{ id: string; motivo: string }>;
  error?: string;
}

export interface OpcionesAplicarFusion {
  destino: Brain;
  origenIds: string[];
  quitarOrigenes: boolean;
}

/** Leé las preferencias de un cerebro (claves `starseed.brain.<id>.<sufijo>`). */
function leerPrefsDeCerebro(id: string): PrefsCerebro {
  const respuesta: PrefsCerebro = {};
  if (typeof window === "undefined") return respuesta;
  const prefijo = `starseed.brain.${id}.`;
  const claves: string[] = [];
  try {
    const almacen = window.localStorage;
    if (!almacen) return respuesta;
    for (let i = 0; i < almacen.length; i++) {
      const clave = almacen.key(i);
      if (clave && clave.startsWith(prefijo)) claves.push(clave);
    }
    for (const clave of claves) {
      const crudo = almacen.getItem(clave);
      if (crudo === null) continue;
      try {
        respuesta[clave.slice(prefijo.length)] = JSON.parse(crudo) as unknown;
      } catch {
        /* JSON inválido: se omite, nunca inventa */
      }
    }
  } catch {
    /* sin almacenamiento accesible: vacío, sin error */
  }
  return respuesta;
}

/**
 * Copia de seguridad con TODO lo leído, ANTES de escribir nada. Pura: solo
 * construye el archivo, no toca disco ni red.
 */
export function copiaDeSeguridad(datos: DatosFusion, fecha: string): CopiaDeSeguridad {
  const texto = JSON.stringify({ fecha, destino: datos.destino, origenes: datos.origenes, archivos: datos.archivos, prefs: datos.prefs }, null, 2);
  return { nombre: `cerebros-fusion-${fecha}.json`, texto };
}

/** Descarga la copia en este aparato. Sin `window` no hace nada y devuelve false. */
export function descargarCopia(copia: CopiaDeSeguridad): boolean {
  if (typeof window === "undefined") return false;
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

/** Lee todo lo que la fusión necesita. Sin inventar nada: lo que falla, falla entero. */
export async function leerParaFusion(destinoId: string, origenIds: string[]): Promise<LecturaFusion> {
  try {
    const destino = await getBrain(destinoId);
    if (!destino) return { ok: false, motivo: `No se pudo leer el cerebro de destino (${destinoId}).` };
    const origenes: Brain[] = [];
    for (const id of origenIds) {
      const origen = await getBrain(id);
      if (!origen) return { ok: false, motivo: `No se pudo leer el cerebro de origen (${id}).` };
      origenes.push(origen);
    }
    const sb = createClient();
    const { data, error } = await sb
      .from("brain_memory_files")
      .select("id,brain_id,name,content,updated_at,meta")
      .in("brain_id", [destinoId, ...origenIds])
      .abortSignal(senalEsencial());
    if (error || !Array.isArray(data)) {
      return { ok: false, motivo: "No se pudieron leer las memorias de los cerebros implicados." };
    }
    const archivos: ArchivoMemoria[] = (data as Record<string, unknown>[]).map((f) => ({
      ...(typeof f.id === "string" ? { id: f.id } : {}),
      brain_id: f.brain_id as string,
      name: f.name as string,
      content: (f.content as string) ?? "",
      updated_at: (f.updated_at as string) ?? null,
      meta: (f.meta as Record<string, unknown> | null) ?? null,
    }));
    const ids = [destinoId, ...origenIds];
    const prefs: Record<string, PrefsCerebro> = {};
    for (const id of ids) prefs[id] = leerPrefsDeCerebro(id);
    return { ok: true, destino, origenes, archivos, prefs };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "La lectura para fusionar falló." };
  }
}

/** Escribe una preferencia en este aparato. Devuelve si se pudo. */
function escribirPref(clave: string, valor: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(clave, valor);
    return true;
  } catch {
    return false;
  }
}

/**
 * Aplica el plan en este orden: memorias → cerebro → preferencias → quitar
 * orígenes. Si algo falla en lo primero, NO se borra ningún origen. Nunca lanza.
 */
export async function aplicarFusion(plan: PlanFusion, o: OpcionesAplicarFusion): Promise<ResultadoFusion> {
  const fallo = (error: string): ResultadoFusion => ({ ok: false, archivosEscritos: 0, bytes: 0, origenesQuitados: [], origenesConservados: [], error });
  try {
    const sb = createClient();
    let archivosEscritos = 0;
    let bytes = 0;
    for (const a of plan.archivos) {
      if (a.accion === "omitir") continue;
      const respuesta = a.idDestino
        ? await sb.from("brain_memory_files").update({ content: a.contenido, updated_at: new Date().toISOString() }).eq("id", a.idDestino)
        : await sb.from("brain_memory_files").insert({ brain_id: o.destino.id, name: a.name, content: a.contenido, source: "fusion" });
      if (respuesta.error) return fallo(`No se pudo guardar la memoria «${a.name}».`);
      archivosEscritos++;
      bytes += a.bytesQueEntran;
    }
    const guardado = await saveBrain({ ...o.destino, includes: plan.includes, servers: plan.servers, config: plan.config });
    if (!guardado) return fallo("No se pudo guardar el cerebro de destino.");
    for (const [sufijo, valor] of Object.entries(plan.prefs)) {
      if (!escribirPref(`starseed.brain.${o.destino.id}.${sufijo}`, JSON.stringify(valor))) {
        return fallo(`No se pudo guardar la preferencia «${sufijo}» en este aparato.`);
      }
    }
    await pushPreferences();
    const quitados: string[] = [];
    const conservados: ResultadoFusion["origenesConservados"] = [];
    if (!o.quitarOrigenes) {
      for (const id of o.origenIds) conservados.push({ id, motivo: "Se pidió conservar los cerebros fusionados." });
    } else {
      for (const id of o.origenIds) {
        try {
          const selecciones = await sb
            .from("brain_selections")
            .select("id")
            .eq("brain_id", id)
            .limit(1)
            .abortSignal(senalEsencial());
          if (Array.isArray(selecciones.data) && selecciones.data.length > 0) {
            conservados.push({ id, motivo: "Tiene selecciones; se moverán cuando se aplique §9 b." });
            continue;
          }
          if (await deleteBrain(id)) quitados.push(id);
          else conservados.push({ id, motivo: "No se pudo borrar; se conserva porque nada apunta ya a él." });
        } catch {
          conservados.push({ id, motivo: "No se pudo comprobar sus selecciones; por prudencia se conserva." });
        }
      }
    }
    return { ok: true, archivosEscritos, bytes, origenesQuitados: quitados, origenesConservados: conservados };
  } catch (e) {
    return fallo(e instanceof Error ? e.message : "La fusión falló sin error conocido.");
  }
}
