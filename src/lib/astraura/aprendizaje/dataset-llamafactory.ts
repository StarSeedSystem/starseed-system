// Conversión de valoraciones/correcciones de Astraura a datasets LlamaFactory.
// Módulo PURO: sin red, sin node:*, sin I/O.
import type { Experiencia } from "../experiencias";
import type { AjustesAprendizaje, PrivacidadAmbito } from "../experiencias-aprendizaje";

export type DestinoModelo = "privado" | "ambito" | "publico";

export interface FilaSft {
  messages: { role: "user" | "assistant"; content: string }[];
  parte: "train" | "val" | "test";
}

export interface FilaKto {
  messages: { role: "user" | "assistant"; content: string }[];
  label: boolean;
  parte: "train" | "val" | "test";
}

const SECRETOS = [
  /sk-[A-Za-z0-9]{16,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

function tieneSecreto(s: string): boolean {
  return SECRETOS.some((r) => r.test(s));
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x1000193);
  }
  return h >>> 0;
}

function partePorId(id: string): "train" | "val" | "test" {
  const r = fnv1a(id) % 100;
  if (r < 80) return "train";
  if (r < 90) return "val";
  return "test";
}

export function permitido(destino: DestinoModelo, ambito: string, ajustes: AjustesAprendizaje): { ok: boolean; motivo?: string } {
  if (destino === "privado") return { ok: true };
  const a = ajustes.porAmbito[ambito];
  if (!ajustes.aprendizajeColectivo || !a?.permite) return { ok: false, motivo: "bloqueado" };
  if (destino === "ambito") {
    if (a.privacidad === "privada") return { ok: false, motivo: "bloqueado" };
    return { ok: true };
  }
  if (destino === "publico") {
    if (a.privacidad !== "publica") return { ok: false, motivo: "bloqueado" };
    return { ok: true };
  }
  return { ok: false, motivo: "bloqueado" };
}

function claveAmbito(e: Experiencia): string {
  return e.ambito ?? e.dominio ?? "";
}

function esTextoValido(s: unknown): s is string {
  return typeof s === "string" && s.length > 0;
}

export function paraLlamaFactory(
  exps: Experiencia[],
  ajustes: AjustesAprendizaje,
  op: { ambito: string; destino: DestinoModelo; nombre: string },
): {
  sft: FilaSft[];
  kto: FilaKto[];
  partes: { train: number; val: number; test: number };
  descartadas: Record<string, number>;
  info: Record<string, object>;
} {
  const descartadas: Record<string, number> = {};
  const inc = (k: string) => {
    descartadas[k] = (descartadas[k] ?? 0) + 1;
  };
  const p = permitido(op.destino, op.ambito, ajustes);
  if (!p.ok) {
    return {
      sft: [],
      kto: [],
      partes: { train: 0, val: 0, test: 0 },
      descartadas: { bloqueado: exps.length || 1 },
      info: {
        [`${op.nombre}_sft`]: {
          file_name: `${op.nombre}_sft.json`,
          formatting: "sharegpt",
          columns: { messages: "messages" },
          tags: { role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" },
        },
        [`${op.nombre}_kto`]: {
          file_name: `${op.nombre}_kto.json`,
          formatting: "sharegpt",
          columns: { messages: "messages", kto_tag: "label" },
          tags: { role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" },
        },
      },
    };
  }

  const sft: FilaSft[] = [];
  const kto: FilaKto[] = [];
  const vistos = new Set<string>();
  const partes = { train: 0, val: 0, test: 0 };

  for (const e of exps) {
    if (e.tipo !== "valoracion" && e.tipo !== "correccion") continue;
    const amb = claveAmbito(e);
    if (amb !== op.ambito) continue;
    if (!esTextoValido(e.entrada)) { inc("entrada o texto vacíos"); continue; }
    if (tieneSecreto(e.entrada)) { inc("secreto"); continue; }

    if (e.tipo === "valoracion") {
      if (!esTextoValido(e.salida)) { inc("salida que no es string"); continue; }
      if (tieneSecreto(e.salida)) { inc("secreto"); continue; }
      const key = `v|${e.entrada}|${e.salida}`;
      if (vistos.has(key)) { inc("duplicados exactos"); continue; }
      vistos.add(key);
      const parte = partePorId(e.id);
      partes[parte] += 1;
      if (e.valoracion === "positiva") {
        sft.push({ messages: [{ role: "user", content: e.entrada }, { role: "assistant", content: e.salida }], parte });
        kto.push({ messages: [{ role: "user", content: e.entrada }, { role: "assistant", content: e.salida }], label: true, parte });
      } else if (e.valoracion === "negativa") {
        kto.push({ messages: [{ role: "user", content: e.entrada }, { role: "assistant", content: e.salida }], label: false, parte });
      }
      continue;
    }

    if (e.tipo === "correccion") {
      if (!esTextoValido(e.correccion)) { inc("entrada o texto vacíos"); continue; }
      if (tieneSecreto(e.correccion)) { inc("secreto"); continue; }
      if (!esTextoValido(e.salida)) { inc("salida que no es string"); continue; }
      if (tieneSecreto(e.salida)) { inc("secreto"); continue; }
      const k1 = `c|${e.entrada}|${e.salida}`;
      const k2 = `c|${e.entrada}|${e.correccion}`;
      if (vistos.has(k1)) { inc("duplicados exactos"); continue; }
      if (vistos.has(k2)) { inc("duplicados exactos"); continue; }
      vistos.add(k1); vistos.add(k2);
      const parte = partePorId(e.id);
      partes[parte] += 1;
      sft.push({ messages: [{ role: "user", content: e.entrada }, { role: "assistant", content: e.correccion }], parte });
      kto.push({ messages: [{ role: "user", content: e.entrada }, { role: "assistant", content: e.salida }], label: false, parte });
      kto.push({ messages: [{ role: "user", content: e.entrada }, { role: "assistant", content: e.correccion }], label: true, parte });
    }
  }

  return {
    sft,
    kto,
    partes,
    descartadas,
    info: {
      [`${op.nombre}_sft`]: {
        file_name: `${op.nombre}_sft.json`,
        formatting: "sharegpt",
        columns: { messages: "messages" },
        tags: { role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" },
      },
      [`${op.nombre}_kto`]: {
        file_name: `${op.nombre}_kto.json`,
        formatting: "sharegpt",
        columns: { messages: "messages", kto_tag: "label" },
        tags: { role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" },
      },
    },
  };
}
