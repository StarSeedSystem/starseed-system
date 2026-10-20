/**
 * Protomolécula · REGISTRO DE ÁTOMOS. Definiciones, saneo de lo que declara un tercero
 * y candidatos de parámetros para dictado y vínculos. Módulo PURO.
 *
 * Contrato: architecture/protomolecula.md §11.1
 */
import type { ComponentType } from "react";
import type {
  Parametro,
  CandidatoParametro,
  Molecula,
  AtomoEnUso,
  Unidad,
  ValorParametro,
} from "./tipos";

export type { Parametro, CandidatoParametro };

export type Integracion =
  | "libreria-js"
  | "wasm-en-worker"
  | "iframe-aislado"
  | "app-nativa-puente"
  | "servicio-local"
  | "servidor-remoto"
  | "solo-enlace";

export type GradoControl = "total" | "ventana" | "ninguno";

export type CategoriaAtomo =
  | "imagen"
  | "audio"
  | "video"
  | "3d"
  | "arquitectura"
  | "fisicas"
  | "juegos"
  | "vr-ar"
  | "codigo"
  | "ia";

export type VistaAtomo =
  | { tipo: "documento"; documento: () => string }
  | { tipo: "componente"; id: string }
  | { tipo: "externa"; url: string };

export interface VistaProps {
  atomoId: string;
  valores: Record<string, unknown>;
  alCambiar?: (op: { objetivo: { atomoId: string; parametroId: string }; accion: unknown; autor: { tipo: string; id: string; nombre?: string }; origen: string; t: number; fuente?: string; texto?: string }) => void;
}

export interface DefinicionAtomo {
  herramientaId: string;
  nombre: string;
  categoria: CategoriaAtomo;
  integracion: Integracion;
  control: GradoControl;
  parametros: Parametro[];
  entradas: string[];
  salidas: string[];
  vista?: VistaAtomo;
  proximamente?: string;
  ficha?: { web?: string; repo?: string; licencia?: string };
}

const REGISTRO = new Map<string, DefinicionAtomo>();

const ID_HERRAMIENTA_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** Topes del registro; el puente (`puente-herramientas.ts`) los reutiliza para acotar lo que declara un `hola`. */
export const MAX_NOMBRE = 80;
export const MAX_PARAMETROS = 64;
export const MAX_OPCIONES = 32;
export const MAX_TEXTO_OPCION = 40;
export const MAX_TEXTO_GENERAL = 80;

function validarIdHerramienta(id: string): string | null {
  if (!ID_HERRAMIENTA_RE.test(id)) {
    return "El id de herramienta debe empezar por letra minúscula o dígito y contener solo minúsculas, dígitos, punto, guión o guión bajo (máx. 64 caracteres).";
  }
  return null;
}

function validarNombre(nombre: string): string | null {
  if (nombre.length > MAX_NOMBRE) {
    return `El nombre no puede superar ${MAX_NOMBRE} caracteres.`;
  }
  return null;
}

function validarParametros(params: Parametro[]): string | null {
  if (params.length > MAX_PARAMETROS) {
    return `Máximo ${MAX_PARAMETROS} parámetros por herramienta.`;
  }
  const ids = new Set<string>();
  for (const p of params) {
    if (ids.has(p.id)) return `Parámetro duplicado: ${p.id}`;
    ids.add(p.id);
    if (!["numero", "entero", "booleano", "opcion", "disparo"].includes(p.tipo)) {
      return `Tipo de parámetro inválido: ${p.tipo}`;
    }
    if (p.min !== undefined && p.max !== undefined && p.min >= p.max) {
      return `Parámetro ${p.id}: min debe ser menor que max.`;
    }
    if (p.opciones) {
      if (p.opciones.length > MAX_OPCIONES) {
        return `Parámetro ${p.id}: máximo ${MAX_OPCIONES} opciones.`;
      }
      for (const o of p.opciones) {
        if (o.length > MAX_TEXTO_OPCION) {
          return `Parámetro ${p.id}: opción «${o}» supera ${MAX_TEXTO_OPCION} caracteres.`;
        }
      }
    }
    const textos = [p.nombre, p.id, ...(p.sinonimos ?? [])];
    for (const t of textos) {
      if (t.length > MAX_TEXTO_GENERAL) {
        return `Parámetro ${p.id}: texto «${t}» supera ${MAX_TEXTO_GENERAL} caracteres.`;
      }
    }
  }
  return null;
}

function validarControl(def: DefinicionAtomo): string | null {
  if (def.control === "total" && def.parametros.length === 0) {
    return 'Control "total" exige al menos 1 parámetro.';
  }
  return null;
}

export function registrarAtomo(def: DefinicionAtomo): { ok: true } | { ok: false; motivo: string } {
  const errId = validarIdHerramienta(def.herramientaId);
  if (errId) return { ok: false, motivo: errId };
  if (REGISTRO.has(def.herramientaId)) {
    return { ok: false, motivo: `Herramienta ya registrada: ${def.herramientaId}` };
  }
  const errNombre = validarNombre(def.nombre);
  if (errNombre) return { ok: false, motivo: errNombre };
  const errParams = validarParametros(def.parametros);
  if (errParams) return { ok: false, motivo: errParams };
  const errControl = validarControl(def);
  if (errControl) return { ok: false, motivo: errControl };
  if (def.proximamente) {
    return { ok: false, motivo: def.proximamente };
  }
  REGISTRO.set(def.herramientaId, def);
  return { ok: true };
}

export function obtenerAtomo(id: string): DefinicionAtomo | undefined {
  return REGISTRO.get(id);
}

export function listarAtomos(): DefinicionAtomo[] {
  return Array.from(REGISTRO.values());
}

