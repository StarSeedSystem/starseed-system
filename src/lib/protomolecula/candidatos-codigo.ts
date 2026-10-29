/**
 * Protomolécula · CANDIDATOS DE CÓDIGO (contrato §8.2). Módulo PURO: sin React, red ni `node:*`.
 * La Protomolécula PROPONE; una persona, con la mano, acepta. Nada se ejecuta aquí: solo se
 * guarda texto, se señalan riesgos y, al aceptar, se reemplaza el contenido de UNA capa de
 * código de la molécula. Nunca un archivo del disco ni el núcleo (`nucleo/*`, invariantes).
 */
import { decidir } from "./permisos";
import type { Ambito, Autor, Capa, Molecula, Origen, Rol } from "./tipos";

export type EstadoCandidato = "propuesto" | "aceptado" | "rechazado";
export interface Candidato {
  id: string; capaId: string; lenguajeOrigen: string; lenguajeDestino?: string;
  propuesto: string; original: string; autor: Autor; estado: EstadoCandidato; avisos: string[];
}
export interface PropuestaCodigo {
  molecula: Pick<Molecula, "id" | "capas">; capaId: string; propuesto: string; original?: string;
  lenguajeOrigen: string; lenguajeDestino?: string; autor: Autor; id?: string;
}
export type ResultadoPropuesta = { ok: true; candidato: Candidato } | { ok: false; motivo: string };
export interface ContextoAceptar {
  molecula: Molecula;
  /** Contenido de las capas por id: el núcleo no lo guarda dentro de `Capa`; se inyecta. */
  contenidos: Record<string, string>;
  rol: Rol | null; origen: Origen; ambito: Ambito; ahora?: number;
}
export type ResultadoAceptar =
  | { ok: true; candidato: Candidato; molecula: Molecula; contenidos: Record<string, string> }
  | { ok: false; motivo: string };
export type TipoLineaDiff = "igual" | "cambio" | "añadida" | "borrada";
export interface LineaDiff {
  tipo: TipoLineaDiff; original?: string; propuesto?: string; numeroOriginal?: number; numeroPropuesto?: number;
}

