/*
 * almacenes-cliente — los almacenes detectados vistos desde la web (ALC1125B, parte 3).
 * Contrato: architecture/almacenes-cerebros.md. Espejo de native/src-tauri/src/almacenes.rs.
 *
 * Pide a la app nativa `almacenes_listar` por un puente inyectado, sanea la respuesta y deja listas las
 * vistas que necesita la interfaz: candidatos para guardar un cerebro (nunca el disco del sistema) y
 * textos legibles. Puro: sin Node, sin React.
 */

import { COMANDO_ALMACENES_LISTAR, sanearAlmacenesListar } from "./almacenes";
import type { Almacen, AlmacenesListarResultado, Resultado } from "./tipos";

export { COMANDO_ALMACENES_LISTAR };

type Llamar = <T>(cmd: string, args?: Record<string, unknown>) => Promise<Resultado<T>>;

/** Frase para una persona a partir del error de Rust. Nunca enseña códigos sueltos. */
export function fraseAlmacenes(motivo: string | null | undefined): string {
  const m = String(motivo ?? "").trim();
  if (/^no-aplica/.test(m)) return "Los almacenes solo se detectan desde la app nativa de StarSeed OS.";
  if (/no encontrad|not found/i.test(m)) return "Este sistema no tiene la herramienta para listar discos.";
  return m.length > 0 ? m : "No se pudieron listar los almacenes.";
}

/** Un almacén sin identidad estable (ni UUID ni serie) no sirve para reconocerlo después. */
export function tieneIdentidad(a: Almacen): boolean {
  return a.uuid.trim().length > 0 || a.serie.trim().length > 0;
}

/** Candidatos para guardar un cerebro: nunca el disco del sistema, con identidad y con montaje. */
export function candidatosParaCerebro(r: AlmacenesListarResultado): Almacen[] {
  return r.almacenes.filter((a) => !a.es_disco_sistema && tieneIdentidad(a) && a.punto_montaje.length > 0);
}

/** Bytes legibles en base 1024 («1,5 KB»). */
export function bytesLegibles(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const unidades = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), unidades.length - 1);
  const v = n / 1024 ** i;
  const txt = i === 0 || v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  return `${txt} ${unidades[i]}`;
}

/** Porcentaje de espacio libre (0–100, entero). 0 si el total no es válido. */
export function porcentajeLibre(a: Pick<Almacen, "total_bytes" | "libre_bytes">): number {
  if (!(a.total_bytes > 0)) return 0;
  const p = (Math.min(Math.max(a.libre_bytes, 0), a.total_bytes) / a.total_bytes) * 100;
  return Math.round(p);
}

/** Resumen de una línea para la lista: «Disco USB · exfat · 50 GB libres de 100 GB». */
export function resumenAlmacen(a: Almacen): string {
  const fs = typeof a.sistema_archivos === "string" ? a.sistema_archivos : a.sistema_archivos.desconocido;
  const nombre = a.etiqueta.trim() || "Sin nombre";
  return `${nombre} · ${fs} · ${bytesLegibles(a.libre_bytes)} libres de ${bytesLegibles(a.total_bytes)}`;
}

/** Pide la lista a la app nativa. Nunca lanza; devuelve frases claras. */
export async function listarAlmacenesNativos(llamar: Llamar): Promise<Resultado<AlmacenesListarResultado>> {
  const r = await llamar<unknown>(COMANDO_ALMACENES_LISTAR);
  if (!r.ok) return { ok: false, motivo: fraseAlmacenes(r.motivo) };
  const saneado = sanearAlmacenesListar(r.valor);
  if (!saneado) return { ok: false, motivo: "La app nativa devolvió una lista de almacenes no válida." };
  return { ok: true, valor: saneado };
}
