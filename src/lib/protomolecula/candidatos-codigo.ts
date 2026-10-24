/**
 * Protomolécula · CANDIDATOS DE CÓDIGO (PM1010F7A, contrato §8.2): la IA PROPONE, una persona
 * revisa y acepta CON LA MANO. Módulo PURO: sin React, sin red, sin procesos ni `node:*`.
 * Nada de esto ejecuta código (editable sí, ejecutable no): `aceptar` solo reemplaza el
 * contenido de una capa `codigo` DE LA MOLÉCULA, jamás un archivo del repo ni el núcleo del OS.
 */
import { decidir } from "./permisos";
import type { Autor, Capa, Molecula, Origen, Rol } from "./tipos";

export type EstadoCandidato = "propuesto" | "aceptado" | "rechazado";
/** Un cambio de código/conversión PROPUESTO: se guarda, se lee y nada más (nunca se ejecuta). */
export interface Candidato {
  id: string; capaId: string; lenguajeOrigen: string; lenguajeDestino?: string;
  propuesto: string; original: string; autor: Autor; estado: EstadoCandidato;
  /** Solo la FORMA del problema: jamás el valor de un secreto. Un secreto BLOQUEA aceptar. */
  avisos: string[];
}
export interface NuevaPropuesta {
  capaId: string; original: string; propuesto: string; lenguajeOrigen: string; lenguajeDestino?: string; autor: Autor;
}
export interface ContextoAceptacion {
  molecula: Molecula; rol: Rol;
  /** De dónde llega la orden de aceptar: `decidir` solo lo permite con la mano (§8.2). */
  origen?: Origen;
  /** La persona confirmó en el panel: `decidir` pide esa confirmación. */
  confirmado?: boolean;
  /** Puente inyectado que pone el contenido en la capa de código de la molécula. */
  aplicar?: (molecula: Molecula, capaId: string, contenido: string) => Molecula;
}
export type LineaDiff =
  | { tipo: "igual"; texto: string } | { tipo: "cambio"; de: string; a: string }
  | { tipo: "anadido"; texto: string } | { tipo: "borrado"; texto: string };
export type ResultadoAceptar =
  | { ok: true; molecula: Molecula; capa: Capa; candidato: Candidato } | { ok: false; motivo: string };

/* ── Revisión ── Los patrones se montan EN TIEMPO DE EJECUCIÓN: ninguna clave de ejemplo queda
 * escrita en el repo (GitHub bloquea empujes con esa forma) y los avisos citan la FORMA del
 * secreto, jamás su valor (el aviso tampoco ecoa el texto marcado). */
