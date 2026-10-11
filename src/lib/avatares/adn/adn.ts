/**
 * Avatares 3D autopersonalizables · ADN DEL AVATAR (AV1011). Contrato: architecture/astraura-avatares-3d.md §2.
 *
 * Un MISMO ADN viste a la orbe de un bot, al avatar 3D de una persona y al de un grupo o una página.
 * El ADN es DATOS pequeños (≤ 8 KB en JSON): la malla pesada vive en la Biblioteca y aquí solo va su
 * referencia («biblioteca:…» o «genesis:…»; nunca una URL externa suelta). La procedencia de cada pieza
 * generada viaja con el ADN para saber qué licencia obliga a qué (atribución, región, uso comercial).
 * PURO: sin reloj, red ni aleatorio.
 */

export const VERSION_ADN = 1;
export const TAMANO_MAX_ADN = 8 * 1024;

export const BASES = ["orbe", "vrm", "glb-rig", "procedural"] as const;
export const ESQUELETOS = ["ninguno", "vrm-humanoide", "soma30", "smplx22", "libre"] as const;
export const DUENOS_AVATAR = ["perfil", "bot", "grupo", "comunidad", "pagina"] as const;
export const VISIBILIDADES = ["privado", "grupo", "publico"] as const;
export const SLOTS_MATERIAL = ["piel", "cabello", "ojos", "ropa-1", "ropa-2", "acento", "aura"] as const;
/** 0 … 1 con 0,5 = neutro. «estilizado» va de realista (0) a caricatura (1). */
export const MORFOLOGIA = ["altura", "complexion", "cabeza", "hombros", "cintura", "piernas", "brazos", "estilizado"] as const;
/** Expresiones predefinidas de VRM 1.0 (emociones, visemas, parpadeo y mirada). */
export const EXPRESIONES = [
  "neutral", "happy", "angry", "sad", "relaxed", "surprised", "aa", "ih", "ou", "ee", "oh",
  "blink", "blinkLeft", "blinkRight", "lookUp", "lookDown", "lookLeft", "lookRight",
] as const;
export const SLOTS_PIEZA = [
  "cabeza", "cabello", "torso", "piernas", "cara", "pies", "manos", "accesorio-1", "espalda", "accesorio-2", "mascota",
] as const;
/** Cómo obliga la licencia de lo que generó una pieza. */
export const USOS_LICENCIA = ["libre", "atribucion", "condicionado", "no-comercial", "restringido-region"] as const;

export type BaseAvatar = (typeof BASES)[number];
export type Esqueleto = (typeof ESQUELETOS)[number];
export type DuenoAvatar = (typeof DUENOS_AVATAR)[number];
export type Visibilidad = (typeof VISIBILIDADES)[number];
export type SlotMaterial = (typeof SLOTS_MATERIAL)[number];
export type Morfologia = (typeof MORFOLOGIA)[number];
export type Expresion = (typeof EXPRESIONES)[number];
export type SlotPieza = (typeof SLOTS_PIEZA)[number];
export type UsoLicencia = (typeof USOS_LICENCIA)[number];

export interface Material { color: string; metal: number; rugosidad: number; emisivo: number }
export interface Pieza { slot: SlotPieza; ref: string; tinte?: string }
/** Carácter del movimiento (0 … 1); el motor de movimiento único lo respeta en todos sus niveles. */
export interface EstiloMovimiento { energia: number; amplitud: number; ritmo: number; postura: number }
export interface Procedencia {
  herramienta: string;
  licencia: string;
  uso: UsoLicencia;
  atribucion?: string;
  /** Regiones (ISO o «EU») donde la licencia NO permite usarlo. */
  regionesExcluidas?: string[];
}

export interface AdnAvatar {
  v: typeof VERSION_ADN;
  id: string;
  nombre: string;
  dueno: { tipo: DuenoAvatar; id: string };
  base: { tipo: BaseAvatar; ref?: string };
  esqueleto: { tipo: Esqueleto; articulaciones: number };
  morfologia: Partial<Record<Morfologia, number>>;
  materiales: Partial<Record<SlotMaterial, Material>>;
  piezas: Pieza[];
  expresionBase: Partial<Record<Expresion, number>>;
  aura: { tono: number; intensidad: number; ligadaEmocion: boolean };
  movimiento: EstiloMovimiento;
  visibilidad: Visibilidad;
  procedencia: Procedencia[];
  /** Revisión: sube con cada cambio aplicado (sincronía en vivo: gana la más alta). */
  rev: number;
}

/** Articulaciones fijas de cada esqueleto (`libre` = cualquier topología: 1 … 256). */
export const ARTICULACIONES: Record<Esqueleto, number> = { ninguno: 0, "vrm-humanoide": 55, soma30: 30, smplx22: 22, libre: 0 };

const incluye = <T extends string>(lista: readonly T[], v: unknown): v is T => typeof v === "string" && (lista as readonly string[]).includes(v);
export const acotar01 = (v: unknown, def = 0.5): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : def);
export const esColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
/** Solo referencias internas: nada de URLs externas sueltas dentro de un avatar. */
export const esRefInterna = (v: unknown): v is string => typeof v === "string" && /^(biblioteca|genesis):[\w./:-]{1,160}$/.test(v);
export function texto(v: unknown, largo: number): string {
  if (typeof v !== "string") return "";
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t.length > largo ? t.slice(0, largo) : t;
}
const tono = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? ((Math.round(v) % 360) + 360) % 360 : def);

export function materialPorDefecto(color = "#7c5cff"): Material {
  return { color, metal: 0, rugosidad: 0.6, emisivo: 0 };
}

