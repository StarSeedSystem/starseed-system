import type { Autor } from "./tipos";
import type { Molecula, Capa } from "./tipos";

export interface CandidatoCodigo {
  id: string;
  capaId: string;
  lenguajeOrigen: string;
  lenguajeDestino?: string;
  propuesto: string;
  original: string;
  autor: Autor;
  estado: "propuesto" | "aceptado" | "rechazado";
  avisos: string[];
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function proponer(params: {
  capaId: string;
  lenguajeOrigen: string;
  lenguajeDestino?: string;
  propuesto: string;
  original: string;
  autor: Autor;
}): CandidatoCodigo {
  return {
    id: genId(),
    capaId: params.capaId,
    lenguajeOrigen: params.lenguajeOrigen,
    lenguajeDestino: params.lenguajeDestino,
    propuesto: params.propuesto,
    original: params.original,
    autor: params.autor,
    estado: "propuesto",
    avisos: [],
  };
}

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9]{10,}\b/,
  /\bgsk_[A-Za-z0-9]{10,}\b/,
  /\bBearer\s+[A-Za-z0-9_\-]{10,}\b/i,
  /\/(home|tmp|var|usr|etc|Users)\//,
];

const RIESGO_PATTERNS = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bimport\s*\(/,
  /\bnode:/,
];

export function revisar(c: CandidatoCodigo): CandidatoCodigo {
  const avisos = [...c.avisos];
  const texto = c.propuesto;
  for (const re of SECRET_PATTERNS) {
    if (re.test(texto)) {
      if (!avisos.includes("secreto detectado")) avisos.push("secreto detectado");
    }
  }
  for (const re of RIESGO_PATTERNS) {
    if (re.test(texto)) {
      const msg = re.source.includes("eval") ? "uso de eval" : re.source.includes("Function") ? "new Function" : re.source.includes("import") ? "import dinámico" : "node:";
      if (!avisos.includes(msg)) avisos.push(msg);
    }
  }
  return { ...c, avisos };
}

export function diff(original: string, propuesto: string): string {
  const o = original.split("\n");
  const p = propuesto.split("\n");
  const max = Math.max(o.length, p.length);
  const lines: string[] = [];
  for (let i = 0; i < max; i++) {
    const lo = o[i] ?? "";
    const lp = p[i] ?? "";
    if (lo === lp) {
      lines.push(`  ${lo}`);
    } else {
      if (lo) lines.push(`- ${lo}`);
      if (lp) lines.push(`+ ${lp}`);
    }
  }
  return lines.join("\n");
}

export function aceptar(c: CandidatoCodigo, ctx: {
  molecula: Molecula;
  decidir: (p: { accion: string; origen: string }) => boolean;
}): { ok: boolean; molecula?: Molecula; motivo?: string; candidato?: CandidatoCodigo } {
  if (c.estado !== "propuesto") return { ok: false, motivo: "candidato no está propuesto", candidato: c };
  const rev = revisar(c);
  if (rev.avisos.includes("secreto detectado")) return { ok: false, motivo: "secretos bloquean aceptación", candidato: rev };
  const capa = ctx.molecula.capas.find(cap => cap.id === c.capaId);
  if (!capa) return { ok: false, motivo: "capa no encontrada", candidato: rev };
  if (capa.tipo !== "codigo") return { ok: false, motivo: "capa no es de código", candidato: rev };
  if (capa.bloqueada) return { ok: false, motivo: "capa bloqueada", candidato: rev };
  if (capa.id.startsWith("nucleo") || capa.id.startsWith("invariante")) return { ok: false, motivo: "no se puede modificar núcleo", candidato: rev };
  const permitido = ctx.decidir({ accion: "aplicar-codigo", origen: "mano" });
  if (!permitido) return { ok: false, motivo: "decisión denegada, solo la mano puede aceptar", candidato: rev };
  // reemplazo simulado: se asume que el contenido vive en referencia; aquí solo avanzamos versión y estado
  const nuevaMolecula: Molecula = {
    ...ctx.molecula,
    version: ctx.molecula.version + 1,
    actualizadaEn: Date.now(),
  };
  const nuevo = { ...rev, estado: "aceptado" as const };
  return { ok: true, molecula: nuevaMolecula, candidato: nuevo };
}
