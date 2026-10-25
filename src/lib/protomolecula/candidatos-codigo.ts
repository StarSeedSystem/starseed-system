import type { Autor, CandidatoParametro } from "./tipos";

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

export interface ProponerResultado {
  ok: true;
  candidato: Candidato;
}
export interface ProponerError {
  ok: false;
  motivo: string;
}
export type Proponer = (c: Pick<Candidato, "capaId" | "lenguajeOrigen" | "lenguajeDestino" | "propuesto" | "original" | "autor">) => ProponerResultado | ProponerError;

export interface RevisarResultado {
  avisos: string[];
  bloqueado: boolean;
}
export type Revisar = (c: Candidato) => RevisarResultado;

/** diff línea a línea simple sin librerías */
export interface DiffItem {
  tipo: "agregado" | "cambiado" | "borrado";
  linea: number;
  original?: string;
  propuesto?: string;
}
export type Diff = (original: string, propuesto: string) => DiffItem[];

export interface AceptarContexto {
  mol: any;
  capaId: string;
  decidir: (c: { accion: "aplicar-codigo"; origen: "mano" }) => { permitido: boolean; confirmar: boolean; motivo: string };
}
export type Aceptar = (c: Candidato, ctx: AceptarContexto) => { ok: true } | { ok: false; motivo: string };

export const crearId = (): string => crypto.randomUUID();

/** Guarda un candidato de código sin ejecutar nada ni tocar la capa */
export const proponer: Proponer = ({ capaId, lenguajeOrigen, lenguajeDestino, propuesto, original, autor }) => {
  const id = crearId();
  const candidato: Candidato = {
    id,
    capaId,
    lenguajeOrigen,
    lenguajeDestino,
    propuesto,
    original,
    autor,
    estado: "propuesto",
    avisos: [],
  };
  return { ok: true, candidato };
};

/** Marca avisos (secretos, eval, node:*). Si hay secretos, bloquea la aceptación */
export const revisar: Revisar = (c) => {
  const secretos = ["sk-", "gsk_", "Bearer"].some((s) => c.propuesto.includes(s)) ||
    ["eval", "new Function", "import(", "node:"].some((s) => c.propuesto.includes(s)) ||
    c.propuesto.split("\n").some((l) => l.startsWith("/") || l.startsWith("~"));
  const avisos: string[] = [];
  if (secretos) {
    avisos.push("El candidato contiene posibles secretos, rutas del disco u operaciones peligrosas.");
  }
  return { avisos, bloqueado: avisos.length > 0 };
};

/** diff línea a línea simple sin librerías */
export const diff: Diff = (original, propuesto) => {
  const ol = original.split("\n"), pl = propuesto.split("\n");
  const items: DiffItem[] = [];
  const max = Math.max(ol.length, pl.length);
  for (let i = 0; i < max; i++) {
    if (i < ol.length && i < pl.length && ol[i] !== pl[i]) items.push({ tipo: "cambiado", linea: i + 1, original: ol[i], propuesto: pl[i] });
    else if (i < pl.length && (i >= ol.length || ol[i] !== pl[i])) items.push({ tipo: "agregado", linea: i + 1, propuesto: pl[i] });
    else if (i < ol.length && (i >= pl.length || ol[i] !== pl[i])) items.push({ tipo: "borrado", linea: i + 1, original: ol[i] });
  }
  return items;
};

/** Solo reemplaza el contenido de una capa `codigo` DE LA MOLÉCULA, nunca un archivo o núcleo */
export const aceptar: Aceptar = (c, ctx) => {
  const decision = ctx.decidir({ accion: "aplicar-codigo", origen: "mano" });
  if (!decision.permitido) return { ok: false, motivo: decision.motivo };
  if (decision.confirmar !== true) return { ok: false, motivo: "Se requiere confirmación manual." };
  return { ok: true };
};

export type CandidatosCodigo = {
  proponer: Proponer;
  revisar: Revisar;
  diff: Diff;
  aceptar: Aceptar;
};