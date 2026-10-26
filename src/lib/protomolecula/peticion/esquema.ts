/**
 * Petición a la Protomolécula · ESQUEMA ESTRICTO del plan (Ola 1026P · P3).
 * Todo plan —el de las reglas locales, el que devuelve una IA o el que llega de la interfaz— pasa por aquí antes de
 * existir. Vocabulario CERRADO: un tipo desconocido, un campo de otro tipo, un texto desmedido o con marcas de código,
 * un objetivo que no está en la pantalla o un JSON que no parsea NUNCA se ejecuta: va a `fuera` con su motivo.
 * Solo se copian campos conocidos (nada del objeto bruto sobrevive). Módulo PURO: sin React, red ni `node:*`.
 */
import { TIPOS_CAMBIO_PROTO } from "./contrato";
import type { ContextoProto, EntidadProto, ModoEdicion, OperacionPedida, PlanPeticion, TipoCambioProto } from "./contrato";
import { sanearEntidad } from "./contexto";

export const MAX_JSON_BYTES = 16 * 1024;
export const MAX_PASOS = 6;
export const MAX_TEXTO = 500;
export const MAX_RESUMEN = 240;
export const MAX_FUERA = 8;
const FORMATOS = ["1:1", "4:5", "9:16", "16:9"] as const;
const DONDE = ["pizarra", "lienzo", "protomolecula", "xr"] as const;
export const TIPOS_OPERACION = [
  "crear-objeto-3d", "generar-imagen", "editar-entidad", "insertar-en", "abrir-en", "fondo", "dictar-molecula", "proponer-metagenesis",
] as const;

