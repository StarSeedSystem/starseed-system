/**
 * Datasets SFT y KTO para LlamaFactory (hiyouga/LlamaFactory, Apache-2.0) a partir de las
 * valoraciones y correcciones de Astraura (§8 del aprendizaje). Módulo PURO: sin red, sin
 * disco, sin `node:*`. Formato «sharegpt» con columna `messages` ({role, content}) y, para
 * KTO, la columna booleana `label` declarada como `kto_tag` en `data/dataset_info.json`.
 * Regla dura de Astraura: lo privado jamás sale de los dispositivos ni de los servidores propios.
 */

import type { Experiencia } from "../experiencias";
import type { AjustesAprendizaje } from "../experiencias-aprendizaje";

/** A dónde va el modelo afinado: en el aparato de la persona, en un ámbito o en la red pública. */
export type DestinoModelo = "privado" | "ambito" | "publico";
export type Parte = "train" | "val" | "test";
export interface Mensaje { role: "user" | "assistant"; content: string }
export interface FilaSft { messages: [Mensaje, Mensaje]; parte: Parte }
export interface FilaKto { messages: [Mensaje, Mensaje]; label: boolean; parte: Parte }
export interface EntradaDatasetInfo { file_name: string; formatting: "sharegpt"; columns: Record<string, string>; tags: Record<string, string> }
export interface DatasetsLlamaFactory { sft: FilaSft[]; kto: FilaKto[]; partes: { train: number; val: number; test: number }; descartadas: Record<string, number>; info: Record<string, EntradaDatasetInfo> }

/** ¿Puede este corpus salir al destino pedido? «privado» siempre (se queda en las máquinas de
 * la persona); «ámbito» exige aprendizaje colectivo, permiso del ámbito y privacidad ≠ «privada»;
 * «público» añade que la privacidad sea «pública». */
export function permitido(destino: DestinoModelo, ambito: string, ajustes: AjustesAprendizaje): { ok: boolean; motivo?: string } {
  if (destino === "privado") return { ok: true };
  if (!ajustes.aprendizajeColectivo) return { ok: false, motivo: "sin aprendizaje colectivo" };
  const a = ajustes.porAmbito[ambito];
  if (!a || !a.permite) return { ok: false, motivo: "el ámbito no permite compartir" };
  if (a.privacidad === "privada") return { ok: false, motivo: "privada: jamás sale del dispositivo" };
  if (destino === "publico" && a.privacidad !== "publica") {
    return { ok: false, motivo: "público exige privacidad pública" };
  }
  return { ok: true };
}

// ── helpers puros ───────────────────────────────────────────────────────────

// Nada con pinta de clave llega al dataset: OpenAI, Google, Bearer y PEM.
const SECRETOS = [
  /sk-[A-Za-z0-9]{16,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

function pareceSecreto(texto: string): boolean {
  return SECRETOS.some((r) => r.test(texto));
}

// Hash FNV-1a de 32 bits: reparto determinista sin depender del orden.
function fnv1a(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// 80/10/10 estable por el id de la experiencia: la misma fila vuelve siempre al mismo tramo.
function parteDe(id: string): Parte {
  const h = fnv1a(id) % 100;
  return h < 80 ? "train" : h < 90 ? "val" : "test";
}

function esDelAmbito(e: Experiencia, ambito: string): boolean { return (e.ambito ?? e.dominio) === ambito; }

export function paraLlamaFactory(exps: Experiencia[], ajustes: AjustesAprendizaje, op: { ambito: string; destino: DestinoModelo; nombre: string }): DatasetsLlamaFactory {
  const vacias: DatasetsLlamaFactory = { sft: [], kto: [], partes: { train: 0, val: 0, test: 0 }, descartadas: {}, info: {} };
  if (!permitido(op.destino, op.ambito, ajustes).ok) {
    const n = exps.filter((e) => esAprendizaje(e) && esDelAmbito(e, op.ambito)).length;
    return { ...vacias, descartadas: { bloqueado: n } };
  }
  const sft: FilaSft[] = [];
  const kto: FilaKto[] = [];
  const descartadas: Record<string, number> = {};
  const vistos = new Set<string>();
  const descartar = (m: string) => { descartadas[m] = (descartadas[m] ?? 0) + 1; };
  for (const e of exps) {
    if (!esAprendizaje(e) || !esDelAmbito(e, op.ambito)) continue;
    const entrada = e.entrada.trim();
    if (!entrada) { descartar("entrada_vacia"); continue; }
    const salida = typeof e.salida === "string" ? e.salida : null;
    if (salida === null) { descartar("salida_no_string"); continue; }
    const respuesta = e.tipo === "correccion" ? (e.correccion ?? "") : salida;
    if (!respuesta.trim() || (e.tipo === "correccion" && !salida.trim())) { descartar("texto_vacio"); continue; }
    if (e.tipo === "valoracion" && e.valoracion !== "positiva" && e.valoracion !== "negativa") { descartar("valoracion_faltante"); continue; }
    if ([entrada, salida, respuesta].some((t) => pareceSecreto(t))) { descartar("secreto"); continue; }
    const clave = `${e.tipo}|${e.valoracion ?? ""}|${entrada}|${salida}|${respuesta}`;
    if (vistos.has(clave)) { descartar("duplicado"); continue; }
    vistos.add(clave);
    const parte = parteDe(e.id);
    const usuario: Mensaje = { role: "user", content: entrada };
    if (e.tipo === "correccion") {
      sft.push({ messages: [usuario, { role: "assistant", content: respuesta }], parte });
      kto.push({ messages: [usuario, { role: "assistant", content: salida }], label: false, parte });
      kto.push({ messages: [usuario, { role: "assistant", content: respuesta }], label: true, parte });
    } else if (e.valoracion === "positiva") {
      sft.push({ messages: [usuario, { role: "assistant", content: respuesta }], parte });
      kto.push({ messages: [usuario, { role: "assistant", content: respuesta }], label: true, parte });
    } else {
      kto.push({ messages: [usuario, { role: "assistant", content: respuesta }], label: false, parte });
    }
  }
  const partes = { train: 0, val: 0, test: 0 }; for (const f of sft) partes[f.parte] += 1;
  return { sft, kto, partes, descartadas, info: datasetInfo(op.nombre) };
}

function datasetInfo(nombre: string): Record<string, EntradaDatasetInfo> {
  const tags = { role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" };
  return {
    [`${nombre}_sft`]: { file_name: `${nombre}_sft.json`, formatting: "sharegpt", columns: { messages: "messages" }, tags },
    [`${nombre}_kto`]: { file_name: `${nombre}_kto.json`, formatting: "sharegpt", columns: { messages: "messages", kto_tag: "label" }, tags },
  };
}

function esAprendizaje(e: Experiencia): boolean { return e.tipo === "valoracion" || e.tipo === "correccion"; }
