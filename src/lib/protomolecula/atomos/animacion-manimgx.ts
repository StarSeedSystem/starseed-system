/**
 * Protomolécula · Átomo «Animación 3D (ManimGX)» (MGX1023C): desarrolla modelos 3D con Astraura y la
 * Protomolécula, en cualquier medio, publicación o archivo (Alex, 2026-10-23). La acción «renderizar» es un
 * PLAN PURO: nombra la escena y la configuración del `cliente-render` (MGX1023B) y no ejecuta nada — el
 * código del agente nunca corre en el proceso del OS (contrato: architecture/repos-3d-oido-agentes-1023.md §3).
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import type { ConfigCliente } from "@/lib/protomolecula/manimgx/cliente-render";
import type { EscenaManim } from "@/lib/protomolecula/manimgx/worker-render";

export const ANIMACION_MANIMGX: DefinicionAtomo = {
  herramientaId: "animacion-manimgx",
  nombre: "Animación 3D (ManimGX)",
  categoria: "3d",
  integracion: "wasm-en-worker",
  control: "total",
  parametros: [
    { id: "calidad", nombre: "Calidad", tipo: "opcion", opciones: ["borrador", "normal", "alta"], defecto: "normal", sinonimos: ["calidad de render", "resolución"] },
    { id: "fps", nombre: "Fotogramas por segundo", tipo: "entero", min: 1, max: 120, paso: 1, unidad: "fps", defecto: 30, sinonimos: ["fps", "fotogramas"] },
    { id: "duracion", nombre: "Duración", tipo: "numero", min: 1, max: 60, paso: 0.1, unidad: "s", defecto: 5, sinonimos: ["tiempo", "longitud"] },
    { id: "rotacion-camara", nombre: "Rotación de cámara", tipo: "numero", min: -180, max: 180, paso: 1, unidad: "grados", defecto: 0, sinonimos: ["giro de cámara", "ángulo"] },
    { id: "color-fondo", nombre: "Color de fondo", tipo: "opcion", opciones: ["negro", "azul noche", "violeta", "blanco", "verde oscuro"], defecto: "negro", sinonimos: ["fondo", "color"] },
    { id: "renderizar", nombre: "Renderizar", tipo: "disparo", defecto: false, sinonimos: ["render", "renderizar escena"] },
  ],
  entradas: ["escena-manim"],
  salidas: ["mp4"],
  ficha: { web: "https://github.com/academa-labs/manimgx", repo: "https://github.com/academa-labs/manimgx", licencia: "MIT" },
};

/** Trama y tope de render por calidad (§3: tope de tiempo y memoria en la neurona). */
const TOPE_MS: Record<string, number> = { borrador: 30000, normal: 120000, alta: 300000 };
const param = (id: string) => ANIMACION_MANIMGX.parametros.find((p) => p.id === id);

export interface EntradaAnimacion {
  valores: Record<string, ValorParametro | undefined>;
  /** Código Python de la escena (API de Manim CE): nunca se ejecuta aquí, solo viaja al cliente-render. */
  codigoPython: string;
  /** Nombre corto de la escena para el MP4. */
  nombre?: string;
  /** Reloj inyectado (ms) para el registro del plan. */
  ahora: number;
}

export interface PlanAnimacion {
  escena: EscenaManim;
  /** Config del cliente-render (MGX1023B): el plan la nombra y no la llama. */
  cliente: ConfigCliente;
  duracionS: number;
  fps: number;
  rotacionGrados: number;
  colorFondo: string;
  calidad: string;
  avisos: string[];
}

/** Un número finito dentro de sus límites; si no, el defecto. */
function acotar(v: unknown, id: string): number {
  const p = param(id);
  const base = typeof v === "number" && Number.isFinite(v) ? v : Number(p?.defecto ?? 0);
  const lo = p?.min ?? base, hi = p?.max ?? base;
  return Math.min(hi, Math.max(lo, Math.round(base * (p?.tipo === "entero" ? 1 : 1000)) / (p?.tipo === "entero" ? 1 : 1000)));
}

function opcion(v: unknown, id: string): string {
  const p = param(id);
  return typeof v === "string" && p?.opciones?.includes(v) ? v : String(p?.defecto);
}

/**
 * Acción «renderizar»: construye el PLAN del MP4 — escena (código Python, duración) y configuración
 * del cliente-render con su tope de tiempo. PURO: misma entrada, mismo plan; no llama a ningún motor.
 */
export function planRenderizar(e: EntradaAnimacion): PlanAnimacion {
  const avisos: string[] = [];
  const calidad = opcion(e.valores["calidad"], "calidad");
  const color = opcion(e.valores["color-fondo"], "color-fondo");
  const fps = acotar(e.valores["fps"], "fps");
  const duracionS = acotar(e.valores["duracion"], "duracion");
  const rotacionGrados = acotar(e.valores["rotacion-camara"], "rotacion-camara");
  const escena: EscenaManim = {
    nombre: (e.nombre ?? "escena").replace(/[^\p{L}\p{N}-]+/gu, "-").slice(0, 40) || "escena",
    codigoPython: e.codigoPython,
    duracionMaxSegundos: duracionS,
  };
  if (!e.codigoPython.trim()) avisos.push("Sin código Python de la escena el cliente-render no tiene qué animar.");
  return {
    escena, calidad, duracionS, fps, rotacionGrados, colorFondo: color,
    cliente: { topeTiempoMs: TOPE_MS[calidad] ?? TOPE_MS.normal },
    avisos,
  };
}
