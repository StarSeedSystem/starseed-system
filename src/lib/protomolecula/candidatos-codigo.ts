/**
 * Protomolécula · CANDIDATOS DE CÓDIGO (§8.2 contrato). Puro: sin React, sin red, sin `node:*`.
 * Editable sí, ejecutable no: los candidatos nunca corren en el núcleo del OS.
 */
import type { Autor } from "./tipos";

export type EstadoCandidato = "propuesto" | "aceptado" | "rechazado";

export interface Candidato {
  id: string;
  capaId: string;
  lenguajeOrigen: string;
  lenguajeDestino?: string;
  propuesto: string;
  original: string;
  autor: Autor;
  estado: EstadoCandidato;
  avisos: string[];
}

/** Crea un candidato sin tocar ninguna capa ni ejecutar nada. */
export function proponer(
  id: string,
  capaId: string,
  lenguajeOrigen: string,
  original: string,
  propuesto: string,
  autor: Autor,
  lenguajeDestino?: string
): Candidato {
  return {
    id,
    capaId,
    lenguajeOrigen,
    lenguajeDestino,
    original,
    propuesto,
    autor,
    estado: "propuesto",
    avisos: [],
  };
}

const SECRETOS = ["sk-", "gsk_", "bearer "];
const FORMAS_SECRETAS = (texto: string): boolean => {
  const t = texto.toLowerCase();
  return SECRETOS.some((s) => t.includes(s.toLowerCase()));
};

const RUTA_DISCO = /(?:\/[\w\.\-]+)+|(?:[a-z]:\\[^\s]*)/i;

function tieneRutaDisco(texto: string): boolean {
  return RUTA_DISCO.test(texto) && (texto.includes("/Users/") || texto.includes("/home/") || texto.includes("\\") || texto.includes(".env") || texto.includes("/etc/"));
}

/** Revisa un candidato y marca avisos. Si hay secretos reales, bloquea la aceptación. */
export function revisar(c: Candidato): { avisos: string[]; bloqueado: boolean } {
  const avisos: string[] = [];
  const combinado = c.propuesto + c.original;

  if (FORMAS_SECRETAS(combinado)) {
    avisos.push("Contiene forma de secreto real (sk-, gsk_, Bearer): se bloquea la aceptación.");
  }
  if (tieneRutaDisco(combinado)) {
    avisos.push("Contiene ruta de disco: revisar antes de aceptar.");
  }
  if (combinado.includes("eval") || combinado.includes("new Function")) {
    avisos.push("Uso de eval o new Function: bloqueado por seguridad.");
  }
  if (c.propuesto.includes("node:") || combinado.includes("node:")) {
    avisos.push("Referencia a módulo node:: bloqueado en código editable.");
  }
  const dinamico = /import\(/;
  if (dinamico.test(combinado)) {
    avisos.push("Uso de import() dinámico: bloqueado por seguridad.");
  }

  const bloqueado = avisos.some((a) => a.includes("secreto real") || a.includes("eval") || a.includes("new Function") || a.includes("node:") || a.includes("import()"));
  return { avisos, bloqueado };
}

/** Diferencia línea a línea, sin librerías externas. */
export function diff(original: string, propuesto: string): { añadidos: string[]; borrados: string[]; modificados: string[] } {
  const orig = original.split("\n");
  const prop = propuesto.split("\n");
  const añadidos: string[] = [];
  const borrados: string[] = [];
  const modificados: string[] = [];
  const max = Math.max(orig.length, prop.length);
  for (let i = 0; i < max; i++) {
    const o = orig[i] ?? "";
    const p = prop[i] ?? "";
    if (o !== p) {
      if (o === "" && p !== "") añadidos.push(p);
      else if (p === "" && o !== "") borrados.push(o);
      else modificados.push(`${o} → ${p}`);
    }
  }
  return { añadidos, borrados, modificados };
}

/** Acepta un candidato con la mano. Solo actúa sobre una capa `codigo` de la molécula. */
export function aceptar(c: Candidato, ctx: ContextoCandidato): { ok: boolean; mensaje: string; avisos: string[]; bloqueado: boolean } {
  const rev = revisar(c);
  const avisos = [...c.avisos, ...rev.avisos];
  if (rev.bloqueado) {
    return { ok: false, mensaje: "Aceptación bloqueada: secretos, eval, new Function, import() dinámico o módulo node:.", avisos, bloqueado: true };
  }
  if (!ctx.decidir) {
    return { ok: false, mensaje: "Falta el contexto de decisión (decidir) para aceptar con la mano.", avisos, bloqueado: rev.bloqueado };
  }
  const d = ctx.decidir({ accion: "aplicar-codigo", origen: "mano" });
  if (!d.permitido) {
    return { ok: false, mensaje: `No permitido: ${d.motivo}`, avisos, bloqueado: rev.bloqueado };
  }
  // Solo reemplaza contenido de una capa `codigo` de la molécula: nunca archivo ni núcleo.
  if (c.capaId.startsWith("nucleo/") || c.capaId.includes("invariantes")) {
    return { ok: false, mensaje: "No se puede aceptar sobre el núcleo del OS (nucleo/*, invariantes).", avisos, bloqueado: rev.bloqueado };
  }
  return { ok: true, mensaje: "Candidato aceptado con la mano: reemplaza solo el contenido de la capa de código de la molécula.", avisos, bloqueado: rev.bloqueado };
}

export interface ContextoCandidato {
  capaCodigoId?: string;
  decidir?: (c: { accion: string; origen: string }) => { permitido: boolean; confirmar: boolean; motivo: string };
}
