// Imaginación · servidor de propuestas y ajustes (Ola 1021I · IMN1021G). SOLO servidor.
// Contrato: architecture/imaginacion-autodesarrollo.md §3, §4 y §6. Lee y escribe
// `starseed_memory_root/imaginacion/propuestas.json` (raíz con `raizDelProyecto()`) y
// `~/.starseed/autodesarrollo.json`, siempre con escritura atómica. Aprobar marca «aprobada»
// (el director la encola en su ciclo) o, si la fuente es Astraura, la aplica en su backend 1.58
// local; si no responde, error honesto y NADA cambia. Jamás devuelve rutas del disco.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { raizDelProyecto } from "@/lib/mando/raiz";
import { NOMBRE_FUENTE, validarAjustes, type AjustesAutodesarrollo, type EstadoPropuesta, type FuentePropuesta, type ImportanciaPropuesta, type PropuestaImaginacion } from "@/lib/mando/imaginacion-tipos";

export type PropuestaVisible = PropuestaImaginacion & { hasta?: string };
export type Resultado = { ok: true; propuesta: PropuestaVisible } | { ok: false; error: string };
type Crudo = Record<string, unknown>;
export interface Lugar { raiz?: string; casa?: string }
const ESTADOS: EstadoPropuesta[] = ["nueva", "autodesarrollo", "esperando-aprobacion", "pregunta", "descartada", "aprobada", "rechazada", "pospuesta", "hecha"];
const IMPORTANCIAS: ImportanciaPropuesta[] = ["baja", "media", "alta", "crítica"];
const DECIDIBLES: EstadoPropuesta[] = ["esperando-aprobacion", "pregunta", "pospuesta"]; // lo que decide Alex (como `filasMedidor`)
const TIPO_ASTRAURA: Record<string, string> = { creacion: "creation", rama: "branch", creation: "creation", branch: "branch" }; // director → backend 1.58
const esObj = (v: unknown): v is Crudo => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
export function rutasImaginacion({ raiz = raizDelProyecto(), casa = os.homedir() }: Lugar = {}) {
  return { propuestas: path.join(raiz, "starseed_memory_root", "imaginacion", "propuestas.json"), ajustes: path.join(casa, ".starseed", "autodesarrollo.json") };
}

/** Propuesta del disco → la que ve Genesis: tipada, acotada y sin rutas absolutas. PURA. */
export function normalizarPropuesta(d: unknown): PropuestaVisible | null {
  if (!esObj(d) || typeof d.id !== "string" || !d.id.trim() || typeof d.fuente !== "string" || !Object.hasOwn(NOMBRE_FUENTE, d.fuente)) return null;
  const archivos = Array.isArray(d.archivos) ? d.archivos.filter((a): a is string => typeof a === "string" && !path.isAbsolute(a) && !/^[a-z]:|(^|\/)\.\.(\/|$)|^~/i.test(a)).map((a) => a.slice(0, 200)) : [];
  const utilidad = typeof d.utilidad === "number" && Number.isFinite(d.utilidad) ? Math.min(1, Math.max(0, d.utilidad)) : 0;
  const p: PropuestaVisible = {
    id: d.id.trim().slice(0, 120), fuente: d.fuente as FuentePropuesta, titulo: texto(d.titulo, 200), cuerpo: texto(d.cuerpo, 2000), archivos, utilidad,
    importancia: IMPORTANCIAS.includes(d.importancia as ImportanciaPropuesta) ? (d.importancia as ImportanciaPropuesta) : "media",
    estado: ESTADOS.includes(d.estado as EstadoPropuesta) ? (d.estado as EstadoPropuesta) : "nueva", motivo: texto(d.motivo, 300), t: texto(d.t, 40),
  };
  if (typeof d.tarea === "string" && d.tarea) p.tarea = d.tarea.slice(0, 80);
  if (typeof d.hasta === "string" && d.hasta) p.hasta = d.hasta.slice(0, 40);
  return p;
}

/** El ítem del backend 1.58 de una propuesta de Astraura, o null si no lo tiene. PURA. */
export function itemAstraura(d: Crudo): { item_id: string; item_type: string } | null {
  const o = esObj(d.origen) ? d.origen : {};
  const tipo = TIPO_ASTRAURA[String(o.tipo ?? "")];
  return d.fuente === "astraura" && typeof o.id === "string" && o.id && tipo ? { item_id: o.id, item_type: tipo } : null;
}