/** ADN de partida: la orbe de siempre, con el tono de la entidad. Es lo que ve quien aún no eligió nada. */
export function adnPorDefecto(id: string, nombre: string, dueno: AdnAvatar["dueno"], tonoBase = 260): AdnAvatar {
  return {
    v: VERSION_ADN, id, nombre: texto(nombre, 40) || "Avatar", dueno,
    base: { tipo: "orbe" }, esqueleto: { tipo: "ninguno", articulaciones: 0 },
    morfologia: {}, materiales: {}, piezas: [], expresionBase: {},
    aura: { tono: tono(tonoBase, 260), intensidad: 0.6, ligadaEmocion: true },
    movimiento: { energia: 0.5, amplitud: 0.5, ritmo: 0.5, postura: 0.5 },
    visibilidad: "privado", procedencia: [], rev: 0,
  };
}

function sanearMaterial(v: unknown): Material | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  if (!esColor(m.color)) return null;
  return { color: m.color.toLowerCase(), metal: acotar01(m.metal, 0), rugosidad: acotar01(m.rugosidad, 0.6), emisivo: acotar01(m.emisivo, 0) };
}

function sanearProcedencia(v: unknown): Procedencia | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const herramienta = texto(p.herramienta, 60), licencia = texto(p.licencia, 80);
  if (!herramienta || !licencia || !incluye(USOS_LICENCIA, p.uso)) return null;
  const out: Procedencia = { herramienta, licencia, uso: p.uso };
  const atribucion = texto(p.atribucion, 160);
  if (atribucion) out.atribucion = atribucion;
  if (Array.isArray(p.regionesExcluidas)) {
    const r = p.regionesExcluidas.map((x) => texto(x, 8).toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
    if (r.length) out.regionesExcluidas = [...new Set(r)].slice(0, 32);
  }
  return out;
}

function mapa<K extends string, V>(claves: readonly K[], v: unknown, sanear: (x: unknown) => V | null): Partial<Record<K, V>> {
  const out: Partial<Record<K, V>> = {};
  if (!v || typeof v !== "object") return out;
  for (const k of claves) {
    const x = sanear((v as Record<string, unknown>)[k]);
    if (x !== null) out[k] = x;
  }
  return out;
}
const num01 = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? acotar01(x) : null);

/** Lo que llega de fuera (red, Biblioteca, dictado) → ADN válido, o `null` si no se puede salvar. */
export function sanearAdn(v: unknown): AdnAvatar | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = texto(o.id, 80);
  const d = (o.dueno ?? {}) as Record<string, unknown>;
  if (o.v !== VERSION_ADN || !id || !incluye(DUENOS_AVATAR, d.tipo) || !texto(d.id, 80)) return null;
  const b = (o.base ?? {}) as Record<string, unknown>;
  const baseTipo = incluye(BASES, b.tipo) ? b.tipo : "orbe";
  const base: AdnAvatar["base"] = { tipo: baseTipo };
  if (baseTipo === "vrm" || baseTipo === "glb-rig") {
    if (!esRefInterna(b.ref)) base.tipo = "orbe"; else base.ref = b.ref;
  }
  const e = (o.esqueleto ?? {}) as Record<string, unknown>;
  let esq: Esqueleto = incluye(ESQUELETOS, e.tipo) ? e.tipo : "ninguno";
  if (base.tipo === "orbe") esq = "ninguno";
  const n = typeof e.articulaciones === "number" ? Math.round(e.articulaciones) : 0;
  const articulaciones = esq === "libre" ? Math.min(256, Math.max(1, n)) : ARTICULACIONES[esq];
  const porSlot = new Map<SlotPieza, Pieza>();
  for (const p of Array.isArray(o.piezas) ? o.piezas : []) {
    const q = (p ?? {}) as Record<string, unknown>;
    if (!incluye(SLOTS_PIEZA, q.slot) || !esRefInterna(q.ref)) continue;
    porSlot.set(q.slot, esColor(q.tinte) ? { slot: q.slot, ref: q.ref, tinte: q.tinte.toLowerCase() } : { slot: q.slot, ref: q.ref });
  }
  const a = (o.aura ?? {}) as Record<string, unknown>;
  const m = (o.movimiento ?? {}) as Record<string, unknown>;
  const adn: AdnAvatar = {
    v: VERSION_ADN, id, nombre: texto(o.nombre, 40) || "Avatar",
    dueno: { tipo: d.tipo, id: texto(d.id, 80) }, base, esqueleto: { tipo: esq, articulaciones },
    morfologia: mapa(MORFOLOGIA, o.morfologia, num01),
    materiales: mapa(SLOTS_MATERIAL, o.materiales, sanearMaterial),
    piezas: SLOTS_PIEZA.flatMap((s) => (porSlot.has(s) ? [porSlot.get(s)!] : [])),
    expresionBase: mapa(EXPRESIONES, o.expresionBase, num01),
    aura: { tono: tono(a.tono, 260), intensidad: acotar01(a.intensidad, 0.6), ligadaEmocion: a.ligadaEmocion !== false },
    movimiento: { energia: acotar01(m.energia), amplitud: acotar01(m.amplitud), ritmo: acotar01(m.ritmo), postura: acotar01(m.postura) },
    visibilidad: incluye(VISIBILIDADES, o.visibilidad) ? o.visibilidad : "privado",
    procedencia: (Array.isArray(o.procedencia) ? o.procedencia : []).map(sanearProcedencia).filter((p): p is Procedencia => p !== null).slice(0, 16),
    rev: typeof o.rev === "number" && Number.isFinite(o.rev) ? Math.max(0, Math.floor(o.rev)) : 0,
  };
  return JSON.stringify(adn).length <= TAMANO_MAX_ADN ? adn : null;
}
