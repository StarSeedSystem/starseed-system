// Datasets de LlamaFactory (SFT y KTO) desde las valoraciones y correcciones
// de Astraura, por ámbito y con la regla dura de privacidad: lo privado no sale.
import type { Experiencia } from "../experiencias";
import type { AjustesAprendizaje } from "../experiencias-aprendizaje";

export type DestinoModelo = "privado" | "ambito" | "publico";
export type Parte = "train" | "val" | "test";

export interface MensajeLlama { role: "user" | "assistant"; content: string }
export interface FilaSft { id: string; parte: Parte; messages: MensajeLlama[] }
export interface FilaKto extends FilaSft { label: boolean }
export interface DatasetLlamaFactory {
  sft: FilaSft[];
  kto: FilaKto[];
  partes: Record<Parte, number>;
  descartadas: Record<string, number>;
  info: Record<string, object>;
}
export type OpDataset = { ambito: string; destino: DestinoModelo; nombre: string };

// Firmas de secreto que nunca deben acabar en un dataset de entrenamiento.
const SECRETO = /sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;

export function permitido(destino: DestinoModelo, ambito: string, ajustes: AjustesAprendizaje): { ok: boolean; motivo?: string } {
  if (destino === "privado") return { ok: true };
  if (!ajustes.aprendizajeColectivo) return { ok: false, motivo: "aprendizaje-colectivo-apagado" };
  const a = ajustes.porAmbito[ambito];
  if (!a || !a.permite) return { ok: false, motivo: "ambito-no-permite" };
  if (a.privacidad === "privada") return { ok: false, motivo: "ambito-privado" };
  if (destino === "publico" && a.privacidad !== "publica") return { ok: false, motivo: "ambito-no-publico" };
  return { ok: true };
}

// FNV-1a de 32 bits: reparto 80/10/10 estable para cada id de experiencia.
export function parteDe(id: string): Parte {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  const cubo = h % 100;
  return cubo < 80 ? "train" : cubo < 90 ? "val" : "test";
}

function entradasInfo(nombre: string): Record<string, object> {
  const tags = { role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" };
  const base = { formatting: "sharegpt", tags };
  return {
    [`${nombre}_sft`]: { ...base, file_name: `${nombre}_sft.json`, columns: { messages: "messages" } },
    [`${nombre}_kto`]: {
      ...base,
      file_name: `${nombre}_kto.json`,
      columns: { messages: "messages", kto_tag: "label" },
    },
  };
}

export function paraLlamaFactory(exps: Experiencia[], ajustes: AjustesAprendizaje, op: OpDataset): DatasetLlamaFactory {
  const candidatas = exps.filter(
    (e) => (e.tipo === "valoracion" || e.tipo === "correccion") && (e.ambito ?? e.dominio) === op.ambito,
  );
  if (!permitido(op.destino, op.ambito, ajustes).ok) {
    const vacio: DatasetLlamaFactory = {
      sft: [],
      kto: [],
      partes: { train: 0, val: 0, test: 0 },
      descartadas: { bloqueado: candidatas.length },
      info: {},
    };
    return vacio;
  }
  const sft: FilaSft[] = [];
  const kto: FilaKto[] = [];
  const descartadas: Record<string, number> = {};
  const vistosSft = new Set<string>();
  const vistosKto = new Set<string>();
  const descartar = (motivo: string): void => {
    descartadas[motivo] = (descartadas[motivo] ?? 0) + 1;
  };
  for (const e of candidatas) {
    const entrada = typeof e.entrada === "string" ? e.entrada.trim() : "";
    const corregido = typeof e.correccion === "string" ? e.correccion.trim() : "";
    if (!entrada) { descartar("entrada-vacia"); continue; }
    if (typeof e.salida !== "string") { descartar("salida-no-texto"); continue; }
    const original = e.salida.trim();
    if (!original || (e.tipo === "correccion" && !corregido)) { descartar("texto-vacio"); continue; }
    if (SECRETO.test(entrada) || SECRETO.test(original) || SECRETO.test(corregido)) { descartar("secreto"); continue; }
    const parte = parteDe(e.id);
    const emitir = (texto: string, etiqueta: boolean | null): void => {
      const clave = `${entrada}\u0000${texto}`;
      const vistos = etiqueta === null ? vistosSft : vistosKto;
      if (vistos.has(clave)) { descartar("duplicado"); return; }
      vistos.add(clave);
      const messages: MensajeLlama[] = [
        { role: "user", content: entrada },
        { role: "assistant", content: texto },
      ];
      if (etiqueta === null) sft.push({ id: e.id, parte, messages });
      else kto.push({ id: e.id, parte, messages, label: etiqueta });
    };
    if (e.tipo === "correccion") emitir(corregido, null);
    else if (e.valoracion === "positiva") emitir(original, null);
    if (e.valoracion === "positiva") emitir(original, true);
    else if (e.valoracion === "negativa") emitir(original, false);
    if (e.tipo === "correccion") emitir(corregido, true);
  }
  const partes: Record<Parte, number> = { train: 0, val: 0, test: 0 };
  for (const fila of sft) partes[fila.parte] += 1;
  return { sft, kto, partes, descartadas, info: entradasInfo(op.nombre) };
}
