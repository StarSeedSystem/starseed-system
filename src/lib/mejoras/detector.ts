/**
 * DETECTOR por neurona: ¿cabe este sistema en este aparato y en qué medio? (contrato §2)
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Cruza la huella REAL del aparato con los requisitos de cada sistema y responde, sin adivinar:
 *   · instalable aquí (y en qué medio: servicio local, app nativa, app instalada o navegador);
 *   · no cabe aquí y por qué (RAM, disco, núcleos, GPU, VRAM, aceleración, sistema);
 *   · sin medio (p. ej. solo hay navegador y el sistema necesita el servicio local);
 *   · sin datos (falta una medida que decide: la RAM más allá de la cota del navegador…);
 *   · y si no cabe, la neurona tuya donde sí cabe con más margen.
 *
 * La huella se arma desde la ficha del navegador (`NeuronCapabilities`) y desde el sondeo de la
 * máquina (`scripts/puente/mejoras_neurona.py huella`); si están las dos, manda el sondeo.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 */

import { familiaSistema, normalizarGpu } from "@/lib/neurons/huella";
import {
  ACELERACIONES,
  ACELERACIONES_DEL_MEDIO,
  ACELERACIONES_GPU,
  MEDIOS_EJECUCION,
  NOMBRE_MEDIO,
  type Aceleracion,
  type HuellaAparato,
  type MedioEjecucion,
  type SistemaMejorable,
  type SistemaOperativo,
} from "./tipos";

/** Lo que el detector lee de una ficha de capacidades (subconjunto estructural de NeuronCapabilities). */
export interface CapsMejoras {
  platform?: string;
  memoryGb?: number;
  cores?: number;
  gpuRenderer?: string;
  webgpu?: boolean;
  storageQuotaGb?: number;
  storageUsedGb?: number;
  installedApp?: boolean;
  medios?: Record<string, { tipo?: string } | undefined>;
}