/* Sin bandera `g`: un RegExp global guarda `lastIndex` y daría falsos negativos entre llamadas. */
const SECRETOS = [
  { re: /\bsk-[A-Za-z0-9_-]{8,}/, etiqueta: "clave de API estilo «sk-»" },
  { re: /\bgsk_[A-Za-z0-9_-]{8,}/, etiqueta: "clave de API estilo «gsk_»" },
  { re: /\bBearer\s+[A-Za-z0-9._~+/-]{8,}/i, etiqueta: "cabecera de autorización «Bearer»" },
  { re: /\/Users\/[^/"\s]+|\/home\/[^/"\s]+|\/root\/[^/"\s]+/, etiqueta: "ruta absoluta del disco" },
];
const PELIGROS = [
  { re: /\beval\s*\(/, etiqueta: "usa eval(, que ejecuta código" },
  { re: /\bnew\s+Function\s*\(/, etiqueta: "usa new Function(, que ejecuta código" },
  { re: /\bimport\s*\(/, etiqueta: "usa import( dinámico, que carga código ajeno" },
  { re: /\bnode:[a-z/]+/i, etiqueta: "importa un módulo node:*, que no vive en el navegador" },
];
const enmascarar = (s: string): string => (s.length <= 6 ? s : `${s.slice(0, 4)}…`);
const analizar = (codigo: string): { avisos: string[]; secretos: string[] } => {
  const avisos: string[] = [], secretos: string[] = [];
  for (const { re, etiqueta } of SECRETOS) {
    const m = re.exec(codigo);
    if (!m) continue;
    const aviso = `${etiqueta}: «${enmascarar(m[0])}»`;
    avisos.push(aviso); secretos.push(aviso);
  }
  for (const { re, etiqueta } of PELIGROS) if (re.test(codigo)) avisos.push(etiqueta);
  return { avisos, secretos };
};
const esNucleo = (id: string): boolean => /(^|\/)nucleo(\/|$)/i.test(id) || /invariantes/i.test(id);
const capaDe = (capas: readonly Capa[], id: string): Capa | undefined => capas.find((c) => c.id === id);

/** Revisa un candidato y devuelve una COPIA con sus avisos: no lo modifica ni lo acepta. */
export const revisar = (c: Candidato): Candidato => ({ ...c, avisos: analizar(c.propuesto).avisos });

/** Guarda un candidato SIN ejecutar nada ni tocar la capa: solo valida que la capa sea editable. */
export function proponer(p: PropuestaCodigo): ResultadoPropuesta {
  if (!p.propuesto.trim()) return { ok: false, motivo: "La propuesta está vacía: no hay código que revisar." };
  if (esNucleo(p.capaId)) return { ok: false, motivo: "El núcleo del OS no se edita con candidatos: solo las capas de la molécula." };
  const capa = capaDe(p.molecula.capas, p.capaId);
  if (!capa) return { ok: false, motivo: `No hay ninguna capa «${p.capaId}» en esta molécula.` };
  if (capa.tipo !== "codigo") return { ok: false, motivo: `La capa «${capa.titulo}» es de tipo «${capa.tipo}», no de código.` };
  if (capa.bloqueada) return { ok: false, motivo: `La capa «${capa.titulo}» está bloqueada: no admite propuestas.` };
  const candidato: Candidato = {
    id: p.id ?? `cand-${p.molecula.id}-${p.capaId}`, capaId: p.capaId, lenguajeOrigen: p.lenguajeOrigen,
    ...(p.lenguajeDestino ? { lenguajeDestino: p.lenguajeDestino } : {}),
    propuesto: p.propuesto, original: p.original ?? "", autor: p.autor, estado: "propuesto", avisos: [],
  };
  return { ok: true, candidato: revisar(candidato) };
}

/** Descarta un candidato sin tocar nada; el estado queda para la auditoría. */
export const rechazar = (c: Candidato): Candidato => ({ ...c, estado: "rechazado" });

/** Diff línea a línea, sin librerías: igual, cambio, añadida o borrada (con sus números). */
export function diff(original: string, propuesto: string): LineaDiff[] {
  const a = original === "" ? [] : original.split("\n"), b = propuesto === "" ? [] : propuesto.split("\n");
  const n = Math.max(a.length, b.length), salida: LineaDiff[] = [];
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i], num = i + 1;
    if (x !== undefined && y !== undefined) salida.push(x === y
      ? { tipo: "igual", original: x, propuesto: y, numeroOriginal: num, numeroPropuesto: num }
      : { tipo: "cambio", original: x, propuesto: y, numeroOriginal: num, numeroPropuesto: num });
    else if (x !== undefined) salida.push({ tipo: "borrada", original: x, numeroOriginal: num });
    else salida.push({ tipo: "añadida", propuesto: y, numeroPropuesto: num });
  }
  return salida;
}

/**
 * Acepta SOLO con la mano (`decidir` con `aplicar-codigo`). Reemplaza el contenido de una capa
 * `codigo` que pertenece a la molécula y devuelve copias nuevas: ni archivos ni núcleo.
 */
export function aceptar(c: Candidato, ctx: ContextoAceptar): ResultadoAceptar {
  if (c.estado !== "propuesto") return { ok: false, motivo: `El candidato ya está «${c.estado}»: no se acepta dos veces.` };
  const d = decidir({ rol: ctx.rol, origen: ctx.origen, ambito: ctx.ambito, accion: "aplicar-codigo" });
  if (ctx.origen !== "mano" || !d.permitido) {
    return { ok: false, motivo: ctx.origen === "mano" ? d.motivo : "Solo una persona, con la mano, acepta código tras leerlo." };
  }
  const { secretos } = analizar(c.propuesto);
  if (secretos.length > 0) return { ok: false, motivo: `No se acepta: la propuesta lleva secretos (${secretos.join("; ")}).` };
  if (esNucleo(c.capaId)) return { ok: false, motivo: "El núcleo del OS no se edita con candidatos: solo las capas de la molécula." };
  const capa = capaDe(ctx.molecula.capas, c.capaId);
  if (!capa) return { ok: false, motivo: `La capa «${c.capaId}» ya no está en la molécula.` };
  if (capa.tipo !== "codigo") return { ok: false, motivo: `La capa «${capa.titulo}» es de tipo «${capa.tipo}», no de código.` };
  if (capa.bloqueada) return { ok: false, motivo: `La capa «${capa.titulo}» está bloqueada: no se acepta código encima.` };
  const contenidos = { ...ctx.contenidos, [c.capaId]: c.propuesto };
  const molecula: Molecula = { ...ctx.molecula, version: ctx.molecula.version + 1, actualizadaEn: ctx.ahora ?? ctx.molecula.actualizadaEn };
  return { ok: true, candidato: { ...c, estado: "aceptado" }, molecula, contenidos };
}
