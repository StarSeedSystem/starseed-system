/**
 * Acción `render_3d` de Astraura — `architecture/blender-3d.md` §8 y §4.4 (BLD1025I).
 * La IA PROPONE un trabajo 3D como DATO (nunca código de Blender) y el validador
 * (`validarTrabajo`) decide. Puro: sin `node:*`, sin red, sin procesos.
 */
import type { Trabajo3D } from "./trabajo";
import { validarTrabajo } from "./trabajo";

type Respuesta = { ok: true; trabajo: Trabajo3D } | { ok: false; motivo: string };

const FORMAS = ["cubo", "esfera", "icosfera", "cilindro", "cono", "toro"] as const;
const MATERIALES: Record<string, { metalico: number; rugosidad: number; alfa: number }> = {
  cristal: { metalico: 0, rugosidad: 0.05, alfa: 0.5 },
  metal: { metalico: 1, rugosidad: 0.25, alfa: 1 },
  mate: { metalico: 0, rugosidad: 0.7, alfa: 1 },
  brillante: { metalico: 0, rugosidad: 0.1, alfa: 1 },
};
const COLORES: Record<string, [number, number, number]> = {
  rojo: [1, 0.23, 0.19], verde: [0.2, 0.78, 0.35], azul: [0.04, 0.52, 1], amarillo: [1, 0.84, 0.04],
  naranja: [1, 0.58, 0], morado: [0.75, 0.35, 0.95], violeta: [0.75, 0.35, 0.95], rosa: [1, 0.18, 0.58],
  blanco: [1, 1, 1], negro: [0.11, 0.11, 0.12], gris: [0.56, 0.56, 0.58], cian: [0.39, 0.82, 1], magenta: [1, 0.22, 0.37],
};
const MOTIVO_SIN_NEURONA = "próximamente: ninguna de tus neuronas tiene Blender";

export const trabajoDeAccion = (args: Record<string, unknown>): Respuesta => esTrabajoCompleto(args) ? trabajoTalCual(args.trabajo) : trabajoCorto(args);
export const elegirNeurona = (neuronas: { nombre: string; capabilities?: Record<string, unknown> }[]): { ok: true; neurona: string } | { ok: false; motivo: string } => {
  for (const n of neuronas) {
    const b = (n.capabilities as { blender?: { instalado?: unknown; perfil?: unknown } } | undefined)?.blender;
    if (b?.instalado === true && b.perfil !== "ninguno") return { ok: true, neurona: String(n.nombre) };
  }
  return { ok: false, motivo: MOTIVO_SIN_NEURONA };
};

function esTrabajoCompleto(args: Record<string, unknown>): boolean {
  return typeof args.trabajo === "object" && args.trabajo !== null;
}

function trabajoTalCual(bruto: unknown): Respuesta {
  const v = validarTrabajo(bruto);
  return v.ok ? { ok: true, trabajo: v.trabajo } : { ok: false, motivo: `El trabajo 3D no vale: ${v.motivos.join("; ")}.` };
}

const MOTORES: readonly string[] = ["workbench", "cycles-cpu", "cycles-gpu", "eevee"];
const SALIDAS: readonly string[] = ["png", "glb", "ambos"];

/** Número entero 16..4096 (por lado de salida); lo que no cuadre da -1 y se reporta. */
function topeDe(v: unknown, defecto: number): number {
  if (v === undefined || v === null || v === "") return defecto;
  const n = Number(v);
  return Number.isInteger(n) && n >= 16 && n <= 4096 ? n : -1;
}

/** «#rrggbb» (o color con nombre en español) → rgba 0–1 del vocabulario; null si no vale. */
function colorDe(v: unknown): [number, number, number, number] | null {
  if (v === undefined) return null;
  const texto = String(v).trim().toLowerCase();
  const nombre = COLORES[texto];
  if (nombre) return [...nombre, 1] as [number, number, number, number];
  const hex = /^#([0-9a-f]{6})$/.exec(texto);
  if (!hex) return null;
  const entero = parseInt(hex[1], 16);
  return [(entero >> 16) & 0xff, (entero >> 8) & 0xff, entero & 0xff].map((x) => x / 255).concat(1) as [number, number, number, number];
}

function salidasDe(salida: string, ancho: number, alto: number, motor: string): Record<string, unknown>[] {
  const png = { tipo: "render_png", ancho, alto, muestras: 32, motor };
  return salida === "png" ? [png] : salida === "glb" ? [{ tipo: "exportar_glb", objetos: ["cuerpo"] }] : [png, { tipo: "exportar_glb", objetos: ["cuerpo"] }];
}

function tituloDe(forma: string, material: string): string {
  const bonita = forma.charAt(0).toUpperCase() + forma.slice(1);
  return material === "mate" ? `Render 3D: ${bonita}` : `Render 3D: ${bonita} de ${material}`;
}

function trabajoCorto(args: Record<string, unknown>): Respuesta {
  const forma = String(args.forma ?? "").trim();
  if (!(FORMAS as readonly string[]).includes(forma)) return { ok: false, motivo: `Forma desconocida: usa ${FORMAS.join(", ")}.` };
  const material = args.material === undefined ? "mate" : String(args.material).trim();
  const diseno = MATERIALES[material];
  if (!diseno) return { ok: false, motivo: "Material no válido: usa cristal, metal, mate o brillante." };
  const color = colorDe(args.color ?? "#8e8e93");
  if (!color) return { ok: false, motivo: "Color no válido: usa #rrggbb o un nombre de color en español (rojo, azul, verde…)." };
  const ancho = topeDe(args.ancho, 1280);
  const alto = topeDe(args.alto, 720);
  if (ancho === -1 || alto === -1) return { ok: false, motivo: "Tamaño fuera de rango: ancho y alto van de 16 a 4096 píxeles." };
  const motor = args.motor === undefined ? "cycles-cpu" : String(args.motor).trim();
  if (!MOTORES.includes(motor)) return { ok: false, motivo: "Motor no válido: usa workbench, cycles-cpu, cycles-gpu o eevee." };
  const salida = args.salida === undefined ? "png" : String(args.salida).trim();
  if (!SALIDAS.includes(salida)) return { ok: false, motivo: "Salida no válida: usa png, glb o ambos." };
  const salidas = salidasDe(salida, ancho, alto, motor);
  const bruto = {
    v: 1, titulo: tituloDe(forma, material), calidad: "normal", ambito: "personal", origen: "astraura", quien: "agente",
    escena: [
      { op: "primitiva", tipo: forma, nombre: "cuerpo", tam: 1 },
      { op: "material", objeto: "cuerpo", color: color, metalico: diseno.metalico, rugosidad: diseno.rugosidad, alfa: diseno.alfa },
      { op: "camara", nombre: "camara", ubicacion: [0, -4, 2], mira_a: [0, 0, 0] },
      { op: "luz", nombre: "sol", tipo: "sol", energia: 3 },
      { op: "mundo", color: [0.05, 0.05, 0.08, 1], fuerza: 1 },
    ], salidas,
  };
  return trabajoTalCual(bruto);
}