/** Marcas de código o de inyección que no tienen sitio en una descripción en lenguaje natural. */
const PELIGROSO = /<\s*\/?\s*(script|iframe|object|embed|svg|style|link|meta)\b|javascript\s*:|data\s*:\s*text\/html|\bon(error|load|click|mouseover)\s*=|\$\{|\{\{|`{3}|__proto__|constructor\s*\.\s*prototype|\beval\s*\(|\bfunction\s*\(/i;

/** ¿Lleva marcas de código o de inyección? (para textos largos que se guardan con sus saltos de línea, como un texto reescrito) */
export const hayMarcasDeCodigo = (t: string): boolean => PELIGROSO.test(t);

/** Un texto libre aceptable: cadena de 1 a `max` caracteres, sin control ni marcas de código. null si no. */
export function textoSeguro(v: unknown, max = MAX_TEXTO): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.length > max || PELIGROSO.test(t)) return null;
  return t;
}

/** Un tipo para mostrar en un motivo: solo letras minúsculas y guiones (el bruto puede ser cualquier cosa). */
const tipoMostrable = (v: unknown): string => (typeof v === "string" && /^[a-z][a-z-]{0,39}$/.test(v) ? v : "desconocido");

const esObjetoPlano = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const tiene = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Saca el primer objeto JSON de la respuesta de una IA (con o sin cercos ```json). Tope de tamaño ANTES de parsear.
 * undefined si no hay objeto, es demasiado grande o no parsea.
 */
export function extraerJson(texto: unknown): unknown {
  if (typeof texto !== "string" || !texto) return undefined;
  if (new TextEncoder().encode(texto).length > MAX_JSON_BYTES * 2) return undefined;
  const ini = texto.indexOf("{");
  if (ini < 0) return undefined;
  let prof = 0, enCadena = false, escape = false;
  for (let i = ini; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) { if (escape) escape = false; else if (c === "\\") escape = true; else if (c === "\"") enCadena = false; continue; }
    if (c === "\"") enCadena = true;
    else if (c === "{") prof++;
    else if (c === "}" && --prof === 0) {
      const trozo = texto.slice(ini, i + 1);
      if (new TextEncoder().encode(trozo).length > MAX_JSON_BYTES) return undefined;
      try { return JSON.parse(trozo); } catch { return undefined; }
    }
  }
  return undefined;
}

/** ¿Es esta entidad algo que la persona tiene delante (la entidad, la selección o lo que gobierna)? */
export function entidadEnPantalla(e: EntidadProto, ctx: ContextoProto): boolean {
  const mismo = (o?: { tipo: string; id: string }): boolean => !!o && o.tipo === e.tipo && o.id === e.id;
  return mismo(ctx.entidad) || mismo(ctx.seleccion) || mismo(ctx.gobernadaPor);
}

export interface OpcionesValidacion {
  /** Lo que eligió la persona (si lo hizo): «rama» manda siempre. */
  modo?: ModoEdicion;
  /** ¿El texto de la persona pide expresamente editar sobre el original? */
  pideDirecto?: boolean;
  /** Revalidar un plan YA planificado: cada paso conserva su modo (nunca sube de rama a directo ni al revés). */
  conservarModo?: boolean;
}

/** Edición directa solo si la persona la pidió; si no, o si cualquiera de los dos dice rama, es rama (cita, no copia). */
export function modoEfectivo(opts: OpcionesValidacion | undefined, delPaso?: ModoEdicion): ModoEdicion {
  if (opts?.conservarModo) return delPaso === "directo" ? "directo" : "rama";
  if (opts?.modo === "rama") return "rama";
  if (opts?.modo === "directo" || opts?.pideDirecto) return delPaso === "rama" ? "rama" : "directo";
  return "rama";
}

type Valida = { ok: true; paso: OperacionPedida } | { ok: false; motivo: string };
const no = (motivo: string): Valida => ({ ok: false, motivo });

function objetivoDe(v: unknown, ctx: ContextoProto, que: string): EntidadProto | string {
  const e = sanearEntidad(v);
  if (!e) return `${que} no es una entidad válida`;
  if (!entidadEnPantalla(e, ctx)) return `${que} no está en tu pantalla (solo se actúa sobre lo que tienes delante)`;
  return e;
}

/** Valida UN paso bruto. Nunca lanza. */
export function validarPaso(bruto: unknown, ctx: ContextoProto, opts?: OpcionesValidacion): Valida {
  if (!esObjetoPlano(bruto)) return no("no es un objeto");
  const t = bruto.tipo;
  if (typeof t !== "string" || !(TIPOS_OPERACION as readonly string[]).includes(t)) return no(`el tipo «${tipoMostrable(t)}» no está en el vocabulario`);
  const txt = (k: string, max = MAX_TEXTO): string | null => (tiene(bruto, k) ? textoSeguro(bruto[k], max) : null);
  switch (t) {
    case "crear-objeto-3d": {
      const descripcion = txt("descripcion");
      if (!descripcion) return no("falta una descripción válida");
      if (tiene(bruto, "animado") && typeof bruto.animado !== "boolean") return no("«animado» debe ser verdadero o falso");
      return { ok: true, paso: { tipo: t, descripcion, animado: bruto.animado === true } };
    }
    case "generar-imagen": {
      const descripcion = txt("descripcion");
      if (!descripcion) return no("falta una descripción válida");
      if (tiene(bruto, "formato") && bruto.formato !== undefined) {
        if (typeof bruto.formato !== "string" || !(FORMATOS as readonly string[]).includes(bruto.formato)) return no("formato de imagen no admitido");
        return { ok: true, paso: { tipo: t, descripcion, formato: bruto.formato as (typeof FORMATOS)[number] } };
      }
      return { ok: true, paso: { tipo: t, descripcion } };
    }
    case "editar-entidad": {
      const objetivo = objetivoDe(bruto.objetivo, ctx, "El objetivo");
      if (typeof objetivo === "string") return no(objetivo);
      const cambio = txt("cambio");
      if (!cambio) return no("falta el cambio pedido");
      if (tiene(bruto, "modo") && bruto.modo !== undefined && bruto.modo !== "directo" && bruto.modo !== "rama") return no("modo de edición no admitido");
      return { ok: true, paso: { tipo: t, objetivo, cambio, modo: modoEfectivo(opts, bruto.modo as ModoEdicion | undefined) } };
    }
    case "insertar-en": {
      const destino = objetivoDe(bruto.destino, ctx, "El destino");
      if (typeof destino === "string") return no(destino);
      const que = txt("que");
      if (!que) return no("falta qué insertar");
      return { ok: true, paso: { tipo: t, destino, que } };
    }
    case "abrir-en": {
      if (typeof bruto.donde !== "string" || !(DONDE as readonly string[]).includes(bruto.donde)) return no("destino de apertura no admitido");
      const donde = bruto.donde as (typeof DONDE)[number];
      if (tiene(bruto, "que") && bruto.que !== undefined) {
        const que = txt("que");
        if (!que) return no("«que» no es un texto válido");
        return { ok: true, paso: { tipo: t, donde, que } };
      }
      return { ok: true, paso: { tipo: t, donde } };
    }
    case "fondo": {
      const descripcion = txt("descripcion");
      return descripcion ? { ok: true, paso: { tipo: t, descripcion } } : no("falta una descripción válida");
    }
    case "dictar-molecula": {
      const orden = txt("orden", 300);
      return orden ? { ok: true, paso: { tipo: t, orden } } : no("falta la orden");
    }
    default: {
      const que = txt("que");
      return que ? { ok: true, paso: { tipo: "proponer-metagenesis", que } } : no("falta qué proponer");
    }
  }
}

const POR_PALABRAS: Array<[TipoCambioProto, RegExp]> = [
  ["permisos", /\b(permiso|acceso|rol(es)?|visibilidad|qui[eé]n (puede|ve)|privad[oa]|p[uú]blic[oa])\b/],
  ["reglas", /\b(regla|norma|estatuto|gobern|votaci[oó]n|qu[oó]rum|constituci[oó]n)/],
  ["funciones", /\b(funci[oó]n|funciones|herramienta|widget|m[oó]dulo|activar|desactivar|bot[oó]n|pesta[nñ]a|integraci[oó]n)\b/],
  ["diseno", /\b(dise[nñ]o|color|fondo|tema|estilo|tipograf|aspecto|layout|disposici[oó]n|tama[nñ]o|apariencia)/],
];
const PRECEDENCIA: TipoCambioProto[] = ["permisos", "reglas", "funciones", "diseno", "contenido", "creacion"];

/** Qué tipo de cambio es: el más restrictivo de sus pasos (permisos › reglas › funciones › diseño › contenido › creación). */
export function deducirTipoCambio(pasos: readonly OperacionPedida[]): TipoCambioProto {
  const tipos = new Set<TipoCambioProto>();
  for (const p of pasos) {
    switch (p.tipo) {
      case "crear-objeto-3d": case "generar-imagen": tipos.add("creacion"); break;
      case "fondo": tipos.add("diseno"); break;
      case "proponer-metagenesis": tipos.add("funciones"); break;
      case "editar-entidad": {
        const norm = p.cambio.toLowerCase();
        tipos.add(POR_PALABRAS.find(([, re]) => re.test(norm))?.[0] ?? "contenido");
        break;
      }
      case "abrir-en": break;
      default: tipos.add("contenido");
    }
  }
  return PRECEDENCIA.find((t) => tipos.has(t)) ?? "contenido";
}

/** Una frase corta en español de lo que hace un paso (para el plan, los avisos y los resultados). */
export function describirOperacion(op: OperacionPedida): string {
  const corta = (s: string, n = 90): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  switch (op.tipo) {
    case "crear-objeto-3d": return `Crear un objeto 3D${op.animado ? " animado" : ""}: ${corta(op.descripcion)}`;
    case "generar-imagen": return `Generar una imagen${op.formato ? ` (${op.formato})` : ""}: ${corta(op.descripcion)}`;
    case "editar-entidad": return `Editar ${op.objetivo.nombre ? `«${op.objetivo.nombre}»` : `${op.objetivo.tipo} ${op.objetivo.id}`} ${op.modo === "rama" ? "en una rama" : "directamente"}: ${corta(op.cambio)}`;
    case "insertar-en": return `Insertar en ${op.destino.nombre ? `«${op.destino.nombre}»` : `${op.destino.tipo} ${op.destino.id}`}: ${corta(op.que)}`;
    case "abrir-en": return `Abrir${op.que ? ` «${corta(op.que, 60)}»` : ""} en ${op.donde === "xr" ? "XR" : op.donde === "protomolecula" ? "la Protomolécula" : `la ${op.donde === "pizarra" ? "pizarra" : "lienzo"}`}`;
    case "fondo": return `Cambiar el fondo: ${corta(op.descripcion)}`;
    case "dictar-molecula": return `Dictar a la molécula: ${corta(op.orden)}`;
    case "proponer-metagenesis": return `Proponer a MetaGenesis: ${corta(op.que)}`;
  }
}

export type ValidacionPlan =
  | { ok: true; plan: Omit<PlanPeticion, "motor"> }
  | { ok: false; motivo: string; fuera: string[] };

/**
 * Valida un plan bruto (JSON de una IA, plan de la interfaz…). Los pasos que no validan van a `fuera` y NO se
 * ejecutarán; si ninguno valida, `ok: false` con todo lo descartado. Nunca lanza.
 */
export function validarPlan(bruto: unknown, ctx: ContextoProto, opts?: OpcionesValidacion): ValidacionPlan {
  if (!esObjetoPlano(bruto)) return { ok: false, motivo: "La respuesta no es un plan (se esperaba un objeto).", fuera: [] };
  if (!Array.isArray(bruto.pasos)) return { ok: false, motivo: "El plan no trae la lista de pasos.", fuera: [] };
  const pasos: OperacionPedida[] = [];
  const fuera: string[] = [];
  bruto.pasos.slice(0, MAX_PASOS).forEach((b, i) => {
    const r = validarPaso(b, ctx, opts);
    if (r.ok) pasos.push(r.paso);
    else fuera.push(`Paso ${i + 1} descartado: ${r.motivo}.`);
  });
  if (bruto.pasos.length > MAX_PASOS) fuera.push(`${bruto.pasos.length - MAX_PASOS} pasos más no caben en una petición (máximo ${MAX_PASOS}).`);
  if (Array.isArray(bruto.fuera)) {
    for (const f of bruto.fuera.slice(0, MAX_FUERA)) { const t = textoSeguro(f); if (t) fuera.push(t); }
  }
  if (!pasos.length) return { ok: false, motivo: "Ningún paso del plan cabe en lo que Astraura puede hacer aquí.", fuera: fuera.slice(0, MAX_FUERA + MAX_PASOS) };
  const tipoPedido = typeof bruto.tipoCambio === "string" && (TIPOS_CAMBIO_PROTO as readonly string[]).includes(bruto.tipoCambio) ? (bruto.tipoCambio as TipoCambioProto) : null;
  // La IA puede quedarse corta, nunca bajar el rigor: se toma el más restrictivo entre lo que dice y lo que se deduce.
  const deducido = deducirTipoCambio(pasos);
  const tipoCambio = tipoPedido && PRECEDENCIA.indexOf(tipoPedido) < PRECEDENCIA.indexOf(deducido) ? tipoPedido : deducido;
  const resumen = textoSeguro(bruto.resumen, MAX_RESUMEN) ?? pasos.map(describirOperacion).join(" · ").slice(0, MAX_RESUMEN);
  return { ok: true, plan: { resumen, tipoCambio, pasos, fuera: fuera.slice(0, MAX_FUERA + MAX_PASOS) } };
}
