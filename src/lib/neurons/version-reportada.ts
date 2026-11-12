/**
 * LLA1112B · la versión de OTRA neurona «según su registro» y cuándo la informó ella.
 * ═════════════════════════════════════════════════════════════════════════════════
 * Prueba 39: Mensajes → Neuronas enseñaba «Versión 0.5.1-prueba.37 (según su registro)» de la tableta, que ya corría la
 * .39. Causa (lectura): la lista de neuronas (`listNeurons`) relee las fichas de Supabase solo cada 30 min cuando la puerta
 * del A1 da la vida (`LISTA_REGISTRO_CON_PUERTA_MS`); la ficha con la versión nueva (`capabilities.aparato.version`, escrita
 * por la app al arrancar) ya estaba, pero el chat enseñaba la copia de hacía 30 min. Causa (escritura): si la subida de la
 * ficha fallaba al arrancar (sin red un momento), el latido no la repetía hasta 6 vueltas después (`neurons.ts`).
 * Aquí: lectura fresca de UNA fila (`leerAparatoFresco`, con una caché corta) y el texto de «cuándo se informó».
 */
import { createClient } from "@/utils/supabase/client";
import { leerAparato, type AparatoRegistro } from "@/lib/neurons/aparato-registro";

export const VIDA_LECTURA_FRESCA_MS = 60_000;
const cache = new Map<string, { en: number; aparato: AparatoRegistro | null }>();

/** «hace 3 min», «hace 2 h», «ayer»… Pura. Con fecha ilegible o futura: null. */
export function textoHaceTiempo(iso: string | null | undefined, ahora: number = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = Math.round((ahora - t) / 1000);
  if (s < -120) return null;
  if (s < 90) return "hace un momento";
  const min = Math.round(s / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

/** El bloque `capabilities.aparato` de UNA neurona, leído ahora (no de la lista cacheada). Nunca lanza; null si no se pudo. */
export async function leerAparatoFresco(neuronaId: string, ahora: number = Date.now()): Promise<AparatoRegistro | null> {
  if (!neuronaId) return null;
  const c = cache.get(neuronaId);
  if (c && ahora - c.en < VIDA_LECTURA_FRESCA_MS) return c.aparato;
  try {
    const res = await createClient().from("neuron_devices").select("capabilities").eq("id", neuronaId).maybeSingle();
    if ((res as { error?: unknown }).error) return c?.aparato ?? null;
    const fila = (res as { data?: { capabilities?: unknown } | null }).data;
    const aparato = leerAparato(fila?.capabilities ?? null);
    cache.set(neuronaId, { en: ahora, aparato });
    return aparato;
  } catch {
    return c?.aparato ?? null;
  }
}

/** Solo pruebas. */
export function _olvidarLecturasFrescasParaPruebas(): void {
  cache.clear();
}
