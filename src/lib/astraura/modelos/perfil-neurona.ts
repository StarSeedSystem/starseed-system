// Perfil de capacidad de una neurona para recomendar modelos locales (MOD1110A).
// Amplía `perfil-hardware.ts` (plataforma, núcleos, RAM) con chip, VRAM, disco libre, enchufe y,
// sobre todo, los runtimes que la neurona PUEDE usar de verdad. Puro: el entorno llega ya medido.
//
// Qué ejecuta modelos locales en StarSeed hoy (comprobado en el repo el 2026-11-10):
//   · Escritorio (Tauri): el backend Astraura 1.58 (llama-server / BitNet en 127.0.0.1:8000) y, si la
//     persona lo tiene instalado, Ollama (11434) o LM Studio (1234), que la puerta de la malla ya conoce.
//     StarSeed NO instala ni arranca Ollama por su cuenta: solo lo detecta.
//   · Navegador/PWA/Android WebView: WebGPU (WebLLM, SmolLM3, capas ONNX) y Needle por WASM. Sin llama-server.
// Por eso un modelo de Ollama solo se recomienda si Ollama está presente en esa neurona.

import { detectarChip, type Plataforma } from "@/lib/astraura/perfil-hardware";
import type { FamiliaChip, RuntimeLocal } from "./tipos";

export interface PerfilNeurona {
  id: string;
  nombre: string;
  chip: FamiliaChip;
  plataforma: Plataforma;
  /** Memoria en GB; null = no se sabe. */
  ramGb: number | null;
  /** false = la cifra viene del navegador (tope de 8 GB) y no es la memoria real. */
  ramFiable: boolean;
  vramGb: number | null;
  discoLibreGb: number | null;
  /** true = enchufada, false = con batería, null = no aplica o no se sabe. */
  enchufada: boolean | null;
  runtimes: RuntimeLocal[];
  /** Esta neurona sirve su IA a otras neuronas de la cuenta por la malla. */
  iaMalla: boolean;
  enLinea: boolean;
  /** Ollama instalable desde la app (escritorio) aunque hoy no esté. */
  puedeInstalarOllama: boolean;
}

export interface EntradaPerfilNeurona {
  id: string;
  nombre?: string;
  plataforma: Plataforma;
  gpuRenderer?: string;
  gpuVendor?: string;
  ramGb?: number | null;
  /** true si la RAM viene del puente nativo o la declaró la persona (no del navegador). */
  ramReal?: boolean;
  vramGb?: number | null;
  discoLibreGb?: number | null;
  enchufada?: boolean | null;
  ollama?: boolean;
  lmstudio?: boolean;
  /** Backend Astraura 1.58 vivo en esta neurona. */
  backend158?: boolean;
  webgpu?: boolean;
  wasm?: boolean;
  iaMalla?: boolean;
  enLinea?: boolean;
}

const NATIVAS: ReadonlySet<Plataforma> = new Set(["tauri", "android", "ios"]);
/** `navigator.deviceMemory` nunca pasa de 8: ese valor solo significa «8 o más». */
export const TOPE_MEMORIA_NAVEGADOR_GB = 8;

