// Datasets SFT y KTO para LlamaFactory (hiyouga/LlamaFactory, Apache-2.0) a partir de
// las valoraciones y correcciones de Astraura. Módulo PURO: sin red y sin node:*.
// La regla de privacidad manda: lo privado jamás sale del dispositivo de la persona.

import type { Experiencia } from "../experiencias";
import type { AjustesAprendizaje } from "../experiencias-aprendizaje";

export type DestinoModelo = "privado" | "ambito" | "publico";
export type Parte = "train" | "val" | "test";
export interface Mensaje { role: string; content: string }
export interface FilaSft { messages: Mensaje[]; parte: Parte }
export interface FilaKto { messages: Mensaje[]; label: boolean; parte: Parte }
export interface EntradaDatasetInfo { file_name: string; formatting: "sharegpt"; columns: Record<string, string>; tags: Record<string, string> }
export interface ResultadoDataset { sft: FilaSft[]; kto: FilaKto[]; partes: Record<Parte, number>; descartadas: Record<string, number>; info: Record<string, EntradaDatasetInfo> }

// «privado» vale siempre: el corpus se queda en las máquinas de la persona. «ambito»
// exige aprendizaje colectivo, permiso del ámbito y privacidad distinta de «privada»;
// «publico» exige además privacidad «publica».
export function permitido(
  destino: DestinoModelo,
  ambito: string,
  ajustes: AjustesAprendizaje,
): { ok: boolean; motivo?: string } {
  if (destino === "privado") return { ok: true };
  if (!ajustes.aprendizajeColectivo) return { ok: false, motivo: "aprendizaje_colectivo" };
  const a = ajustes.porAmbito[ambito];
  if (!a || !a.permite) return { ok: false, motivo: "ambito_no_permite" };
  if (a.privacidad === "privada") return { ok: false, motivo: "privada" };
  if (destino === "publico" && a.privacidad !== "publica") return { ok: false, motivo: "no_publica" };
  return { ok: true };
}

// Etiquetas sharegpt que LlamaFactory espera en `dataset_info.json`.
const TAGS: Record<string, string> = {
  role_tag: "role",
  content_tag: "content",
  user_tag: "user",
  assistant_tag: "assistant",
};

// Pinta de secreto: clave de OpenAI, de Google, bind y clave privada PEM.
const SECRETOS: RegExp[] = [
  /sk-[A-Za-z0-9]{16,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

// Reparto 80/10/10 determinista por el hash FNV-1a del id de la experiencia.
function parteDe(id: string): Parte {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const m = h % 100;
  return m < 80 ? "train" : m < 90 ? "val" : "test";
}

// Convierte las experiencias del ámbito pedido en los datasets SFT y KTO con
// sus entradas de dataset_info.json; cuenta lo descartado por su motivo.
export function paraLlamaFactory(
  exps: Experiencia[],
  ajustes: AjustesAprendizaje,
  op: { ambito: string; destino: DestinoModelo; nombre: string },
): ResultadoDataset {
  const delAmbito = exps.filter(
    (e) => (e.tipo === "valoracion" || e.tipo === "correccion") && (e.ambito ?? e.dominio) === op.ambito,
  );
  const partes: Record<Parte, number> = { train: 0, val: 0, test: 0 };
  if (!permitido(op.destino, op.ambito, ajustes).ok) {
    return { sft: [], kto: [], partes, descartadas: { bloqueado: delAmbito.length }, info: {} };
  }
  const descartadas: Record<string, number> = {};
  const suma = (motivo: string): void => {
    descartadas[motivo] = (descartadas[motivo] ?? 0) + 1;
  };
  const vistos = new Set<string>();
  const sft: FilaSft[] = [];
  const kto: FilaKto[] = [];
  for (const e of delAmbito) {
    const salida = typeof e.salida === "string" ? e.salida : "";
    const corregido = e.tipo === "correccion" ? e.correccion ?? "" : "";
    if (!e.entrada.trim()) { suma("entrada_vacia"); continue; }
    if (typeof e.salida !== "string") { suma("salida_invalida"); continue; }
    if (!salida.trim() || (e.tipo === "correccion" && !corregido.trim())) { suma("texto_vacio"); continue; }
    if ([e.entrada, salida, corregido].some((t) => SECRETOS.some((r) => r.test(t)))) { suma("secreto"); continue; }
    const clave = `${e.entrada} ${salida} ${corregido}`;
    if (vistos.has(clave)) { suma("duplicado"); continue; }
    vistos.add(clave);
    const parte = parteDe(e.id);
    const turno = (content: string): Mensaje[] => [{ role: "user", content: e.entrada }, { role: "assistant", content }];
    if (e.tipo === "correccion") {
      sft.push({ messages: turno(corregido), parte });
    } else if (e.valoracion === "positiva") {
      sft.push({ messages: turno(salida), parte });
    }
    kto.push({ messages: turno(salida), label: e.valoracion === "positiva", parte });
    if (e.tipo === "correccion") kto.push({ messages: turno(corregido), label: true, parte });
  }
  for (const f of sft) partes[f.parte] += 1;
  return {
    sft,
    kto,
    partes,
    descartadas,
    info: {
      [`${op.nombre}_sft`]: { file_name: `${op.nombre}_sft.json`, formatting: "sharegpt", columns: { messages: "messages" }, tags: TAGS },
      [`${op.nombre}_kto`]: { file_name: `${op.nombre}_kto.json`, formatting: "sharegpt", columns: { messages: "messages", kto_tag: "label" }, tags: TAGS },
    },
  };
}
