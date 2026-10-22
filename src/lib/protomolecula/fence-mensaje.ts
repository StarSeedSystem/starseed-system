/**
 * Protomolécula · BLOQUE `protomolecula` DE UN MENSAJE DE AGENTE (PM1010F2J).
 * Dato declarativo: el agente nunca ejecuta. Se valida y se convierte en una `Molecula`
 * del núcleo; sus valores se aplican como operaciones con `origen: "agente"` y se acotan
 * al rango del parámetro. Módulo PURO: sin React, red, disco ni `node:*`.
 */
import { aplicarOperacion, normalizar } from "./parametros";
import { obtenerAtomo, type DefinicionAtomo } from "./registro-atomos";
import type { AtomoEnUso, Molecula, Operacion } from "./tipos";

export const MAX_BYTES_FENCE = 8 * 1024;
export const MAX_ATOMOS_FENCE = 12;

export interface DependenciasFence {
  /** Búsqueda de herramientas; inyectable en pruebas. Por defecto, el registro real. */
  obtenerAtomo?: (id: string) => DefinicionAtomo | undefined;
  /** Reloj de la molécula; inyectable para que la lectura sea determinista. */
  ahora?: () => number;
}

export type LecturaFence =
  | { ok: true; molecula: Molecula; avisos: string[] }
  | { ok: false; motivo: string };

const bytes = (s: string): number => new TextEncoder().encode(s).length;
const texto = (x: unknown): string => (typeof x === "string" ? x.trim() : "");
const objeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Id estable y sin azar: dos bloques iguales producen la misma molécula. */
function idDeMolecula(crudo: string): string {
  let h = 2166136261;
  for (let i = 0; i < crudo.length; i++) { h ^= crudo.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `agente-${(h >>> 0).toString(36)}`;
}

export function moleculaDeFence(textoCrudo: string, deps: DependenciasFence = {}): LecturaFence {
  if (bytes(textoCrudo) > MAX_BYTES_FENCE) {
    return { ok: false, motivo: `El bloque supera los ${MAX_BYTES_FENCE} bytes permitidos.` };
  }
  let bruto: unknown;
  try { bruto = JSON.parse(textoCrudo); } catch {
    const t = textoCrudo.trim();
    return { ok: false, motivo: t.startsWith("{") && !t.endsWith("}") ? "incompleto" : "JSON no válido" };
  }
  if (!objeto(bruto)) return { ok: false, motivo: "El bloque debe ser un objeto JSON." };
  if (!Array.isArray(bruto.atomos) || bruto.atomos.length === 0) {
    return { ok: false, motivo: "Falta la lista «atomos» del bloque." };
  }

  const ahora = deps.ahora ?? (() => 0);
  const buscar = deps.obtenerAtomo ?? obtenerAtomo;
  const avisos: string[] = [];
  let m: Molecula = {
    id: idDeMolecula(textoCrudo), titulo: texto(bruto.titulo) || "Protomolécula del agente",
    ambito: "personal", capas: [], atomos: [], valores: {}, version: 0,
    creadaEn: ahora(), actualizadaEn: ahora(),
  };
  const crudos = bruto.atomos.slice(0, MAX_ATOMOS_FENCE);
  if (bruto.atomos.length > MAX_ATOMOS_FENCE) {
    avisos.push(`Solo se añadieron ${MAX_ATOMOS_FENCE} átomos: el resto no cabe en un mensaje.`);
  }

  /** Índice de entrada → átomo aceptado, para que un valor sepa a quién apunta. */
  const aceptados = new Map<number, AtomoEnUso>();
  crudos.forEach((item, i) => {
    if (!objeto(item)) { avisos.push(`El átomo ${i + 1} no es un objeto válido.`); return; }
    const herramienta = texto(item.herramienta);
    if (!herramienta) { avisos.push(`El átomo ${i + 1} no dice qué herramienta usa.`); return; }
    const def = buscar(herramienta);
    if (!def) { avisos.push(`La herramienta «${herramienta}» no está registrada; no se añadió.`); return; }
    if (def.proximamente) { avisos.push(`«${def.nombre}»: próximamente: ${def.proximamente}`); return; }
    const atomo: AtomoEnUso = {
      id: `atomo-${i + 1}`, herramientaId: herramienta,
      titulo: texto(item.titulo) || def.nombre, estado: "activo",
    };
    aceptados.set(i, atomo);
    m = { ...m, atomos: [...m.atomos, atomo], actualizadaEn: ahora() };
  });

  const valores = Array.isArray(bruto.valores) ? bruto.valores : [];
  for (const brutoValor of valores) {
    if (!objeto(brutoValor)) { avisos.push("Un valor del bloque no tiene la forma esperada."); continue; }
    const ref = brutoValor.atomo;
    if (typeof ref !== "number" && typeof ref !== "string") {
      avisos.push("Un valor del bloque no dice a qué átomo apunta."); continue;
    }
    const clave = typeof ref === "number" ? "" : normalizar(ref);
    const atomo = typeof ref === "number" ? aceptados.get(ref) : m.atomos.find((a) =>
      normalizar(a.id) === clave || normalizar(a.titulo ?? "") === clave || normalizar(a.herramientaId) === clave);
    if (!atomo) { avisos.push(`Un valor apunta a un átomo que no existe: «${String(ref)}».`); continue; }
    const buscado = texto(brutoValor.parametro);
    const def = buscar(atomo.herramientaId);
    const p = def?.parametros.find((x) => x.id === buscado || normalizar(x.nombre) === normalizar(buscado));
    if (!p) { avisos.push(`«${atomo.titulo ?? atomo.herramientaId}» no tiene el parámetro «${buscado}».`); continue; }
    const valor = brutoValor.valor;
    if (typeof valor !== "number" && typeof valor !== "string" && typeof valor !== "boolean") {
      avisos.push(`El valor de «${p.nombre}» no es un número, un texto ni un booleano.`); continue;
    }
    const op: Operacion = {
      id: `${atomo.id}-${p.id}-${m.version + 1}`, objetivo: { atomoId: atomo.id, parametroId: p.id },
      accion: { tipo: "exacta", valor }, autor: { tipo: "agente", id: "agente" }, origen: "agente",
      t: ahora(), texto: `valor del agente para ${p.nombre}`,
    };
    const r = aplicarOperacion(m.valores, p, op);
    if (!r.ok) { avisos.push(`No se aplicó «${p.nombre}»: ${r.motivo}.`); continue; }
    if (r.cambio.acotado) avisos.push(`«${p.nombre}» se salía del rango: se dejó en el límite.`);
    m = { ...m, valores: r.estado, version: m.version + 1, actualizadaEn: ahora() };
  }
  return { ok: true, molecula: m, avisos };
}
