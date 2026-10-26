// Tipos y utilidades compartidas para adaptadores de publicaciones y mensajes.
import type { EstiloMensaje } from "@/lib/mensajeria/formato-tipos";
import type { LayoutDoc } from "@/components/publish/layout-builder";
import { leerClave } from "../clave-elemento";
import { validarVariacion } from "../validar";

export type FamiliaPublicacion = "estilo" | "plantilla" | "decoracion";
export interface PayloadPostEstilo { estilo: EstiloMensaje; }
export interface PayloadPostPlantilla { plantilla: LayoutDoc; }
export interface PayloadPostDecoracion { decoracion: Record<string, unknown>; }
export type PayloadPublicacion = PayloadPostEstilo | PayloadPostPlantilla | PayloadPostDecoracion;
export interface PayloadMensajeEditor { estilo: EstiloMensaje; layout?: LayoutDoc; }
export interface DepsPublicaciones {
  leerEstiloPost: (postId: string) => EstiloMensaje | null;
  leerPlantillaPost: (postId: string) => LayoutDoc | null;
  leerDecoracionPost: (postId: string) => Record<string, unknown> | null;
  leerEstiloMensaje: () => EstiloMensaje | null;
  leerLayoutMensaje: () => LayoutDoc | null;
}
const PARTES_POST: FamiliaPublicacion[] = ["estilo", "plantilla", "decoracion"];
export function idDeClavePost(clave: string): { postId: string; parte: FamiliaPublicacion } | null {
  const l = leerClave(clave);
  if (!l || !l.startsWith("post:")) return null;
  const [, resto] = l.split(":", 2);
  const [postId, parte] = resto.split("#", 2);
  if (!postId || !parte || !PARTES_POST.includes(parte as FamiliaPublicacion)) return null;
  return { postId, parte: parte as FamiliaPublicacion };
}
function esEstiloMensaje(v: unknown): v is EstiloMensaje {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return Object.keys(o).every((k) => ["fuente","tamano","color","colorMarco","grosorMarco","fondo","animacionTexto","animacionFondo","alineacion","negrita","cursiva"].includes(k));
}
function esLayoutDoc(v: unknown): v is LayoutDoc {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (o.mode === "bloques" || o.mode === "codigo") && typeof o.preset === "string" && Array.isArray(o.blocks) && typeof o.freeCode === "object" && o.freeCode !== null;
}
function limpiarEstilo(e: EstiloMensaje): EstiloMensaje {
  const out: EstiloMensaje = {};
  for (const [k, v] of Object.entries(e)) if (v !== undefined && v !== null && v !== "" && v !== false && v !== "ninguna") (out as Record<string, unknown>)[k] = v;
  return Object.keys(out).length ? out : {};
}
function limpiarLayout(doc: LayoutDoc): LayoutDoc {
  return { ...doc, blocks: doc.blocks.map((b) => ({ ...b, content: b.content.trim(), content2: b.content2?.trim() ?? "", content3: b.content3?.trim() ?? "", href: b.href?.trim() ?? "", history: b.history.slice(0, 5) })), freeCode: { ...doc.freeCode } };
}
function validarPostEstilo(payload: unknown): { ok: true; payload: PayloadPostEstilo } | { ok: false; motivos: string[] } {
  const base = validarVariacion(payload, { codigo: true });
  if (!base.ok) return { ok: false, motivos: base.motivos };
  if (typeof payload !== "object" || payload === null) return { ok: false, motivos: ["Post#estilo: el payload debe ser un objeto"] };
  const p = payload as Record<string, unknown>;
  if (!("estilo" in p)) return { ok: false, motivos: ["Post#estilo: falta el campo 'estilo'"] };
  if (!esEstiloMensaje(p.estilo)) return { ok: false, motivos: ["Post#estilo: estructura de estilo inválida"] };
  return { ok: true, payload: { estilo: limpiarEstilo(p.estilo as EstiloMensaje) } };
}
function validarPostPlantilla(payload: unknown): { ok: true; payload: PayloadPostPlantilla } | { ok: false; motivos: string[] } {
  const base = validarVariacion(payload, { codigo: true });
  if (!base.ok) return { ok: false, motivos: base.motivos };
  if (typeof payload !== "object" || payload === null) return { ok: false, motivos: ["Post#plantilla: el payload debe ser un objeto"] };
  const p = payload as Record<string, unknown>;
  if (!("plantilla" in p)) return { ok: false, motivos: ["Post#plantilla: falta el campo 'plantilla'"] };
  if (!esLayoutDoc(p.plantilla)) return { ok: false, motivos: ["Post#plantilla: estructura de layout inválida"] };
  return { ok: true, payload: { plantilla: limpiarLayout(p.plantilla as LayoutDoc) } };
}
export function validarPayloadPostEstilo(payload: unknown) { return validarPostEstilo(payload); }
export function validarPayloadPostPlantilla(payload: unknown) { return validarPostPlantilla(payload); }
export function validarPayloadPostDecoracion(payload: unknown): { ok: true; payload: PayloadPostDecoracion } | { ok: false; motivos: string[] } {
  const base = validarVariacion(payload, { codigo: true });
  if (!base.ok) return { ok: false, motivos: base.motivos };
  if (typeof payload !== "object" || payload === null) return { ok: false, motivos: ["Post#decoracion: el payload debe ser un objeto"] };
  const p = payload as Record<string, unknown>;
  if (!("decoracion" in p)) return { ok: false, motivos: ["Post#decoracion: falta el campo 'decoracion'"] };
  if (typeof p.decoracion !== "object" || p.decoracion === null) return { ok: false, motivos: ["Post#decoracion: debe ser un objeto"] };
  return { ok: true, payload: { decoracion: p.decoracion as Record<string, unknown> } };
}
export function validarPayloadMensaje(payload: unknown): { ok: true; payload: PayloadMensajeEditor } | { ok: false; motivos: string[] } {
  const base = validarVariacion(payload, { codigo: true });
  if (!base.ok) return { ok: false, motivos: base.motivos };
  if (typeof payload !== "object" || payload === null) return { ok: false, motivos: ["Mensaje: el payload debe ser un objeto"] };
  const p = payload as Record<string, unknown>;
  if (!esEstiloMensaje(p.estilo)) return { ok: false, motivos: ["Mensaje: estructura de estilo inválida"] };
  const estilo = limpiarEstilo(p.estilo as EstiloMensaje);
  let layout: LayoutDoc | undefined;
  if ("layout" in p && p.layout !== null) {
    if (!esLayoutDoc(p.layout)) return { ok: false, motivos: ["Mensaje: estructura de layout inválida"] };
    layout = limpiarLayout(p.layout as LayoutDoc);
  }
  return { ok: true, payload: { estilo, layout } };
}