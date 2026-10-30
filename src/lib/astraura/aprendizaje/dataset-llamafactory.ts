// Datasets de LlamaFactory (v0.9.5) desde valoraciones y correcciones de Astraura.
// Módulo PURO: sin red, sin `node:*` ni claves. Formato «sharegpt» (`messages`) y,
// para KTO, la columna booleana `label` declarada como `kto_tag`.
// SOP: architecture/repos-libreria-1025.md §2 y `experiencias-aprendizaje.ts`.

import type { Experiencia } from "../experiencias";
import type { AjustesAprendizaje } from "../experiencias-aprendizaje";

export type DestinoModelo = "privado" | "ambito" | "publico";
export type Parte = "train" | "val" | "test";
export interface Mensaje { role: "user" | "assistant"; content: string }
export interface FilaSft { id: string; parte: Parte; messages: Mensaje[] }
export interface FilaKto { id: string; parte: Parte; label: boolean; messages: Mensaje[] }
export interface OpcionesDataset { ambito: string; destino: DestinoModelo; nombre: string }
export interface DatasetLlamaFactory {
  sft: FilaSft[]; kto: FilaKto[]; partes: Record<Parte, number>;
  descartadas: Record<string, number>; info: Record<string, object>;
}

// Con pinta de clave: se revisa todo el texto de la experiencia antes de usarla.
const SECRETOS = [
  /sk-[A-Za-z0-9]{16,}/, /AIza[0-9A-Za-z_-]{20,}/, /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export function permitido(destino: DestinoModelo, ambito: string, ajustes: AjustesAprendizaje): { ok: boolean; motivo?: string } {
  if (destino === "privado") return { ok: true };
  const a = ajustes.porAmbito[ambito];
  if (!ajustes.aprendizajeColectivo) return { ok: false, motivo: "El aprendizaje colectivo está apagado." };
  if (!a || !a.permite) return { ok: false, motivo: "El ámbito no permite compartir lo aprendido." };
  if (a.privacidad === "privada") return { ok: false, motivo: "El ámbito es privado y lo privado no sale de las máquinas de la persona." };
  if (destino === "publico" && a.privacidad !== "publica") return { ok: false, motivo: "Solo un ámbito público puede alimentar un corpus público." };
  return { ok: true };
}

/** FNV-1a de 32 bits: el reparto es idéntico de escribir en TS y en Python. */
export function parteDe(id: string): Parte {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i) & 0xff;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  const tramo = (h >>> 0) % 10;
  return tramo < 8 ? "train" : tramo === 8 ? "val" : "test";
}

function contieneSecreto(texto: string): boolean {
  return SECRETOS.some((re) => re.test(texto));
}

function filaInfo(nombre: string, kto: boolean): object {
  return {
    file_name: `${nombre}.json`, formatting: "sharegpt",
    columns: kto ? { messages: "messages", kto_tag: "label" } : { messages: "messages" },
    tags: { role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" },
  };
}

export function paraLlamaFactory(exps: Experiencia[], ajustes: AjustesAprendizaje, op: OpcionesDataset): DatasetLlamaFactory {
  const partes: Record<Parte, number> = { train: 0, val: 0, test: 0 };
  const descartadas: Record<string, number> = {};
  const info: Record<string, object> = {
    [`${op.nombre}_sft`]: filaInfo(`${op.nombre}_sft`, false),
    [`${op.nombre}_kto`]: filaInfo(`${op.nombre}_kto`, true),
  };
  const candidatas = exps.filter((e) => (e.tipo === "valoracion" || e.tipo === "correccion") && (e.ambito ?? e.dominio) === op.ambito);
  if (!permitido(op.destino, op.ambito, ajustes).ok) {
    descartadas.bloqueado = candidatas.length;
    return { sft: [], kto: [], partes, descartadas, info };
  }
  const sft: FilaSft[] = [];
  const kto: FilaKto[] = [];
  const vistos = new Set<string>();
  const cuenta = (motivo: string) => { descartadas[motivo] = (descartadas[motivo] ?? 0) + 1; };

  for (const e of candidatas) {
    const entrada = e.entrada.trim();
    const salida = e.salida;
    if (!entrada) { cuenta("entrada_vacia"); continue; }
    if (typeof salida !== "string") { cuenta("salida_no_texto"); continue; }
    const respuesta = salida.trim();
    const correccion = typeof e.correccion === "string" ? e.correccion.trim() : "";
    const esCorreccion = e.tipo === "correccion";
    if (!respuesta || (esCorreccion && !correccion)) { cuenta("texto_vacio"); continue; }
    if ([entrada, salida, correccion].some(contieneSecreto)) { cuenta("secreto"); continue; }
    // Un duplicado exacto es la experiencia entera: se cuenta una sola vez.
    const firma = JSON.stringify([e.tipo, entrada, salida, e.valoracion ?? null, correccion]);
    if (vistos.has(firma)) { cuenta("duplicado"); continue; }
    vistos.add(firma);

    const parte = parteDe(e.id);
    const texto = esCorreccion ? correccion : respuesta;
    const claveSft = `sft\u0000${entrada}\u0000${texto}`;
    if (!vistos.has(claveSft)) {
      vistos.add(claveSft);
      sft.push({ id: e.id, parte, messages: [{ role: "user", content: entrada }, { role: "assistant", content: texto }] });
      partes[parte] += 1;
    }

    // KTO: el pulgar de la persona; una corrección añade además el texto bueno.
    const filas: { label: boolean; texto: string }[] = [];
    if (e.valoracion === "positiva") filas.push({ label: true, texto: respuesta });
    else if (e.valoracion === "negativa") filas.push({ label: false, texto: respuesta });
    if (esCorreccion) filas.push({ label: true, texto: correccion });
    for (const f of filas) {
      const clave = `kto\u0000${f.label}\u0000${entrada}\u0000${f.texto}`;
      if (vistos.has(clave)) { cuenta("duplicado"); continue; }
      vistos.add(clave);
      kto.push({ id: e.id, parte, label: f.label, messages: [{ role: "user", content: entrada }, { role: "assistant", content: f.texto }] });
    }
  }
  return { sft, kto, partes, descartadas, info };
}
