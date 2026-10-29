/**
 * Acción de Astraura «render_3d» (architecture/blender-3d.md §8 y §4.4).
 * La IA PROPONE un trabajo 3D como DATO y `validarTrabajo` (§4) decide; aquí
 * jamás se escribe código de Blender. Puro, sin módulos de Node: sin red ni procesos.
 */
import { validarTrabajo, type Trabajo3D } from "./trabajo";

type Resultado = { ok: true; trabajo: Trabajo3D } | { ok: false; motivo: string };

const FORMAS: readonly string[] = ["cubo", "esfera", "icosfera", "cilindro", "cono", "toro"];
const MOTORES: readonly string[] = ["workbench", "cycles-cpu", "cycles-gpu", "eevee"];
const SALIDAS: readonly string[] = ["png", "glb", "ambos"];
const MATERIALES: Record<string, { metalico: number; rugosidad: number; alfa: number }> = {
  cristal: { metalico: 0, rugosidad: 0, alfa: 0.5 },
  metal: { metalico: 1, rugosidad: 0.25, alfa: 1 },
  mate: { metalico: 0, rugosidad: 0.9, alfa: 1 },
  brillante: { metalico: 0, rugosidad: 0.05, alfa: 1 },
};
const COLORES: Record<string, string> = {
  rojo: "#ff0000", verde: "#00cc44", azul: "#0066ff", amarillo: "#ffdd00", naranja: "#ff8800",
  blanco: "#ffffff", negro: "#111111", gris: "#888888", rosa: "#ff66aa", morado: "#8822cc",
  violeta: "#8822cc", celeste: "#77ccff", cian: "#00ddbb", marrón: "#995522", marron: "#995522",
  turquesa: "#22ccaa",
};
const RE_HEX = /^#[0-9a-fA-F]{6}$/;

/** Texto laxo (recortado y en minúsculas) del primer argumento que traiga algo. */
function textoDe(args: Record<string, unknown>, ...claves: string[]): string {
  for (const c of claves) {
    const v = args[c];
    if (typeof v === "string" && v.trim()) return v.trim().toLowerCase();
  }
  return "";
}

/** «#rrggbb» o nombre de color en español → RGBA 0–1. Null si no se entiende. */
function colorRgba(valor: unknown): [number, number, number, number] | null {
  const texto = typeof valor === "string" ? valor.trim().toLowerCase() : "";
  const hex = RE_HEX.test(texto) ? texto : COLORES[texto];
  if (!hex) return null;
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255, 1];
}

/** Tamaño en píxeles dentro de los topes del vocabulario (§4.2: 16–4096, entero). */
function pixeles(valor: unknown, campo: string): { ok: true; v: number } | { ok: false; motivo: string } {
  const n = Number.isFinite(valor) ? (valor as number) : typeof valor === "string" ? Number(valor.trim()) : NaN;
  if (!Number.isInteger(n)) return { ok: false, motivo: `El ${campo} debe ser un número entero de píxeles.` };
  if (n < 16 || n > 4096) return { ok: false, motivo: `El ${campo} debe estar entre 16 y 4096 píxeles.` };
  return { ok: true, v: n };
}

/**
 * Convierte los argumentos de la acción en un `Trabajo3D` y lo valida. Acepta
 * la forma corta de un chat (forma/color/material/tamaños/salida/motor) o un
 * `trabajo` completo, que va al validador tal cual (§4.4: la IA propone, el
 * validador decide).
 */
export function trabajoDeAccion(args: Record<string, unknown>): Resultado {
  const completo = args["trabajo"];
  if (completo && typeof completo === "object" && !Array.isArray(completo)) {
    const v = validarTrabajo(completo);
    return v.ok ? { ok: true, trabajo: v.trabajo } : { ok: false, motivo: v.motivos.join(" · ") };
  }
  const forma = textoDe(args, "forma", "forma3d", "figura");
  if (!FORMAS.includes(forma)) return { ok: false, motivo: `Dime una forma que conozca: ${FORMAS.join(", ")}.` };
  const valorColor = args["color"] ?? args["tinte"];
  const color = colorRgba(valorColor);
  if (valorColor !== undefined && !color) {
    return { ok: false, motivo: "No entendí ese color: usa #rrggbb o un nombre en español (rojo, azul, verde…)." };
  }
  const material = textoDe(args, "material", "acabado");
  if (material && !MATERIALES[material]) {
    return { ok: false, motivo: `Ese material no lo sé dar todavía: ${Object.keys(MATERIALES).join(", ")}.` };
  }
  const salida = textoDe(args, "salida", "formato", "a");
  if (salida && !SALIDAS.includes(salida)) return { ok: false, motivo: `La salida debe ser ${SALIDAS.join(", ")}.` };
  const motor = textoDe(args, "motor", "motor_render");
  if (motor && !MOTORES.includes(motor)) return { ok: false, motivo: `El motor debe ser uno de ${MOTORES.join(", ")}.` };
  const anchoR = args["ancho"] === undefined ? { ok: true as const, v: 1280 } : pixeles(args["ancho"], "ancho");
  if (!anchoR.ok) return anchoR;
  const altoR = args["alto"] === undefined ? { ok: true as const, v: 720 } : pixeles(args["alto"], "alto");
  if (!altoR.ok) return altoR;
  const mat = MATERIALES[material || "brillante"];
  const rgba = color ?? colorRgba("#7aa2ff");
  const motorFinal = motor || "cycles-cpu";
  const png: Record<string, unknown> = { tipo: "render_png", ancho: anchoR.v, alto: altoR.v, muestras: 32, motor: motorFinal };
  const salidas: Record<string, unknown>[] = salida === "glb" ? [{ tipo: "exportar_glb" }] : salida === "ambos" ? [png, { tipo: "exportar_glb" }] : [png];
  const titulo = typeof args["titulo"] === "string" && args["titulo"].trim() ? args["titulo"].trim() : `Render 3D de Astraura · ${forma}`;
  const v = validarTrabajo({
    v: 1,
    titulo,
    calidad: "normal",
    ambito: "personal",
    origen: "astraura",
    quien: "agente",
    escena: [
      { op: "primitiva", tipo: forma, nombre: "Objeto", tam: 2 },
      { op: "material", objeto: "Objeto", color: rgba, metalico: mat.metalico, rugosidad: mat.rugosidad, alfa: mat.alfa },
      { op: "camara", nombre: "Camara", ubicacion: [3.2, -3.2, 2.2], mira_a: [0, 0, 0] },
      { op: "luz", nombre: "Sol", tipo: "sol", energia: 3 },
      { op: "mundo", color: [0.04, 0.05, 0.09, 1], fuerza: 1 },
    ],
    salidas,
  });
  return v.ok ? { ok: true, trabajo: v.trabajo } : { ok: false, motivo: v.motivos.join(" · ") };
}

/** La primera neurona de la cuenta con Blender instalado y perfil distinto de «ninguno». */
export function elegirNeurona(
  neuronas: { nombre: string; capabilities?: Record<string, unknown> }[],
): { ok: true; neurona: string } | { ok: false; motivo: string } {
  for (const n of neuronas) {
    const blender = (n.capabilities as { blender?: { instalado?: unknown; perfil?: unknown } } | undefined)?.blender;
    if (blender?.instalado === true && blender.perfil !== "ninguno") return { ok: true, neurona: n.nombre };
  }
  return { ok: false, motivo: "próximamente: ninguna de tus neuronas tiene Blender" };
}

