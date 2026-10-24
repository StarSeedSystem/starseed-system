/**
 * sync-fondos — sincronía de sets de fondos con las neuronas (Ola 1018F · FSH1018P ·
 * architecture/fondos-shaders.md §3). El set va a TODAS las neuronas del perfil o SOLO a las
 * elegidas. Los recursos pesados (data: de imagen o vídeo) NUNCA viajan incrustados: se extraen
 * del JSON y van como archivos por `archivos-malla`, dejando en su lugar una referencia
 * (`local-archivos-malla://…`, la que `sets-fondo.urlAdmitida` ya admite en privado). Un set que
 * usa la cámara (`WebcamTexture` / `ObjectTracker`) se queda en la neurona donde se dio el
 * permiso: aquí se calcula que NO viaja (ni a la malla ni a la nube de la cuenta). Y lo que
 * sube a la nube pasa SIEMPRE por `sanitizeForCloud`. PURO: sin red, disco, GPU ni procesos;
 * la malla y Supabase son asunto de quien llama.
 */
import { sanitizeForCloud } from "@/lib/settings-sync";
import type { SetFondo } from "./sets-fondo";

/** Clave de cuenta bajo la que iría el paquete de fondos (solo el nombre; valores, jamás). */
export const CLAVE_FONDOS_CUENTA = "starseed.appearance.fondos.v1";
/** Tope por recurso pesado: lo que exceda se rechaza, nunca se envía a medias ni se pierde. */
export const MAX_RECURSO_BYTES = 2 * 1024 * 1024; // = MAX_SET_BYTES de sets-fondo
const CAMARA = ["WebcamTexture", "ObjectTracker"];
const DATA_MEDIA = /^data:(image|video)\/[a-z0-9.+-]+[;,]/i;

export type AlcanceNeuronas = "todas" | "elegidas";

export interface RecursoPorReferencia {
  /** Lo que queda en el JSON donde iba el data:. */
  ref: string;
  /** El data: completo (image/* o video/*), para entregarlo a archivos-malla. */
  dataUrl: string;
  tipo: "imagen" | "video";
  bytes: number;
}

export type ResultadoDestinos =
  | { ok: true; camara: boolean; nube: boolean; neuronas: string[]; recursos: RecursoPorReferencia[]; json: string }
  | { ok: false; motivo: string };

export interface EntradaDestinos {
  set: SetFondo;
  alcance: AlcanceNeuronas;
  /** Las neuronas del perfil (un medio = un aparato: los ids los da quien llama). */
  neuronasPerfil: readonly string[];
  /** Con alcance «elegidas»: las neuronas marcadas; un id ajeno al perfil no se inventa. */
  elegidas?: readonly string[];
}

function camaraEnComponentes(lista: unknown): boolean {
  if (!Array.isArray(lista)) return false;
  for (const c of lista) {
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    const tipo = (c as { type?: unknown }).type;
    if (typeof tipo === "string" && CAMARA.includes(tipo)) return true;
    if (camaraEnComponentes((c as { children?: unknown }).children)) return true;
  }
  return false;
}

export function camaraEnSet(set: SetFondo): boolean {
  // Solo las capas shader llevan componentes (anidadas en `children`): se mira por dentro.
  return set.capas.some((c) => c.kind === "shader" && camaraEnComponentes(c.preset?.components));
}

export function recursosPorReferencia(set: SetFondo): { ok: true; json: string; recursos: RecursoPorReferencia[] } | { ok: false; motivo: string } {
  const recursos: RecursoPorReferencia[] = [];
  const capas: SetFondo["capas"] = [];
  for (const capa of set.capas) {
    if (!((capa.kind === "imagen" || capa.kind === "video") && DATA_MEDIA.test(capa.value ?? ""))) {
      capas.push(capa); // por URL de la Biblioteca o capa sin medios: tal cual
      continue;
    }
    const dataUrl = capa.value as string;
    const peso = new TextEncoder().encode(dataUrl).length;
    if (peso > MAX_RECURSO_BYTES) return { ok: false, motivo: `recurso ${capa.kind}: pesa más de 2 MB` };
    const ref = `local-archivos-malla://f${recursos.length}`;
    recursos.push({ ref, dataUrl, tipo: capa.kind as "imagen" | "video", bytes: peso });
    capas.push({ ...capa, value: ref });
  }
  return { ok: true, json: JSON.stringify({ ...set, capas }), recursos };
}

export function destinosDeSet(e: EntradaDestinos): ResultadoDestinos {
  const camara = camaraEnSet(e.set);
  const perfil = [...new Set(e.neuronasPerfil)]; // sin repetidos; el orden es el de quien llama
  const elegidas = new Set(e.elegidas ?? []);
  if (e.alcance === "elegidas" && elegidas.size === 0) return { ok: false, motivo: "sin neuronas elegidas" };
  if (camara)
    return { ok: true, camara: true, nube: false, neuronas: [], recursos: [],
      json: JSON.stringify(e.set) }; // ya vive en la neurona del permiso: no se mueve de ahí
  const neuronas = e.alcance === "todas" ? perfil : perfil.filter((n) => elegidas.has(n));
  const paquete = recursosPorReferencia(e.set);
  if (!paquete.ok) return paquete;
  // La nube es de TODA la cuenta (y de ahí bajaría a las neuronas de siempre): con «elegidas»
  // el reparto sale solo por la malla, para no hacer llegar el set a la cuenta entera por error.
  return { ok: true, camara: false, nube: e.alcance === "todas", neuronas, recursos: paquete.recursos, json: paquete.json };
}

export function paqueteParaNube(json: string, recursos: RecursoPorReferencia[]): unknown {
  return sanitizeForCloud(CLAVE_FONDOS_CUENTA, { set: json, recursos });
}
