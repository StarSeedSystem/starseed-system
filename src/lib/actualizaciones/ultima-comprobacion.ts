/**
 * (VER1107B · 2026-11-07) La última comprobación de actualizaciones de ESTE medio: cuándo fue y qué
 * salió. La escribe la ventana «Hay una versión nueva» (y el botón «Buscar actualizaciones» de
 * Ajustes › Esta neurona) y la lee ese panel. Solo en este aparato (localStorage); nunca lanza.
 * Contrato: architecture/centro-versiones-1105.md §8.
 */

export const CLAVE_ULTIMA_COMPROBACION = "starseed.actualizacion.ultima-comprobacion.v1";
export const EVENTO_COMPROBACION = "starseed:comprobacion-actualizacion";

export type ResultadoComprobacion = "al-dia" | "nueva" | "preparando" | "desconocida" | "error";

export interface UltimaComprobacion {
  /** epoch ms */
  en: number;
  resultado: ResultadoComprobacion;
  instalada: string | null;
  publicada: string | null;
  texto: string;
}

const RESULTADOS: readonly ResultadoComprobacion[] = ["al-dia", "nueva", "preparando", "desconocida", "error"];

/** Valida lo guardado. Pura. */
export function sanearComprobacion(x: unknown): UltimaComprobacion | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.en !== "number" || !Number.isFinite(o.en)) return null;
  if (!RESULTADOS.includes(o.resultado as ResultadoComprobacion)) return null;
  const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);
  return { en: o.en, resultado: o.resultado as ResultadoComprobacion, instalada: t(o.instalada), publicada: t(o.publicada), texto: t(o.texto) ?? "" };
}

export function leerUltimaComprobacion(): UltimaComprobacion | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_ULTIMA_COMPROBACION);
    return crudo ? sanearComprobacion(JSON.parse(crudo)) : null;
  } catch {
    return null;
  }
}

export function guardarUltimaComprobacion(c: Omit<UltimaComprobacion, "en"> & { en?: number }): UltimaComprobacion | null {
  const lista = sanearComprobacion({ ...c, en: c.en ?? Date.now() });
  if (!lista) return null;
  try {
    window.localStorage.setItem(CLAVE_ULTIMA_COMPROBACION, JSON.stringify(lista));
  } catch {
    /* modo privado o sin cuota: el panel no lo verá, nada más */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_COMPROBACION, { detail: lista }));
  } catch {
    /* sin window */
  }
  return lista;
}

/** «hace 3 min», «hace 2 h», «el 7/11 a las 10:05». Pura. */
export function haceCuanto(en: number, ahora: number = Date.now()): string {
  const s = Math.max(0, Math.round((ahora - en) / 1000));
  if (s < 45) return "hace un momento";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = new Date(en);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `el ${d.getDate()}/${d.getMonth() + 1} a las ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
