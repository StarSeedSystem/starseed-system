// Datasets de LlamaFactory (Ola 1025R) — módulo PURO.
// Convierte valoraciones y correcciones de Astraura en SFT (sharegpt) y KTO
// (aprobado/suspenso) por ámbito. Sin red ni `node:*`: la privacidad se decide
// ANTES de escribir un solo ejemplo.

import type { Experiencia } from "../experiencias";
import type { AjustesAprendizaje } from "../experiencias-aprendizaje";

export type DestinoModelo = "privado" | "ambito" | "publico";
export type Parte = "train" | "val" | "test";

export interface MensajeLlamaFactory { role: "user" | "assistant"; content: string }
export interface FilaSft { messages: MensajeLlamaFactory[]; parte: Parte }
export interface FilaKto extends FilaSft { label: boolean }

export interface OpcionesDataset {
  ambito: string;
  destino: DestinoModelo;
  nombre: string;
}

export interface DatasetLlamaFactory {
  sft: FilaSft[];
  kto: FilaKto[];
  partes: Record<Parte, number>;
  descartadas: Record<string, number>;
  info: Record<string, object>;
}

const SECRETOS: RegExp[] = [
  /sk-[A-Za-z0-9]{16,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const ETIQUETAS = { role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" };

export function permitido(
  destino: DestinoModelo,
  ambito: string,
  ajustes: AjustesAprendizaje,
): { ok: boolean; motivo?: string } {
  if (destino === "privado") return { ok: true };
  if (!ajustes.aprendizajeColectivo) return { ok: false, motivo: "el aprendizaje colectivo está apagado" };
  const a = ajustes.porAmbito[ambito];
  if (!a) return { ok: false, motivo: `el ámbito «${ambito}» no está configurado` };
  if (!a.permite) return { ok: false, motivo: `el ámbito «${ambito}» no permite compartir lo aprendido` };
  if (a.privacidad === "privada") return { ok: false, motivo: `el ámbito «${ambito}» es privado` };
  if (destino === "publico" && a.privacidad !== "publica") {
    return { ok: false, motivo: `el ámbito «${ambito}» no es público` };
  }
  return { ok: true };
}

function pareceSecreto(texto: string): boolean {
  return SECRETOS.some((r) => r.test(texto));
}

// FNV-1a de 32 bits: reparto estable entre máquinas y ejecuciones.
function fnv1a(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function parteDe(id: string): Parte {
  const cubo = fnv1a(id) % 100;
  if (cubo < 80) return "train";
  if (cubo < 90) return "val";
  return "test";
}

function entradaInfo(nombre: string, sufijo: string, kto: boolean): object {
  return {
    file_name: `${nombre}-${sufijo}.json`,
    formatting: "sharegpt",
    columns: kto ? { messages: "messages", kto_tag: "label" } : { messages: "messages" },
    tags: { ...ETIQUETAS },
  };
}

function infoDe(nombre: string): Record<string, object> {
  return { [`${nombre}_sft`]: entradaInfo(nombre, "sft", false), [`${nombre}_kto`]: entradaInfo(nombre, "kto", true) };
}

export function paraLlamaFactory(
  exps: Experiencia[],
  ajustes: AjustesAprendizaje,
  op: OpcionesDataset,
): DatasetLlamaFactory {
  const info = infoDe(op.nombre);
  const vacio: DatasetLlamaFactory = {
    sft: [],
    kto: [],
    partes: { train: 0, val: 0, test: 0 },
    descartadas: {},
    info,
  };
  if (!permitido(op.destino, op.ambito, ajustes).ok) return { ...vacio, descartadas: { bloqueado: exps.length } };

  const sft: FilaSft[] = [];
  const kto: FilaKto[] = [];
  const partes: Record<Parte, number> = { train: 0, val: 0, test: 0 };
  const descartadas: Record<string, number> = {};
  const vistos = new Set<string>();
  const descartar = (motivo: string) => {
    descartadas[motivo] = (descartadas[motivo] ?? 0) + 1;
  };

  for (const e of exps) {
    if (e.tipo !== "valoracion" && e.tipo !== "correccion") continue;
    if ((e.ambito ?? e.dominio ?? "") !== op.ambito) continue;
    const corregido = e.tipo === "correccion" ? (e.correccion ?? "") : "";
    const textoValido = typeof e.salida === "string" && Boolean(e.salida.trim()) && Boolean(e.entrada.trim());
    if (!textoValido || (e.tipo === "correccion" && !corregido.trim())) {
      descartar(typeof e.salida === "string" ? "vacio" : "salida no es texto");
      continue;
    }
    if ([e.entrada, e.salida, corregido].some(pareceSecreto)) {
      descartar("secreto");
      continue;
    }
    const clave = [e.tipo, e.entrada, e.salida, corregido, e.valoracion ?? ""].join("\u0001");
    if (vistos.has(clave)) {
      descartar("duplicado");
      continue;
    }
    vistos.add(clave);

    const parte = parteDe(e.id);
    const mensajes = (respuesta: string): MensajeLlamaFactory[] => [
      { role: "user", content: e.entrada },
      { role: "assistant", content: respuesta },
    ];
    if (e.tipo === "correccion" || e.valoracion === "positiva") {
      sft.push({ messages: mensajes(e.tipo === "correccion" ? corregido : e.salida), parte });
      partes[parte] += 1;
    }
    if (e.valoracion === "positiva" || e.valoracion === "negativa") {
      kto.push({ messages: mensajes(e.salida), label: e.valoracion === "positiva", parte });
    }
    if (e.tipo === "correccion") {
      kto.push({ messages: mensajes(corregido), label: true, parte });
    }
  }

  return { sft, kto, partes, descartadas, info };
}
