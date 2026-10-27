/**
 * Protomolécula · Átomo «Animación 3D (ManimGX)» (MGX1023C). La escena es un PLAN PURO; el render
 * corre vía `cliente-render` en el Worker de ManimGX, nunca en el proceso del OS
 * (contrato: architecture/repos-3d-oido-agentes-1023.md §3).
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import type { EscenaManim } from "@/lib/protomolecula/manimgx/worker-render";
import { renderizarEscena, type ConfigCliente } from "@/lib/protomolecula/manimgx/cliente-render";

export const ANIMACION_MANIMGX: DefinicionAtomo = {
  herramientaId: "animacion-manimgx",
  nombre: "Animación 3D (ManimGX)",
  categoria: "3d",
  integracion: "wasm-en-worker",
  control: "total",
  parametros: [
    { id: "calidad", nombre: "Calidad", tipo: "opcion", opciones: ["borrador", "media", "alta"], defecto: "media", sinonimos: ["resolución", "definición"] },
    { id: "fps", nombre: "Fps", tipo: "entero", min: 12, max: 60, paso: 1, unidad: "fps", defecto: 30, sinonimos: ["fotogramas por segundo"] },
    { id: "duracion", nombre: "Duración", tipo: "numero", min: 1, max: 120, paso: 0.5, unidad: "s", defecto: 10, sinonimos: ["tiempo", "segundos"] },
    { id: "rotacion-camara", nombre: "Rotación de cámara", tipo: "numero", min: 0, max: 360, paso: 1, unidad: "grados", defecto: 45, sinonimos: ["ángulo de cámara", "giro de cámara"] },
    { id: "fondo", nombre: "Fondo", tipo: "opcion", opciones: ["negro", "noche", "azul", "blanco"], defecto: "noche", sinonimos: ["color de fondo"] },
    { id: "renderizar", nombre: "Renderizar", tipo: "disparo", defecto: false, sinonimos: ["render", "exportar mp4", "generar vídeo"] },
  ],
  entradas: [],
  salidas: ["mp4"],
  ficha: { web: "https://github.com/academa-labs/manimgx", repo: "https://github.com/academa-labs/manimgx", licencia: "MIT (con códecs x264: GPL en conjunto)" },
};

/** Las calidades admitidas y su altura de píxel (anchura 16:9). */
const CALIDADES = ["borrador", "media", "alta"] as const;
export type CalidadRender = (typeof CALIDADES)[number];
const ALTURA: Record<CalidadRender, number> = { borrador: 480, media: 720, alta: 1080 };

/** Nombres de fondo tal como se dictan → color útil para `config.background_color`. */
const FONDOS: Record<string, string> = { negro: "#000000", noche: "#0b0b14", azul: "#0f2647", blanco: "#ffffff" };

/** Los parámetros del plano de render, ya saneados y acotados. */
export type ParametrosRender = {
  calidad: CalidadRender; fps: number; duracionSegundos: number; rotacionGrados: number; fondoHex: string; altura: number; anchura: number;
};

const opcionDe = (id: string): string[] => ANIMACION_MANIMGX.parametros.find((p) => p.id === id)?.opciones ?? [];

function numeroDe(v: ValorParametro | undefined, lo: number, hi: number, defecto: number, entero = false): number {
  const n = typeof v !== "number" || !Number.isFinite(v) ? defecto : entero ? Math.round(v) : v;
  return Math.max(lo, Math.min(hi, n));
}

/** Sanea y acota los parámetros del átomo: un valor roto o fuera de rango cae en su defecto. */
export function planRender(valores: Record<string, ValorParametro | undefined>): ParametrosRender {
  const calidad: CalidadRender =
    typeof valores.calidad === "string" && (opcionDe("calidad") as string[]).includes(valores.calidad)
      ? (valores.calidad as CalidadRender) : "media";
  const fondo = typeof valores.fondo === "string" && FONDOS[valores.fondo] ? valores.fondo : "noche";
  const duracionSegundos = numeroDe(valores.duracion, 1, 120, 10);
  const rotacionGrados = numeroDe(valores["rotacion-camara"], 0, 360, 45);
  const fps = numeroDe(valores.fps, 12, 60, 30, true);
  const altura = ALTURA[calidad];
  return {
    calidad,
    fps,
    duracionSegundos,
    rotacionGrados,
    fondoHex: FONDOS[fondo],
    altura,
    anchura: Math.round((altura * 16) / 9),
  };
}

/** El ángulo áureo en radianes (π·(3−√5)): el paso de la espiral en la esfera. */
const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5));

/** Reparte n puntos en una esfera de radio dado con la distribución de Fibonacci (geometría sagrada). Puro. */
export function espiralAurea(n: number, radio = 1.6): [number, number, number][] {
  const f = (v: number): number => Number(v.toFixed(3));
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * ANGULO_AUREO;
    return [f(r * Math.cos(a) * radio), f(y * radio), f(r * Math.sin(a) * radio)] as [number, number, number];
  });
}

/** Un número como literal Python sin ceros de más (10 → «10», 1.500 → «1.5»). */
const LIT = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(3));

/** La escena de Manim según los parámetros: código Python (API de Manim CE) puro, sin ejecutar nada. */
export function escenaDesdeValores(valores: Record<string, ValorParametro | undefined> = {}, nombre = "Animación 3D"): EscenaManim {
  const p = planRender(valores);
  // El giro de cámara: radianes por segundo para que en la duración se giren los grados elegidos.
  const rate = (p.rotacionGrados * Math.PI) / (180 * p.duracionSegundos);
  const codigo = [
    "from manim import *",
    `config.frame_rate = ${p.fps}`,
    `config.background_color = "${p.fondoHex}"`,
    `config.pixel_width = ${p.anchura}; config.pixel_height = ${p.altura}`,
    "class Animacion(ThreeDScene):",
    "    def construct(self):",
    `        FIB = ${JSON.stringify(espiralAurea(48, 1.6))}  # esfera de Fibonacci con el ángulo áureo`,
    "        estrella = VGroup(*[Dot3D([x, y, z]).scale(0.5) for x, y, z in FIB])",
    "        eje = ThreeDAxes()",
    "        self.set_camera_orientation(phi=75 * DEGREES, theta=-45 * DEGREES)",
    "        self.add(eje, estrella)",
    `        self.begin_ambient_camera_rotation(rate=${rate.toFixed(6)})  # ${p.rotacionGrados}° repartidos en la duración`,
    `        self.wait(${LIT(p.duracionSegundos)})`,
    "        self.stop_ambient_camera_rotation()",
    "        self.play(eje.animate.scale(0.001), estrella.animate.scale(0.001), run_time=1.0)",
  ].join("\n");
  return { nombre, codigoPython: codigo, duracionMaxSegundos: Math.ceil(p.duracionSegundos + 1.5) };
}

/** La salida del átomo: el MP4 del render, o un error honesto (un medio sin WebGPU no finge resultado). */
export type SalidaAnimacion = { formato: "mp4"; bytes: Uint8Array | null; cancelado: boolean; error?: string };

/** Acción «renderizar»: manda la escena al cliente de ManimGX (Worker con Pyodide, fuera del proceso del OS). */
export async function renderizarAnimacion(escena: EscenaManim, config?: ConfigCliente, cancelacion?: AbortSignal): Promise<SalidaAnimacion> {
  const r = await renderizarEscena(escena, config, cancelacion);
  const salida: SalidaAnimacion = { formato: "mp4", bytes: r.bytes, cancelado: r.cancelado };
  if (r.error) salida.error = r.error;
  return salida;
}
