// Datasets SFT y KTO para LlamaFactory (hiyouga/LlamaFactory, Apache-2.0) a
// partir de valoraciones y correcciones de Astraura, por ámbito. Módulo puro:
// sin red y sin `node:*`; sharegpt (`messages`) y en KTO `label` como `kto_tag`.
import type { Experiencia } from "../experiencias";
import type { AjustesAprendizaje } from "../experiencias-aprendizaje";

export type DestinoModelo = "privado" | "ambito" | "publico";
export type Parte = "train" | "val" | "test";

/** Par persona–IA en formato sharegpt (`role` y `content`). */
export interface Mensaje { role: "user" | "assistant"; content: string }
export interface FilaSft { messages: Mensaje[]; parte: Parte }
export interface FilaKto { messages: Mensaje[]; label: boolean; parte: Parte }

export interface ResultadoLlamaFactory {
  sft: FilaSft[];
  kto: FilaKto[];
  partes: Record<Parte, number>;
  descartadas: Record<string, number>;
  info: Record<string, object>;
}

export interface OpcionesDataset { ambito: string; destino: DestinoModelo; nombre: string }

// Un texto con pinta de secreto (clave de API, Bearer, clave privada) no entra jamás en un corpus.
const SECRETOS: RegExp[] = [
  /sk-[A-Za-z0-9]{16,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export function contieneSecreto(texto: string): boolean { return SECRETOS.some((p) => p.test(texto)); }

/** Regla de privacidad por destino: lo privado jamás sale del dispositivo. */
export function permitido(
  destino: DestinoModelo,
  ambito: string,
  ajustes: AjustesAprendizaje,
): { ok: boolean; motivo?: string } {
  if (destino === "privado") return { ok: true }; // corpus en máquinas de la persona
  if (!ajustes.aprendizajeColectivo) return { ok: false, motivo: "sin aprendizaje colectivo" };
  const a = ajustes.porAmbito[ambito]; if (!a || !a.permite) return { ok: false, motivo: "ambito no permite compartir" };
  if (a.privacidad === "privada") return { ok: false, motivo: "privacidad privada" };
  if (destino === "publico" && a.privacidad !== "publica") return { ok: false, motivo: "privacidad no publica" };
  return { ok: true };
}

/** Reparto 80/10/10 estable: hash FNV-1a de 32 bits del id de la experiencia. */
function parteDe(id: string): Parte {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i); h = (h * 16777619) >>> 0;
  }
  return h % 100 < 80 ? "train" : h % 100 < 90 ? "val" : "test";
}

/** Valida una experiencia utilizable; «motivo» es la clave de descarte. */
function validar(e: Experiencia, esCorreccion: boolean):
  { ok: true; entrada: string; salida: string; corregido: string | null } | { ok: false; motivo: string } {
  const entrada = e.entrada.trim();
  const salida = typeof e.salida === "string" ? e.salida : null;
  const corregido = esCorreccion && e.correccion ? e.correccion : null;
  if (!entrada) return { ok: false, motivo: "entrada-vacia" };
  if (!salida || !salida.trim()) return { ok: false, motivo: salida === null ? "salida-no-string" : "texto-vacio" };
  if (esCorreccion && (!corregido || !corregido.trim())) return { ok: false, motivo: "texto-vacio" };
  return { ok: true, entrada, salida, corregido };
}

// Valoraciones y correcciones de un ámbito → datasets SFT y KTO; `permitido` falla ⇒ todo vacío.
export function paraLlamaFactory(
  exps: Experiencia[],
  ajustes: AjustesAprendizaje,
  op: OpcionesDataset,
): ResultadoLlamaFactory {
  if (!permitido(op.destino, op.ambito, ajustes).ok) {
    return { sft: [], kto: [], partes: { train: 0, val: 0, test: 0 }, descartadas: { bloqueado: exps.length }, info: {} };
  }
  const descartadas: Record<string, number> = {};
  const contar = (motivo: string): void => { descartadas[motivo] = (descartadas[motivo] ?? 0) + 1; };
  const vistos = new Set<string>();
  const sft: FilaSft[] = []; const kto: FilaKto[] = [];
  const partes: Record<Parte, number> = { train: 0, val: 0, test: 0 };
  for (const e of exps) {
    if (e.tipo !== "valoracion" && e.tipo !== "correccion") { contar("tipo-no-aprendible"); continue; }
    if ((e.ambito ?? e.dominio) !== op.ambito) { contar("otro-ambito"); continue; }
    const esCorreccion = e.tipo === "correccion";
    if (!esCorreccion && !e.valoracion) { contar("sin-valoracion"); continue; }
    const v = validar(e, esCorreccion);
    if (!v.ok) { contar(v.motivo); continue; }
    if (contieneSecreto(v.entrada) || contieneSecreto(v.salida) || contieneSecreto(v.corregido || "")) {
      contar("secreto");
      continue;
    }
    const clave = `${v.entrada}\u0000${v.salida}\u0000${v.corregido ?? ""}`;
    if (vistos.has(clave)) { contar("duplicado"); continue; }
    vistos.add(clave);
    const parte = parteDe(e.id);
    const persona: Mensaje = { role: "user", content: v.entrada };
    if (v.corregido) {
      const corregida: Mensaje = { role: "assistant", content: v.corregido };
      sft.push({ messages: [persona, corregida], parte });
      partes[parte] += 1;
      kto.push({ messages: [persona, { role: "assistant", content: v.salida }], label: false, parte });
      kto.push({ messages: [persona, corregida], label: true, parte });
    } else {
      if (e.valoracion === "positiva") {
        sft.push({ messages: [persona, { role: "assistant", content: v.salida }], parte });
        partes[parte] += 1;
      }
      kto.push({ messages: [persona, { role: "assistant", content: v.salida }], label: e.valoracion === "positiva", parte });
    }
  }
  const etiqueta = { role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" };
  const info: Record<string, object> = {
    [`${op.nombre}_sft`]: { file_name: `${op.nombre}_sft.json`, formatting: "sharegpt", columns: { messages: "messages" }, tags: etiqueta },
    [`${op.nombre}_kto`]: { file_name: `${op.nombre}_kto.json`, formatting: "sharegpt", columns: { messages: "messages", kto_tag: "label" }, tags: etiqueta },
  };
  return { sft, kto, partes, descartadas, info };
}
