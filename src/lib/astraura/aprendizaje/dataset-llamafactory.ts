// Datasets de LlamaFactory (sharegpt) a partir de las experiencias de Astraura.
// Puro: sin red, sin node:*. La regla de privacidad manda: lo privado jamás sale.
import type { Experiencia } from "../experiencias";
import type { AjustesAprendizaje } from "../experiencias-aprendizaje";

export type DestinoModelo = "privado" | "ambito" | "publico";
export type Parte = "train" | "val" | "test";

export interface Mensaje { role: "user" | "assistant"; content: string }
export interface FilaSft { messages: Mensaje[]; parte: Parte }
export interface FilaKto { messages: Mensaje[]; label: boolean; parte: Parte }

export interface ResultadoDataset {
  sft: FilaSft[];
  kto: FilaKto[];
  partes: { train: number; val: number; test: number };
  descartadas: Record<string, number>;
  info: Record<string, object>;
}

const SECRETOS: RegExp[] = [
  /sk-[A-Za-z0-9]{16,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export function contieneSecreo(texto: string): boolean {
  return SECRETOS.some((r) => r.test(texto));
}

// ¿El corpus puede ir hacia ese destino? Regla dura de Astraura: lo privado, jamás.
export function permitido(destino: DestinoModelo, ambito: string, ajustes: AjustesAprendizaje): { ok: boolean; motivo?: string } {
  if (destino === "privado") return { ok: true }; // se queda en las máquinas de la persona
  const a = ajustes.porAmbito[ambito];
  if (!a) return { ok: false, motivo: "ámbito sin consentimiento" };
  if (!ajustes.aprendizajeColectivo) return { ok: false, motivo: "sin aprendizaje colectivo" };
  if (!a.permite) return { ok: false, motivo: "sin permiso del ámbito" };
  if (a.privacidad === "privada") return { ok: false, motivo: "ámbito privado" };
  if (destino === "ambito") return { ok: true };
  if (a.privacidad !== "publica") return { ok: false, motivo: "ámbito no público" };
  return { ok: true };
}

// Hash FNV-1a para el reparto determinista 80/10/10.
function hashFnv1a(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

// La misma experiencia cae siempre en la misma parte: train 80 %, val 10 %, test 10 %.
function parteDe(id: string): Parte {
  const r = hashFnv1a(id) % 100;
  if (r < 80) return "train";
  if (r < 90) return "val";
  return "test";
}

export function paraLlamaFactory(
  exps: Experiencia[],
  ajustes: AjustesAprendizaje,
  op: { ambito: string; destino: DestinoModelo; nombre: string },
): ResultadoDataset {
  const vacio = { sft: [] as FilaSft[], kto: [] as FilaKto[], partes: { train: 0, val: 0, test: 0 }, info: {} as Record<string, object> };
  const nAmbito = exps.filter((e) => (e.ambito ?? e.dominio) === op.ambito && (e.tipo === "valoracion" || e.tipo === "correccion")).length;
  if (!permitido(op.destino, op.ambito, ajustes).ok) {
    return { ...vacio, descartadas: { bloqueado: nAmbito } };
  }
  const sft: FilaSft[] = [];
  const kto: FilaKto[] = [];
  const descartadas: Record<string, number> = {};
  const munch = (motivo: string) => (descartadas[motivo] = (descartadas[motivo] ?? 0) + 1);
  const vistas = new Set<string>();
  const partes: Record<Parte, number> = { train: 0, val: 0, test: 0 };
  const dialogo = (usuario: string, asistente: string): Mensaje[] => [
    { role: "user", content: usuario },
    { role: "assistant", content: asistente },
  ];
  for (const e of exps) {
    if (e.tipo !== "valoracion" && e.tipo !== "correccion") continue;
    if ((e.ambito ?? e.dominio) !== op.ambito) continue;
    const corregida = e.tipo === "correccion" && e.correccion?.trim() ? e.correccion.trim() : null;
    if (!e.entrada.trim()) { munch("entrada_vacia"); continue; }
    if (typeof e.salida !== "string" || !e.salida.trim()) { munch("salida_invalida"); continue; }
    if (contieneSecreo(e.entrada) || contieneSecreo(e.salida) || (corregida && contieneSecreo(corregida))) {
      munch("secreto");
      continue;
    }
    if (vistas.has(`${e.entrada}|${e.salida}`)) { munch("duplicado"); continue; }
    vistas.add(`${e.entrada}|${e.salida}`);
    const parte = parteDe(e.id);
    // SFT: valoración positiva con la respuesta original, corrección con la corregida.
    if (e.tipo === "valoracion" && e.valoracion === "positiva") {
      sft.push({ messages: dialogo(e.entrada, e.salida), parte });
    } else if (e.tipo === "correccion" && corregida) {
      sft.push({ messages: dialogo(e.entrada, corregida), parte });
    }
    // KTO: la valoración enseña qué respuesta fue bien o mal; la corrección añade la buena.
    if (e.tipo === "valoracion") {
      kto.push({ messages: dialogo(e.entrada, e.salida), label: e.valoracion === "positiva", parte });
    } else if (corregida) {
      kto.push({ messages: dialogo(e.entrada, e.salida), label: false, parte });
      kto.push({ messages: dialogo(e.entrada, corregida), label: true, parte });
    }
  }
  for (const f of sft) partes[f.parte] += 1;
  const tags = { role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" };
  const info: Record<string, object> = {
    [`${op.nombre}_sft`]: { file_name: `${op.nombre}_sft.json`, formatting: "sharegpt", columns: { messages: "messages" }, tags },
    [`${op.nombre}_kto`]: { file_name: `${op.nombre}_kto.json`, formatting: "sharegpt", columns: { messages: "messages", kto_tag: "label" }, tags },
  };
  return { sft, kto, partes, descartadas, info };
}