/** El navegador corta `navigator.deviceMemory` en 8 GB y redondea hacia abajo a potencia de 2. */
export const TOPE_DEVICE_MEMORY_MB = 8192;
/** Se pide este múltiplo del tamaño: la versión anterior se conserva para volver atrás. */
export const MARGEN_DISCO = 1.2;
/** Memoria unificada de Apple: la GPU puede usar en torno a 2/3 de la RAM. */
export const FRACCION_VRAM_APPLE = 2 / 3;

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null);
const gb = (mb: number): string => (mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${Math.round(mb)} MB`);

function sistemaDe(platform?: string): SistemaOperativo {
  const f = familiaSistema(platform);
  return (["macos", "linux", "windows", "android", "ios", "ipados"] as const).includes(f as never) ? (f as SistemaOperativo) : "desconocido";
}

const MEDIO_DE_TIPO: Record<string, MedioEjecucion[]> = {
  "app-nativa": ["nativa"],
  "app-instalada": ["pwa"],
  // Servido desde localhost: la máquina ya corre el servidor del OS, así que admite servicios locales.
  local: ["web", "servidor"],
  navegador: ["web"],
  "navegador-claude": ["web"],
};

function ordenarMedios(ms: Iterable<MedioEjecucion>): MedioEjecucion[] {
  const set = new Set(ms);
  return MEDIOS_EJECUCION.filter((m) => set.has(m));
}

/** Aceleraciones que se deducen del navegador (marcadas como inferidas: las confirma el sondeo). */
function aceleracionesInferidas(sistema: SistemaOperativo, familiaGpu: string, webgpu: boolean, medios: MedioEjecucion[]): Aceleracion[] {
  const out = new Set<Aceleracion>(["wasm"]);
  if (webgpu) out.add("webgpu");
  const local = medios.includes("nativa") || medios.includes("servidor");
  if (!local) return [...out];
  out.add("cpu");
  if (familiaGpu === "apple" && sistema === "macos") out.add("metal");
  if (familiaGpu === "apple" && (sistema === "ios" || sistema === "ipados")) {
    out.add("metal");
    out.add("coreml");
  }
  if (familiaGpu === "nvidia" && (sistema === "linux" || sistema === "windows")) out.add("cuda");
  if (familiaGpu === "amd" && sistema === "linux") out.add("rocm");
  if ((familiaGpu === "amd" || familiaGpu === "intel" || familiaGpu === "nvidia") && (sistema === "linux" || sistema === "windows")) out.add("vulkan");
  if (sistema === "android" && medios.includes("nativa")) out.add("nnapi");
  return ACELERACIONES.filter((a) => out.has(a));
}

/** Huella desde la ficha del navegador. La RAM queda como COTA (deviceMemory). */
export function huellaDesdeCapacidades(neuronaId: string, caps: CapsMejoras | null | undefined, extra: { nombre?: string; enLinea?: boolean } = {}): HuellaAparato {
  const c = caps ?? {};
  const sistema = sistemaDe(c.platform);
  const gpu = normalizarGpu(c.gpuRenderer);
  const medios = new Set<MedioEjecucion>();
  for (const r of Object.values(c.medios ?? {})) for (const m of MEDIO_DE_TIPO[String(r?.tipo ?? "")] ?? []) medios.add(m);
  if (c.installedApp) medios.add("pwa");
  if (!medios.size) medios.add("web");
  const lista = ordenarMedios(medios);
  const ram = num(c.memoryGb);
  const cuota = num(c.storageQuotaGb);
  const usado = typeof c.storageUsedGb === "number" && c.storageUsedGb >= 0 ? c.storageUsedGb : 0;
  return {
    neuronaId,
    nombre: extra.nombre,
    sistema,
    ramMb: ram ? Math.round(ram * 1024) : null,
    ramEsCota: !!ram,
    discoLibreMb: null,
    cuotaWebLibreMb: cuota ? Math.max(0, Math.round((cuota - usado) * 1024)) : null,
    nucleos: num(c.cores),
    gpu: { familia: gpu.familia, ...(gpu.modelo ? { modelo: gpu.modelo } : {}), vramMb: null },
    aceleraciones: aceleracionesInferidas(sistema, gpu.familia, !!c.webgpu, lista),
    aceleracionesInferidas: true,
    medios: lista,
    enLinea: extra.enLinea,
    medida: "navegador",
  };
}

/** Lo que escribe `mejoras_neurona.py huella` (claves en castellano y snake_case). */
export function huellaDesdeSondeo(neuronaId: string, x: unknown, extra: { nombre?: string; enLinea?: boolean } = {}): HuellaAparato | null {
  const s = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
  if (!s) return null;
  const gpu = (s.gpu && typeof s.gpu === "object" ? s.gpu : {}) as Record<string, unknown>;
  const acel = Array.isArray(s.aceleraciones) ? s.aceleraciones.filter((a): a is Aceleracion => ACELERACIONES.includes(a as Aceleracion)) : [];
  const sistema = sistemaDe(typeof s.sistema === "string" ? s.sistema : "");
  return {
    neuronaId,
    nombre: extra.nombre,
    sistema,
    ramMb: num(s.ram_mb),
    ramEsCota: false,
    discoLibreMb: num(s.disco_libre_mb),
    cuotaWebLibreMb: null,
    nucleos: num(s.nucleos),
    gpu: {
      familia: typeof gpu.familia === "string" && gpu.familia ? gpu.familia : "desconocida",
      ...(typeof gpu.modelo === "string" && gpu.modelo ? { modelo: gpu.modelo } : {}),
      vramMb: num(gpu.vram_mb),
    },
    aceleraciones: ACELERACIONES.filter((a) => acel.includes(a)),
    aceleracionesInferidas: false,
    // Si el sondeo corre, la máquina corre servicios locales.
    medios: ["servidor"],
    enLinea: extra.enLinea,
    medida: "sondeo",
  };
}

/** Fusiona navegador + sondeo: el sondeo manda en el hardware; los medios se suman. */
export function fusionarHuellas(nav: HuellaAparato | null, sondeo: HuellaAparato | null): HuellaAparato | null {
  if (!nav) return sondeo;
  if (!sondeo) return nav;
  const acel = new Set<Aceleracion>([...sondeo.aceleraciones, ...nav.aceleraciones.filter((a) => a === "wasm" || a === "webgpu")]);
  return {
    ...nav,
    sistema: sondeo.sistema !== "desconocido" ? sondeo.sistema : nav.sistema,
    ramMb: sondeo.ramMb ?? nav.ramMb,
    ramEsCota: sondeo.ramMb === null && nav.ramEsCota,
    discoLibreMb: sondeo.discoLibreMb ?? nav.discoLibreMb,
    nucleos: sondeo.nucleos ?? nav.nucleos,
    gpu: sondeo.gpu.familia !== "desconocida" ? sondeo.gpu : nav.gpu,
    aceleraciones: ACELERACIONES.filter((a) => acel.has(a)),
    aceleracionesInferidas: false,
    medios: ordenarMedios([...nav.medios, ...sondeo.medios]),
    medida: "ambos",
  };
}

export type VeredictoEncaje = "instalable" | "no-cabe" | "sin-medio" | "sin-datos";

export type Recurso = "ram" | "disco" | "nucleos" | "gpu" | "vram" | "aceleracion" | "sistema" | "medio";

export interface Falta {
  recurso: Recurso;
  texto: string;
}

export interface Encaje {
  sistemaId: string;
  veredicto: VeredictoEncaje;
  /** Medio elegido (el primero en el orden del sistema donde cabe), o el más cercano. */
  medio: MedioEjecucion | null;
  /** Lo que falta seguro. */
  carencias: Falta[];
  /** Lo que no se sabe y decide (sin datos). */
  dudas: Falta[];
  /** Notas que no bloquean (disco sin medir, aceleración inferida). */
  notas: string[];
}

/** RAM: «cabe», «no cabe» o «no se sabe», con la cota del navegador bien leída. */
export function encajeRam(huella: Pick<HuellaAparato, "ramMb" | "ramEsCota">, necesitaMb: number): "cabe" | "no-cabe" | "no-se-sabe" {
  const v = huella.ramMb;
  if (v === null) return "no-se-sabe";
  if (v >= necesitaMb) return "cabe";
  if (!huella.ramEsCota) return "no-cabe";
  // Cota: la RAM real está en [v, 2v) si v < 8 GB, o es ≥ 8 GB si v es el tope.
  if (v < TOPE_DEVICE_MEMORY_MB && 2 * v <= necesitaMb) return "no-cabe";
  return "no-se-sabe";
}

function evaluarMedio(s: SistemaMejorable, h: HuellaAparato, medio: MedioEjecucion): { carencias: Falta[]; dudas: Falta[]; notas: string[] } {
  const carencias: Falta[] = [];
  const dudas: Falta[] = [];
  const notas: string[] = [];
  const r = s.requisitos;
  const enMedio = NOMBRE_MEDIO[medio];

  if (r.sistemas?.length && !r.sistemas.includes(h.sistema)) carencias.push({ recurso: "sistema", texto: `Solo corre en ${r.sistemas.join(", ")}.` });

  const disponibles = h.aceleraciones.filter((a) => ACELERACIONES_DEL_MEDIO[medio].has(a));
  const validas = r.aceleraciones?.length ? disponibles.filter((a) => r.aceleraciones!.includes(a)) : disponibles;
  if (r.aceleraciones?.length && !validas.length)
    carencias.push({ recurso: "aceleracion", texto: `Necesita ${r.aceleraciones.join(" o ")}; en ${enMedio} hay ${disponibles.join(", ") || "ninguna"}.` });
  else if (r.gpu === "requerida" && !validas.some((a) => ACELERACIONES_GPU.has(a)))
    carencias.push({ recurso: "gpu", texto: `Necesita GPU (${(r.aceleraciones ?? []).filter((a) => ACELERACIONES_GPU.has(a)).join(" o ") || "aceleración gráfica"}) y en ${enMedio} no hay.` });
  else if (h.aceleracionesInferidas && validas.some((a) => a === "cuda" || a === "rocm" || a === "vulkan" || a === "metal"))
    notas.push(`${validas.filter((a) => a !== "cpu" && a !== "wasm").join("/")} deducida del navegador: se confirma con el sondeo de la neurona.`);

  if (r.ramMinMb) {
    const e = encajeRam(h, r.ramMinMb);
    if (e === "no-cabe") carencias.push({ recurso: "ram", texto: `Pide ${gb(r.ramMinMb)} de RAM y hay ${h.ramEsCota ? "menos de " + gb(2 * (h.ramMb ?? 0)) : gb(h.ramMb ?? 0)}.` });
    else if (e === "no-se-sabe")
      dudas.push({ recurso: "ram", texto: h.ramMb === null ? "RAM sin medir." : `El navegador solo dice «al menos ${gb(h.ramMb)}» y pide ${gb(r.ramMinMb)}: hace falta el sondeo de la máquina.` });
  }

  if (r.vramMinMb && r.gpu !== "no") {
    const apple = h.gpu.familia === "apple" && (medio === "servidor" || medio === "nativa");
    const vram = apple ? (h.ramMb !== null && !h.ramEsCota ? h.ramMb * FRACCION_VRAM_APPLE : null) : h.gpu.vramMb;
    if (vram === null) dudas.push({ recurso: "vram", texto: `Pide ${gb(r.vramMinMb)} de memoria de GPU y no está medida.` });
    else if (vram < r.vramMinMb) carencias.push({ recurso: "vram", texto: `Pide ${gb(r.vramMinMb)} de memoria de GPU y hay ${gb(vram)}${apple ? " (2/3 de la memoria unificada)" : ""}.` });
  }

  if (r.discoMb) {
    const libre = medio === "web" || medio === "pwa" ? h.cuotaWebLibreMb : h.discoLibreMb;
    const pide = r.discoMb * MARGEN_DISCO;
    if (libre === null) notas.push("Espacio libre sin medir: se comprueba antes de descargar.");
    else if (libre < pide) carencias.push({ recurso: "disco", texto: `Pide ${gb(pide)} libres (con la versión anterior guardada) y hay ${gb(libre)}${medio === "web" || medio === "pwa" ? " en la cuota del navegador" : ""}.` });
  }

  if (r.nucleosMin) {
    if (h.nucleos === null) dudas.push({ recurso: "nucleos", texto: "Núcleos sin medir." });
    else if (h.nucleos < r.nucleosMin) carencias.push({ recurso: "nucleos", texto: `Pide ${r.nucleosMin} núcleos y hay ${h.nucleos}.` });
  }
  return { carencias, dudas, notas };
}

/** ¿Cabe este sistema en este aparato? El primer medio (en el orden del sistema) donde cabe gana. */
export function evaluarEncaje(s: SistemaMejorable, h: HuellaAparato): Encaje {
  const base = { sistemaId: s.id };
  const comunes = s.medios.filter((m) => h.medios.includes(m));
  if (!comunes.length) {
    return {
      ...base,
      veredicto: "sin-medio",
      medio: null,
      carencias: [{ recurso: "medio", texto: `Corre en ${s.medios.map((m) => NOMBRE_MEDIO[m]).join(" o ")}; este aparato abre StarSeed en ${h.medios.map((m) => NOMBRE_MEDIO[m]).join(" y ")}.` }],
      dudas: [],
      notas: [],
    };
  }
  const evaluados = comunes.map((medio) => ({ medio, ...evaluarMedio(s, h, medio) }));
  const limpio = evaluados.find((e) => !e.carencias.length && !e.dudas.length);
  if (limpio) return { ...base, veredicto: "instalable", medio: limpio.medio, carencias: [], dudas: [], notas: limpio.notas };
  const dudoso = evaluados.find((e) => !e.carencias.length);
  if (dudoso) return { ...base, veredicto: "sin-datos", medio: dudoso.medio, carencias: [], dudas: dudoso.dudas, notas: dudoso.notas };
  const cercano = [...evaluados].sort((a, b) => a.carencias.length - b.carencias.length)[0];
  return { ...base, veredicto: "no-cabe", medio: cercano.medio, carencias: cercano.carencias, dudas: cercano.dudas, notas: cercano.notas };
}

export interface Alternativa {
  neuronaId: string;
  nombre?: string;
  medio: MedioEjecucion;
}

/** Holgura de RAM (para elegir la neurona con más margen). Sin dato = 0. */
function holgura(s: SistemaMejorable, h: HuellaAparato): number {
  if (!s.requisitos.ramMinMb || h.ramMb === null) return 0;
  return (h.ramMb - s.requisitos.ramMinMb) / s.requisitos.ramMinMb;
}

/** Entre tus otras neuronas, dónde cabe con más margen (las que están en línea primero). */
export function mejorNeuronaPara(s: SistemaMejorable, huellas: readonly HuellaAparato[], excepto?: string): Alternativa | null {
  const candidatas = huellas
    .filter((h) => h.neuronaId !== excepto)
    .map((h) => ({ h, e: evaluarEncaje(s, h) }))
    .filter((x) => x.e.veredicto === "instalable" && x.e.medio);
  if (!candidatas.length) return null;
  candidatas.sort((a, b) => Number(!!b.h.enLinea) - Number(!!a.h.enLinea) || holgura(s, b.h) - holgura(s, a.h) || a.h.neuronaId.localeCompare(b.h.neuronaId));
  const g = candidatas[0];
  return { neuronaId: g.h.neuronaId, ...(g.h.nombre ? { nombre: g.h.nombre } : {}), medio: g.e.medio as MedioEjecucion };
}
