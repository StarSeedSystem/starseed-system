// Datasets LlamaFactory (hiyouga/LlamaFactory, v0.9.5) desde experiencias de Astraura:
// formato «sharegpt» con columna `messages` y, para KTO, `label` declarada como `kto_tag`.
// PURO: sin red ni node:*. Regla dura de Astraura: lo privado jamás sale del dispositivo.
import type { Experiencia } from "../experiencias";
import type { AjustesAprendizaje } from "../experiencias-aprendizaje";

export type DestinoModelo = "privado" | "ambito" | "publico";
export type Parte = "train" | "val" | "test";
export interface Mensaje {
  role: "user" | "assistant";
  content: string;
}
export interface FilaSft { parte: Parte; messages: Mensaje[]; }
export interface FilaKto { parte: Parte; messages: Mensaje[]; label: boolean; }
export interface InfoDatasetLlamaFactory {
  sft: FilaSft[];
  kto: FilaKto[];
  partes: Record<Parte, number>;
  descartadas: Record<string, number>;
  info: Record<string, object>;
}

const SECRETOS: RegExp[] = [
  /sk-[A-Za-z0-9]{16,}/, /AIza[0-9A-Za-z_-]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

// Alguna pinta de secreto: claves (sk-…, AIza…), tokens de Bearer, llaves privadas.
function conSecreto(textos: string[]): boolean {
  return textos.some((t) => SECRETOS.some((r) => r.test(t)));
}

// ¿El destino puede recibir el corpus del ámbito? «privado» siempre ok (se queda
// en las máquinas de la persona); «ambito» exige aprendizaje colectivo, permiso
// del ámbito y no privacidad «privada»; «publico» exige además «publica».
export function permitido(destino: DestinoModelo, ambito: string, ajustes: AjustesAprendizaje): { ok: boolean; motivo?: string } {
  if (destino === "privado") return { ok: true };
  if (!ajustes.aprendizajeColectivo) return { ok: false, motivo: "el aprendizaje colectivo está apagado" };
  const a = ajustes.porAmbito[ambito];
  if (!a || !a.permite) return { ok: false, motivo: `el ámbito «${ambito}» no permite compartir` };
  if (a.privacidad === "privada") return { ok: false, motivo: `el ámbito «${ambito}» es privado` };
  if (destino === "publico" && a.privacidad !== "publica") return { ok: false, motivo: "no es público" };
  return { ok: true };
}

// Reparto 80/10/10 determinista por el hash FNV-1a del id de la experiencia.
function parteDe(id: string): Parte {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const m = h % 10;
  return m < 8 ? "train" : m === 8 ? "val" : "test";
}

// Entrada de `data/dataset_info.json` de LlamaFactory para cada dataset.
function entradaInfo(nombre: string, conKto: boolean): object {
  return {
    file_name: `${nombre}.json`,
    formatting: "sharegpt",
    columns: conKto ? { messages: "messages", kto_tag: "label" } : { messages: "messages" },
    tags: { role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" },
  };
}

export function paraLlamaFactory(
  exps: Experiencia[],
  ajustes: AjustesAprendizaje,
  op: { ambito: string; destino: DestinoModelo; nombre: string },
): InfoDatasetLlamaFactory {
  const partes: Record<Parte, number> = { train: 0, val: 0, test: 0 };
  if (!permitido(op.destino, op.ambito, ajustes).ok) {
    return { sft: [], kto: [], partes, descartadas: { bloqueado: exps.length }, info: {} };
  }
  const descartadas: Record<string, number> = {};
  const d = (motivo: string): void => {
    descartadas[motivo] = (descartadas[motivo] ?? 0) + 1;
  };
  const vistos = new Set<string>();
  const sft: FilaSft[] = [];
  const kto: FilaKto[] = [];
  for (const e of exps) {
    // Solo feedback humano (valoración o corrección) del ámbito pedido.
    if ((e.tipo !== "valoracion" && e.tipo !== "correccion") || (e.ambito ?? e.dominio) !== op.ambito) continue;
    const salida = e.salida;
    if (typeof salida !== "string") { d("salida no string"); continue; }
    const corregido = e.tipo === "correccion" ? e.correccion ?? "" : "";
    if (!e.entrada.trim() || !salida.trim() || (e.tipo === "correccion" && !corregido.trim())) {
      d("texto vacío");
    } else if (conSecreto([e.entrada, salida, corregido])) {
      d("secreto");
    } else if (vistos.has(`${e.entrada}\u0000${salida}\u0000${e.tipo}`)) {
      d("duplicado");
    } else {
      const clave = `${e.entrada}\u0000${salida}\u0000${e.tipo}`;
      vistos.add(clave);
      const parte = parteDe(e.id);
      const pregunta: Mensaje = { role: "user", content: e.entrada };
      if (e.tipo === "correccion") {
        sft.push({ parte, messages: [pregunta, { role: "assistant", content: corregido }] });
        partes[parte] += 1;
        kto.push({ parte, messages: [pregunta, { role: "assistant", content: salida }], label: false });
        kto.push({ parte, messages: [pregunta, { role: "assistant", content: corregido }], label: true });
      } else if (e.valoracion === "positiva") {
        sft.push({ parte, messages: [pregunta, { role: "assistant", content: salida }] });
        partes[parte] += 1;
        kto.push({ parte, messages: [pregunta, { role: "assistant", content: salida }], label: true });
      } else {
        kto.push({ parte, messages: [pregunta, { role: "assistant", content: salida }], label: false });
      }
    }
  }
  return { sft, kto, partes, descartadas, info: { [`${op.nombre}_sft`]: entradaInfo(`${op.nombre}_sft`, false), [`${op.nombre}_kto`]: entradaInfo(`${op.nombre}_kto`, true) } };
}