const conForma = (cabeza: string, largo: number): RegExp => new RegExp(cabeza + "[A-Za-z0-9_-]{" + largo + ",}");
const SECRETOS = [
  { forma: "sk-…", patron: conForma("sk-", 16) }, { forma: "gsk_…", patron: conForma("gsk_", 16) },
  { forma: "Bearer …", patron: /\bBearer [A-Za-z0-9._-]{12,}/ },
];
export const AVISO_SECRETO = "secreto con forma real: bloquea la aceptación hasta quitarlo";
/** Avisos de la revisión: secretos (bloquean), ejecución, rutas del disco y el núcleo del OS. */
const SOSPECHOSOS = [
  { aviso: "parece ejecutar código (eval / new Function / import dinámico): en el OS solo corre aislado", patron: /\beval\s*\(|\bnew\s+Function\b|\bimport\s*\(/ },
  { aviso: "alude a un módulo de Node (`node:…`): nada de `node:*` en el navegador y aquí no se ejecuta nada", patron: /\bnode:[a-z]+/ },
  { aviso: "toca una ruta del disco: los secretos van por NOMBRE de variable y ninguna ruta del disco va al código de la molécula", patron: /[A-Za-z]:\\|\/(Users|home|tmp|var|etc)\// },
  { aviso: "menciona el núcleo del OS (nucleo/…, invariantes): lo protege MetaGenesis y aquí no se toca", patron: /\b(nucleo\/[A-Za-z0-9._-]+|invariantes)/ },
];

let secuencia = 0;
export function proponer(nueva: NuevaPropuesta, { nuevoId }: { nuevoId?: () => string } = {}): Candidato {
  const id = nuevoId ? nuevoId() : `cand-${Date.now().toString(36)}-${++secuencia}`;
  return revisar({ ...nueva, id, estado: "propuesto", avisos: [] });
}
/** Marca los avisos del candidato (no cambia su estado ni su texto): aceptar es cosa de una persona con la mano. */
export function revisar(c: Candidato): Candidato {
  return { ...c, avisos: [...avisosDe(c.original), ...avisosDe(c.propuesto)] };
}
/** Los avisos nunca ecoan el texto marcado; los que nacen de un secreto BLOQUEAN la aceptación. */
export function avisosDe(texto: string): string[] {
  if (!texto) return [];
  const fuera: string[] = SECRETOS.map((s) => s.patron.test(texto) ? AVISO_SECRETO : "").filter(Boolean);
  return [...fuera, ...SOSPECHOSOS.map((s) => s.patron.test(texto) ? s.aviso : "").filter(Boolean)];
}
export function haySecretos(avisos: string[]): boolean {
  return avisos.some((a) => a === AVISO_SECRETO);
}

/** DIFF línea a línea, sin librerías: cambios, adiciones y borrados mirando qué línea sigue igual. */
export function diff(original: string, propuesto: string): LineaDiff[] {
  const a = original.split("\n"), b = propuesto.split("\n");
  const fuera: LineaDiff[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i >= a.length) { fuera.push({ tipo: "anadido", texto: b[j] }); j++; continue; }
    if (j >= b.length) { fuera.push({ tipo: "borrado", texto: a[i] }); i++; continue; }
    if (a[i] === b[j]) { fuera.push({ tipo: "igual", texto: a[i] }); i++; j++; continue; }
    const cambio = i + 1 < a.length && j + 1 < b.length && a[i + 1] === b[j + 1];
    const borra = i + 1 < a.length && a[i + 1] === b[j];
    const anade = j + 1 < b.length && a[i] === b[j + 1];
    if (cambio) { fuera.push({ tipo: "cambio", de: a[i], a: b[j] }); i++; j++; }
    else if (borra && !anade) { fuera.push({ tipo: "borrado", texto: a[i] }); i++; }
    else if (anade) { fuera.push({ tipo: "anadido", texto: b[j] }); j++; }
    else if (borra) { fuera.push({ tipo: "borrado", texto: a[i] }); i++; }
    else { fuera.push({ tipo: "cambio", de: a[i], a: b[j] }); i++; j++; }
  }
  return fuera;
}

/** Marca el candidato como RECHAZADO por la persona (con el motivo en avisos, sin ejecutar nada). */
export function rechazar(c: Candidato, motivo = "rechazado por la persona"): Candidato {
  return { ...c, estado: "rechazado", avisos: [...c.avisos, motivo] };
}

/** ACEPTAR: SOLO una persona con la mano (decidir con origen «mano», confirmada). Actúa únicamente
 * sobre la capa `codigo` de LA MOLÉCULA: nunca un archivo del repo, el núcleo ni otra capa. */
export function aceptar(c: Candidato, ctx: ContextoAceptacion): ResultadoAceptar {
  const revisado = revisar(c);
  if (haySecretos([...c.avisos, ...revisado.avisos])) return { ok: false, motivo: `No acepto un candidato con secretos (${AVISO_SECRETO}).` };
  const d = decidir({ rol: ctx.rol, origen: ctx.origen ?? "mano", ambito: ctx.molecula.ambito, accion: "aplicar-codigo" });
  if (!d.permitido) return { ok: false, motivo: `No se acepta: ${d.motivo}` };
  if (d.confirmar && ctx.confirmado !== true) return { ok: false, motivo: "Pendiente de que la persona confirme en el panel." };
  const capa = ctx.molecula.capas.find((x) => x.id === c.capaId);
  if (!capa) return { ok: false, motivo: `No hay capa «${c.capaId}» en esta molécula.` };
  if (capa.tipo !== "codigo") return { ok: false, motivo: `La capa «${capa.id}» es «${capa.tipo}»: el candidato solo va a una capa de código.` };
  if (capa.bloqueada) return { ok: false, motivo: `La capa «${capa.id}» está bloqueada: se desbloquea con la mano antes de aceptar.` };
  if (capa.referencia) return { ok: false, motivo: "La capa cita una Entidad de la Biblioteca: editarla crea una rama y todavía no está (próximamente)." };
  if (c.estado !== "propuesto") return { ok: false, motivo: `El candidato ya está «${c.estado}».` };
  const molécula = ctx.aplicar ? ctx.aplicar(ctx.molecula, capa.id, c.propuesto) : ctx.molecula;
  return { ok: true, molecula: molécula, capa, candidato: { ...revisado, estado: "aceptado" } };
}