export function limpiarRegistro(): void {
  REGISTRO.clear();
}

export function puedeAnadirse(def: DefinicionAtomo): { ok: true } | { ok: false; motivo: string } {
  if (def.proximamente) return { ok: false, motivo: def.proximamente };
  return registrarAtomo(def);
}

/** Quita < y > y acota a `MAX_TEXTO_GENERAL`; también lo usa el puente para lo que declara un tercero. */
export function sanearTexto(t: string): string {
  return t.replace(/[<>]/g, "").slice(0, MAX_TEXTO_GENERAL);
}

function sanearParametro(p: unknown): Parametro | null {
  if (!p || typeof p !== "object") return null;
  const obj = p as Record<string, unknown>;
  const id = typeof obj.id === "string" ? sanearTexto(obj.id) : "";
  const nombre = typeof obj.nombre === "string" ? sanearTexto(obj.nombre) : "";
  const tipo = typeof obj.tipo === "string" ? obj.tipo : "";
  if (!id || !nombre || !["numero", "entero", "booleano", "opcion", "disparo"].includes(tipo)) {
    return null;
  }
  const min = typeof obj.min === "number" && Number.isFinite(obj.min) ? obj.min : undefined;
  const max = typeof obj.max === "number" && Number.isFinite(obj.max) ? obj.max : undefined;
  if (min !== undefined && max !== undefined && min >= max) return null;
  const paso = typeof obj.paso === "number" && Number.isFinite(obj.paso) && obj.paso > 0 ? obj.paso : undefined;
  const unidad = typeof obj.unidad === "string" ? sanearTexto(obj.unidad) as Unidad | undefined : undefined;
  const opciones = Array.isArray(obj.opciones)
    ? obj.opciones.filter((o): o is string => typeof o === "string").map(sanearTexto).slice(0, MAX_OPCIONES)
    : undefined;
  const defecto = obj.defecto !== undefined ? obj.defecto as ValorParametro : undefined;
  const sinonimos = Array.isArray(obj.sinonimos)
    ? obj.sinonimos.filter((s): s is string => typeof s === "string").map(sanearTexto)
    : undefined;
  return { id, nombre, tipo: tipo as Parametro["tipo"], min, max, paso, unidad, opciones, defecto, sinonimos };
}

export function sanearDefinicion(bruto: unknown): DefinicionAtomo | null {
  if (!bruto || typeof bruto !== "object") return null;
  const obj = bruto as Record<string, unknown>;
  const herramientaId = typeof obj.herramientaId === "string" ? sanearTexto(obj.herramientaId) : "";
  const nombre = typeof obj.nombre === "string" ? sanearTexto(obj.nombre) : "";
  const categoria = typeof obj.categoria === "string" ? obj.categoria : "";
  const integracion = typeof obj.integracion === "string" ? obj.integracion : "";
  const control = typeof obj.control === "string" ? obj.control : "";
  const parametrosBrutos = Array.isArray(obj.parametros) ? obj.parametros : [];
  const entradas = Array.isArray(obj.entradas)
    ? obj.entradas.filter((e): e is string => typeof e === "string").map(sanearTexto)
    : [];
  const salidas = Array.isArray(obj.salidas)
    ? obj.salidas.filter((s): s is string => typeof s === "string").map(sanearTexto)
    : [];
  const ficha = obj.ficha && typeof obj.ficha === "object"
    ? {
        web: typeof (obj.ficha as Record<string, unknown>).web === "string" ? sanearTexto((obj.ficha as Record<string, unknown>).web as string) : undefined,
        repo: typeof (obj.ficha as Record<string, unknown>).repo === "string" ? sanearTexto((obj.ficha as Record<string, unknown>).repo as string) : undefined,
        licencia: typeof (obj.ficha as Record<string, unknown>).licencia === "string" ? sanearTexto((obj.ficha as Record<string, unknown>).licencia as string) : undefined,
      }
    : undefined;
  const validIntegracion: Integracion[] = ["libreria-js", "wasm-en-worker", "iframe-aislado", "app-nativa-puente", "servicio-local", "servidor-remoto", "solo-enlace"];
  const validControl: GradoControl[] = ["total", "ventana", "ninguno"];
  const validCategoria: CategoriaAtomo[] = ["imagen", "audio", "video", "3d", "arquitectura", "fisicas", "juegos", "vr-ar", "codigo", "ia"];
  if (!herramientaId || !nombre || !validCategoria.includes(categoria as CategoriaAtomo) || !validIntegracion.includes(integracion as Integracion) || !validControl.includes(control as GradoControl)) {
    return null;
  }
  const parametros = parametrosBrutos.map(sanearParametro).filter((p): p is Parametro => p !== null).slice(0, MAX_PARAMETROS);
  const def: DefinicionAtomo = {
    herramientaId,
    nombre,
    categoria: categoria as CategoriaAtomo,
    integracion: "iframe-aislado",
    control: control as GradoControl,
    parametros,
    entradas,
    salidas,
    ficha,
  };
  const err = validarParametros(def.parametros) ?? validarControl(def);
  if (err) return null;
  return def;
}

export function candidatosDe(m: Molecula): CandidatoParametro[] {
  const out: CandidatoParametro[] = [];
  for (const atomo of m.atomos) {
    if (atomo.estado !== "activo") continue;
    const def = REGISTRO.get(atomo.herramientaId);
    if (!def) continue;
    for (const p of def.parametros) {
      out.push({
        ref: { atomoId: atomo.id, parametroId: p.id },
        parametro: p,
        atomo: atomo.titulo ?? def.nombre,
      });
    }
  }
  return out;
}