/** Hasta cuándo queda pospuesta: de 1 a 720 horas, con el reloj por parámetro. PURA. */
export const posponerHasta = (ahoraMs: number, horas: number) => new Date(ahoraMs + Math.min(720, Math.max(1, horas)) * 3_600_000).toISOString();
const leerJson = (ruta: string): Promise<unknown> => readFile(ruta, "utf-8").then((t) => JSON.parse(t) as unknown, () => null);
async function escribirAtomico(ruta: string, datos: unknown): Promise<void> {
  await mkdir(path.dirname(ruta), { recursive: true });
  const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`, "utf-8");
  await rename(temporal, ruta);
}
/** Lista cruda (con los campos del director: origen, cita…) y cómo volver a guardarla con su forma. */
async function leerCrudas(lugar: Lugar) {
  const crudo = await leerJson(rutasImaginacion(lugar).propuestas);
  const lista = Array.isArray(crudo) ? crudo : esObj(crudo) && Array.isArray(crudo.propuestas) ? crudo.propuestas : [];
  const guardar = (l: unknown[]) => escribirAtomico(rutasImaginacion(lugar).propuestas, esObj(crudo) ? { ...crudo, propuestas: l } : l);
  return { lista: lista as unknown[], guardar };
}
export const leerPropuestas = async (lugar: Lugar = {}): Promise<PropuestaVisible[]> =>
  (await leerCrudas(lugar)).lista.map(normalizarPropuesta).filter((p): p is PropuestaVisible => p !== null);

/** Cambia una propuesta que espera decisión; `antes` puede vetar (y entonces nada se escribe). */
async function decidir(id: string, cambios: Crudo, lugar: Lugar, ahora: Date, antes?: (d: Crudo) => Promise<string | null>): Promise<Resultado> {
  const { lista, guardar } = await leerCrudas(lugar);
  const i = lista.findIndex((d) => esObj(d) && d.id === id);
  const d = lista[i];
  if (!esObj(d)) return { ok: false, error: "No existe esa propuesta." };
  if (!DECIDIBLES.includes(d.estado as EstadoPropuesta)) return { ok: false, error: `Esa propuesta está «${String(d.estado)}»: no espera tu decisión.` };
  const veto = antes ? await antes(d) : null;
  if (veto) return { ok: false, error: veto };
  const nueva: Crudo = { ...d, ...cambios, decidida: ahora.toISOString() };
  if (cambios.estado !== "pospuesta") delete nueva.hasta;
  lista[i] = nueva;
  await guardar(lista);
  return { ok: true, propuesta: normalizarPropuesta(nueva) as PropuestaVisible };
}

/** POST /api/imagination/action al backend 1.58 local; null si lo aplicó, o el error honesto. */
export async function aplicarEnAstraura(item: { item_id: string; item_type: string }, base: string, hace: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await hace(`${base.replace(/\/+$/, "")}/api/imagination/action`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...item, action: "apply" }), signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return `El backend 1.58 respondió HTTP ${res.status}: no se aplicó y nada cambió.`;
    const j = (await res.json().catch(() => null)) as { success?: boolean; ok?: boolean; error?: string } | null;
    if (j && (j.success === false || j.ok === false)) return `El backend 1.58 no la aplicó (${texto(j.error, 160) || "sin motivo"}): nada cambió.`;
    return null;
  } catch {
    return "El backend 1.58 no responde: no se aplicó y nada cambió.";
  }
}
export function aprobar(id: string, o: Lugar & { ahora?: Date; hace?: typeof fetch; base?: string } = {}): Promise<Resultado> {
  const base = o.base ?? process.env.ASTRAURA_158_URL ?? "http://127.0.0.1:8000";
  return decidir(id, { estado: "aprobada", motivo: "" }, o, o.ahora ?? new Date(), async (d) => {
    if (d.fuente !== "astraura") return null;
    const item = itemAstraura(d);
    return item ? aplicarEnAstraura(item, base, o.hace) : "Esta propuesta de Astraura no trae su ítem del backend 1.58: no se puede aplicar.";
  });
}
export const rechazar = (id: string, motivo = "", o: Lugar & { ahora?: Date } = {}) =>
  decidir(id, { estado: "rechazada", motivo: motivo.slice(0, 300) }, o, o.ahora ?? new Date());
export function posponer(id: string, horas: number, o: Lugar & { ahora?: Date } = {}): Promise<Resultado> {
  if (!Number.isFinite(horas) || horas < 1 || horas > 720) return Promise.resolve({ ok: false, error: "Se pospone de 1 a 720 horas." });
  const ahora = o.ahora ?? new Date();
  return decidir(id, { estado: "pospuesta", hasta: posponerHasta(ahora.getTime(), horas) }, o, ahora);
}
export const leerAjustes = async (lugar: Lugar = {}): Promise<AjustesAutodesarrollo> => validarAjustes(await leerJson(rutasImaginacion(lugar).ajustes));
/** Une lo nuevo a lo guardado (primer nivel) y lo valida con `validarAjustes`: lo inválido vuelve al defecto. */
export async function guardarAjustes(nuevos: unknown, lugar: Lugar = {}): Promise<AjustesAutodesarrollo> {
  const ajustes = validarAjustes({ ...(await leerAjustes(lugar)), ...(esObj(nuevos) ? nuevos : {}) });
  await escribirAtomico(rutasImaginacion(lugar).ajustes, ajustes);
  return ajustes;
}
