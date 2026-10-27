/**
 * Datasets de LlamaFactory para el aprendizaje por ámbito (Ola 1025R) — módulo PURO.
 * Convierte valoraciones y correcciones de Astraura en datasets «sharegpt» (columna `messages`)
 * y KTO (`label` como `kto_tag`), con la regla de privacidad dura de Astraura: lo privado
 * jamás sale de las máquinas de la persona y el ámbito exige consentimiento colectivo.
 */

import type { Experiencia } from "../experiencias";
import type { AjustesAprendizaje } from "../experiencias-aprendizaje";

export type DestinoModelo = "privado" | "ambito" | "publico";
export type ParteDataset = "train" | "val" | "test";
export interface OpLlamaFactory { ambito: string; destino: DestinoModelo; nombre: string }

export interface MensajeDataset { role: string; content: string }
export interface FilaSft { messages: MensajeDataset[]; parte: ParteDataset }
export interface FilaKto extends FilaSft { label: boolean }

export interface ResultadoDataset {
  sft: FilaSft[];
  kto: FilaKto[];
  partes: { train: number; val: number; test: number };
  descartadas: Record<string, number>;
  info: Record<string, object>;
}

const TAGS_SHAREGPT: Record<string, string> =
  { role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" };

// Cualquier texto con pinta de secreto saca la experiencia entera del dataset.
const SECRETOS: RegExp[] = [
  /sk-[A-Za-z0-9]{16,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

// Hash FNV-1a de 32 bits: el mismo id da siempre el mismo tramo.
function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

// Reparto 80/10/10 por cubos: 0-7 train, 8 val, 9 test.
function parteDe(id: string): ParteDataset {
  const cubo = fnv1a(id) % 10;
  return cubo < 8 ? "train" : cubo === 8 ? "val" : "test";
}

function sinSecretos(...textos: string[]): boolean {
  return !SECRETOS.some((re) => textos.some((t) => re.test(t)));
}/** Regla de privacidad por destino: privado siempre; ámbito exige consentimiento colectivo. */
export function permitido(destino: DestinoModelo, ambito: string, ajustes: AjustesAprendizaje):
  { ok: boolean; motivo?: string } {
  if (destino === "privado") return { ok: true }; // se queda en las máquinas de la persona
  if (!ajustes.aprendizajeColectivo) return { ok: false, motivo: "aprendizaje-colectivo-apagado" };
  const a = ajustes.porAmbito[ambito];
  if (!a || !a.permite) return { ok: false, motivo: "ambito-no-permite" };
  if (a.privacidad === "privada") return { ok: false, motivo: "privacidad-privada" };
  if (destino === "publico" && a.privacidad !== "publica") return { ok: false, motivo: "privacidad-no-publica" };
  return { ok: true };
}

const dialogo = (entrada: string, respuesta: string): MensajeDataset[] =>
  [{ role: "user", content: entrada }, { role: "assistant", content: respuesta }];

function datasetInfo(nombre: string): Record<string, object> {
  const info: Record<string, object> = {};
  const base = (kto: boolean) => {
    const columnas: Record<string, string> = { messages: "messages" };
    if (kto) columnas.kto_tag = "label";
    return { file_name: `${nombre}${kto ? "_kto" : "_sft"}.json`, formatting: "sharegpt", columns: columnas, tags: TAGS_SHAREGPT };
  };
  info[`${nombre}_sft`] = base(false);
  info[`${nombre}_kto`] = base(true);
  return info;
}

/** Convierte experiencias en datasets SFT y KTO, con reparto 80/10/10 por FNV-1a del id. */
export function paraLlamaFactory(exps: Experiencia[], ajustes: AjustesAprendizaje, op: OpLlamaFactory):
  ResultadoDataset {
  if (!permitido(op.destino, op.ambito, ajustes).ok) {
    return { sft: [], kto: [], partes: { train: 0, val: 0, test: 0 }, descartadas: { bloqueado: exps.length }, info: {} };
  }
  const sft: FilaSft[] = [];
  const kto: FilaKto[] = [];
  const partes: ResultadoDataset["partes"] = { train: 0, val: 0, test: 0 };
  const descartadas: Record<string, number> = {};
  const yaVisto = new Set<string>();
  const d = (motivo: string) => { descartadas[motivo] = (descartadas[motivo] ?? 0) + 1; };
  for (const e of exps) {
    if (e.tipo !== "valoracion" && e.tipo !== "correccion") { d("tipo-distinto"); continue; }
    if ((e.ambito ?? e.dominio) !== op.ambito) { d("ambito-distinto"); continue; }
    if (typeof e.salida !== "string") { d("salida-no-string"); continue; }
    if (!e.entrada.trim()) { d("entrada-vacia"); continue; }
    if (!e.salida.trim()) { d("texto-vacio"); continue; }
    const cor = e.tipo === "correccion" && typeof e.correccion === "string" ? e.correccion : "";
    if (e.tipo === "correccion" && !cor.trim()) { d("texto-vacio"); continue; }
    if (!sinSecretos(e.entrada, e.salida, cor)) { d("secreto"); continue; }
    if (e.tipo === "valoracion" && e.valoracion !== "positiva" && e.valoracion !== "negativa") { d("valoracion-falta"); continue; }
    const huella = `${e.entrada}|${e.salida}|${cor}`;
    if (yaVisto.has(huella)) { d("duplicado"); continue; }
    yaVisto.add(huella);
    const parte = parteDe(e.id);
    if (e.tipo === "correccion") {
      sft.push({ messages: dialogo(e.entrada, cor), parte });
      kto.push({ messages: dialogo(e.entrada, e.salida), label: false, parte });
      kto.push({ messages: dialogo(e.entrada, cor), label: true, parte });
    } else if (e.valoracion === "positiva") {
      sft.push({ messages: dialogo(e.entrada, e.salida), parte });
      kto.push({ messages: dialogo(e.entrada, e.salida), label: true, parte });
    } else {
      kto.push({ messages: dialogo(e.entrada, e.salida), label: false, parte });
    }
    if (e.tipo === "correccion" || e.valoracion === "positiva") partes[parte] += 1;
  }
  return { sft, kto, partes, descartadas, info: datasetInfo(op.nombre) };
}