export function runtimesDe(e: EntradaPerfilNeurona): RuntimeLocal[] {
  const r: RuntimeLocal[] = [];
  if (e.ollama === true) r.push("ollama");
  if (e.backend158 === true && e.plataforma === "tauri") r.push("llama-cpp", "bitnet-cpp");
  if (e.wasm !== false && e.plataforma !== "ios") r.push("needle-wasm");
  if (e.plataforma === "tauri" || e.plataforma === "android") r.push("needle-nativo");
  if (e.webgpu === true) r.push("webgpu");
  return r;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

export function construirPerfilNeurona(e: EntradaPerfilNeurona): PerfilNeurona {
  const ram = num(e.ramGb);
  return {
    id: e.id,
    nombre: e.nombre?.trim() || e.id,
    chip: detectarChip({ plataforma: e.plataforma, gpuRenderer: e.gpuRenderer, gpuVendor: e.gpuVendor }),
    plataforma: e.plataforma,
    ramGb: ram,
    ramFiable: ram !== null && (e.ramReal === true || ram < TOPE_MEMORIA_NAVEGADOR_GB),
    vramGb: num(e.vramGb),
    discoLibreGb: num(e.discoLibreGb),
    enchufada: typeof e.enchufada === "boolean" ? e.enchufada : null,
    runtimes: runtimesDe(e),
    iaMalla: e.iaMalla === true,
    enLinea: e.enLinea !== false,
    puedeInstalarOllama: e.plataforma === "tauri" && e.ollama !== true,
  };
}

/** Perfil desde la ficha `capabilities` que cada neurona publica en la cuenta (campos opcionales y tolerantes). */
export function perfilDesdeCapacidades(
  id: string,
  nombre: string,
  caps: Record<string, unknown> | null | undefined,
  extras: { ramDeclaradaGb?: number | null; plataforma?: Plataforma; iaMalla?: boolean; enLinea?: boolean } = {},
): PerfilNeurona {
  const c = caps ?? {};
  const p = String(c.platform ?? "").toLowerCase();
  const plataforma: Plataforma = extras.plataforma ?? (/android/.test(p) ? "android" : /ios/.test(p) ? "ios" : c.installedApp === true ? "tauri" : "web");
  const bateria = (c.battery ?? null) as { charging?: boolean } | null;
  const declarada = num(extras.ramDeclaradaGb);
  const a158 = (c.astraura158 ?? null) as { online?: boolean } | null;
  return construirPerfilNeurona({
    id,
    nombre,
    plataforma,
    gpuRenderer: typeof c.gpuRenderer === "string" ? c.gpuRenderer : undefined,
    gpuVendor: typeof c.gpuVendor === "string" ? c.gpuVendor : undefined,
    ramGb: declarada ?? num(c.ramGb) ?? num(c.memoryGb),
    ramReal: declarada !== null || num(c.ramGb) !== null,
    vramGb: num(c.vramGb),
    discoLibreGb: num(c.discoLibreGb),
    enchufada: bateria && typeof bateria.charging === "boolean" ? bateria.charging : null,
    ollama: c.ollama === true,
    lmstudio: c.lmstudio === true,
    backend158: a158?.online === true,
    webgpu: c.webgpu === true,
    iaMalla: extras.iaMalla,
    enLinea: extras.enLinea,
  });
}

export const esNativa = (p: Plataforma): boolean => NATIVAS.has(p);

/** Lo que mide el servicio local de la app nativa (`GET /hierro`, ver `src/lib/imagenes/adaptadores/hierro-local.ts`). */
export interface HierroMedido {
  so: string;
  gpu: "nvidia" | "apple" | "amd" | "ninguna";
  ramGB: number;
  vramGB: number | null;
  discoLibreBytes: number | null;
}

const CHIP_DE_GPU: Record<HierroMedido["gpu"], FamiliaChip> = { apple: "apple-silicon", nvidia: "nvidia", amd: "amd", ninguna: "cpu" };

/**
 * Sustituye lo estimado por el navegador por lo MEDIDO por la app nativa (memoria real, VRAM, disco libre y chip).
 * Si no hay servicio local el perfil queda como estaba: lo desconocido se declara, no se inventa.
 */
export function conHierroMedido(p: PerfilNeurona, h: HierroMedido | null | undefined): PerfilNeurona {
  if (!h || !Number.isFinite(h.ramGB) || h.ramGB <= 0) return p;
  return {
    ...p,
    chip: p.plataforma === "android" ? "android-soc" : CHIP_DE_GPU[h.gpu],
    ramGb: h.ramGB,
    ramFiable: true,
    vramGb: h.vramGB,
    discoLibreGb: h.discoLibreBytes === null ? p.discoLibreGb : Math.round((h.discoLibreBytes / 1024 ** 3) * 10) / 10,
  };
}
