// Datasets de LlamaFactory (SFT y KTO) desde las valoraciones y correcciones
// de Astraura. Módulo PURO: sin red, sin disco y sin claves.
import type { Experiencia } from "../experiencias";
import type { AjustesAprendizaje } from "../experiencias-aprendizaje";
export type DestinoModelo = "privado" | "ambito" | "publico";
export interface Mensaje { role: "user" | "assistant"; content: string }
export type Parte = "train" | "val" | "test";
export interface FilaSft { messages: Mensaje[]; parte: Parte }
export interface FilaKto { messages: Mensaje[]; label: boolean; parte: Parte }
export interface ResultadoLlamaFactory {
  sft: FilaSft[];
  kto: FilaKto[];
  partes: Record<Parte, number>;
  descartadas: Record<string, number>;
  info: Record<string, object>;
}
// Lo privado nunca sale de las máquinas de la persona. El ámbito exige
// consentimiento y el público, además, privacidad declarada «publica».
export function permitido(
  destino: DestinoModelo,
  ambito: string,
  ajustes: AjustesAprendizaje,
): { ok: boolean; motivo?: string } {
  if (destino === "privado") return { ok: true };
  if (!ambito) return { ok: false, motivo: "sin-ambito" };
  if (!ajustes.aprendizajeColectivo) return { ok: false, motivo: "aprendizaje-colectivo-apagado" };
  const a = ajustes.porAmbito[ambito];
  if (!a || !a.permite || a.privacidad === "privada") {
    return { ok: false, motivo: "ambito-no-comparte" };
  }
  if (destino === "publico" && a.privacidad !== "publica") {
    return { ok: false, motivo: "privacidad-no-publica" };
  }
  return { ok: true };
}

const SECRETO = /sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
function fnv1a(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
// Reparto determinista 80/10/10 por el id de la experiencia.
function parteDe(id: string): Parte {
  const cubo = fnv1a(id) % 100;
  return cubo < 80 ? "train" : cubo < 90 ? "val" : "test";
}
const ETIQUETAS = {
  role_tag: "role",
  content_tag: "content",
  user_tag: "user",
  assistant_tag: "assistant",
};
function entradaDataset(archivo: string, conKto: boolean): object {
  const columns: Record<string, string> = { messages: "messages" };
  if (conKto) columns.kto_tag = "label";
  return { file_name: archivo, formatting: "sharegpt", columns, tags: { ...ETIQUETAS } };
}

const par = (entrada: string, texto: string): Mensaje[] => [
  { role: "user", content: entrada },
  { role: "assistant", content: texto },
];

export function paraLlamaFactory(
  exps: Experiencia[],
  ajustes: AjustesAprendizaje,
  op: { ambito: string; destino: DestinoModelo; nombre: string },
): ResultadoLlamaFactory {
  const delAmbito = exps.filter((e) =>
    (e.tipo === "valoracion" || e.tipo === "correccion") && (e.ambito ?? e.dominio) === op.ambito);
  const vacio: ResultadoLlamaFactory = {
    sft: [], kto: [], partes: { train: 0, val: 0, test: 0 }, descartadas: {}, info: {},
  };
  if (!permitido(op.destino, op.ambito, ajustes).ok) {
    return { ...vacio, descartadas: { bloqueado: delAmbito.length } };
  }
  const sft: FilaSft[] = [], kto: FilaKto[] = [];
  const descartadas: Record<string, number> = {}, vistos = new Set<string>();
  const descartar = (motivo: string): void => { descartadas[motivo] = (descartadas[motivo] ?? 0) + 1; };
  for (const e of delAmbito) {
    const entrada = e.entrada.trim();
    const original = typeof e.salida === "string" ? e.salida.trim() : "";
    const corregido = e.correccion?.trim() ?? "";
    if (!entrada) { descartar("entrada-vacia"); continue; }
    if (typeof e.salida !== "string") { descartar("salida-no-texto"); continue; }
    if (!original) { descartar("texto-vacio"); continue; }
    const clave = `${e.tipo}\u0000${entrada}\u0000${original}\u0000${corregido}`;
    if (vistos.has(clave)) { descartar("duplicado"); continue; }
    vistos.add(clave);
    if (SECRETO.test(`${entrada}\n${original}\n${corregido}`)) { descartar("secreto"); continue; }
    const parte = parteDe(e.id);
    if (e.tipo === "correccion") {
      if (corregido) {
        sft.push({ messages: par(entrada, corregido), parte });
        kto.push({ messages: par(entrada, corregido), label: true, parte });
      }
      kto.push({ messages: par(entrada, original), label: false, parte });
    } else if (e.valoracion === "positiva") {
      sft.push({ messages: par(entrada, original), parte });
      kto.push({ messages: par(entrada, original), label: true, parte });
    } else if (e.valoracion === "negativa") {
      kto.push({ messages: par(entrada, original), label: false, parte });
    } else {
      descartar("sin-valoracion");
    }
  }
  const partes: Record<Parte, number> = { train: 0, val: 0, test: 0 };
  for (const fila of sft) partes[fila.parte] += 1;
  return {
    sft, kto, partes, descartadas,
    info: {
      [`${op.nombre}_sft`]: entradaDataset(`${op.nombre}_sft.json`, false),
      [`${op.nombre}_kto`]: entradaDataset(`${op.nombre}_kto.json`, true),
    },
  };
}
