/**
 * Astraura · render 3D como DATO — `architecture/blender-3d.md` §4.4 y §8.
 * La IA PROPONE un trabajo (forma corta o `Trabajo3D` completo) y el validador decide.
 * Puro: sin Node, red ni evaluación dinámica; nunca escribe código de Blender.
 */
import { validarTrabajo, type Salida, type Trabajo3D } from "./trabajo";

const FORMAS = new Set(["cubo", "esfera", "icosfera", "cilindro", "cono", "toro"]);
const SALIDAS = new Set(["png", "glb", "ambos"]);
const MOTORES = new Set(["workbench", "cycles-cpu", "cycles-gpu", "eevee"]);

/** Colores con nombre en español (se aceptan con o sin acento). */
const COLORES: Record<string, string> = {
  rojo: "#e4572e", verde: "#3fae6a", azul: "#3f7fe0", amarillo: "#f2c94c",
  naranja: "#f2994a", morado: "#8e6cd6", violeta: "#8e6cd6", rosa: "#e87aa6",
  blanco: "#f5f5f5", negro: "#101014", gris: "#9aa0a6", cian: "#4dd0e1",
  turquesa: "#2ec4b6", celeste: "#7ec8e3", dorado: "#d4a017", oro: "#d4a017",
  plata: "#c0c0c0", marron: "#7a5230", "marrón": "#7a5230", beis: "#d8c3a5",
};

/** Materiales de la forma corta: color de superficie ya traducido al vocabulario. */
const MATERIALES: Record<string, { metalico: number; rugosidad: number; alfa: number }> = {
  cristal: { metalico: 0, rugosidad: 0.05, alfa: 0.35 },
  metal: { metalico: 1, rugosidad: 0.25, alfa: 1 },
  mate: { metalico: 0, rugosidad: 0.9, alfa: 1 },
  brillante: { metalico: 0.15, rugosidad: 0.1, alfa: 1 },
};

type Color = [number, number, number, number];
type Medida = { ok: true; valor: number } | { ok: false; motivo: string };
type ResultadoTrabajo = { ok: true; trabajo: Trabajo3D } | { ok: false; motivo: string };

export function elegirNeurona(
  neuronas: { nombre: string; capabilities?: Record<string, unknown> }[],
): { ok: true; neurona: string } | { ok: false; motivo: string } {
  for (const n of neuronas) {
    const blender = n.capabilities?.blender;
    if (typeof blender !== "object" || blender === null) continue;
    const cap = blender as Record<string, unknown>;
    if (cap.instalado === true && cap.perfil !== "ninguno") return { ok: true, neurona: n.nombre };
  }
  return { ok: false, motivo: "próximamente: ninguna de tus neuronas tiene Blender" };
}

export function trabajoDeAccion(args: Record<string, unknown>): ResultadoTrabajo {
  if (args.trabajo !== undefined) {
    const r = validarTrabajo(args.trabajo);
    return r.ok ? r : { ok: false, motivo: r.motivos.join("; ") };
  }
  return trabajoCorto(args);
}

function aRgba(valor: unknown): Color | null {
  if (valor === undefined || valor === null || valor === "") return [0.8, 0.8, 0.8, 1];
  if (typeof valor !== "string") return null;
  const texto = valor.trim().toLowerCase();
  const hex = texto.startsWith("#") ? texto : COLORES[texto];
  if (!hex || !/^#[0-9a-f]{6}$/.test(hex)) return null;
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (x: number) => Math.round((x / 255) * 10000) / 10000;
  return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255), 1];
}

function medida(valor: unknown, porDefecto: number): Medida {
  if (valor === undefined || valor === null || valor === "") return { ok: true, valor: porDefecto };
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 16 || valor > 4096) {
    return { ok: false, motivo: "debe ser un entero entre 16 y 4096 píxeles" };
  }
  return { ok: true, valor };
}

function texto(valor: unknown, porDefecto: string): string {
  if (valor === undefined || valor === null || valor === "") return porDefecto;
  return typeof valor === "string" ? valor.trim().toLowerCase() : "";
}

function trabajoCorto(args: Record<string, unknown>): ResultadoTrabajo {
  const forma = texto(args.forma, "");
  if (!forma) return { ok: false, motivo: "Indica una forma o un trabajo completo." };
  if (!FORMAS.has(forma)) {
    return { ok: false, motivo: `Forma desconocida: «${forma}». Usa cubo, esfera, icosfera, cilindro, cono o toro.` };
  }
  const color = aRgba(args.color);
  if (!color) return { ok: false, motivo: `Color no válido: «${String(args.color)}». Usa #rrggbb o un nombre en español.` };
  const nombreMaterial = texto(args.material, "mate");
  const material = MATERIALES[nombreMaterial];
  if (!material) {
    return { ok: false, motivo: `Material desconocido: «${String(args.material)}». Usa cristal, metal, mate o brillante.` };
  }
  const ancho = medida(args.ancho, 1280);
  if (!ancho.ok) return { ok: false, motivo: `ancho: ${ancho.motivo}` };
  const alto = medida(args.alto, 720);
  if (!alto.ok) return { ok: false, motivo: `alto: ${alto.motivo}` };
  const salida = texto(args.salida, "png");
  if (!SALIDAS.has(salida)) {
    return { ok: false, motivo: `Salida desconocida: «${String(args.salida)}». Usa png, glb o ambos.` };
  }
  const motor = texto(args.motor, "cycles-cpu");
  if (!MOTORES.has(motor)) {
    return { ok: false, motivo: `Motor desconocido: «${String(args.motor)}». Usa workbench, cycles-cpu, cycles-gpu o eevee.` };
  }
  const salidas: Salida[] = [];
  if (salida !== "glb") salidas.push({ tipo: "render_png", ancho: ancho.valor, alto: alto.valor, muestras: 32, motor });
  if (salida !== "png") salidas.push({ tipo: "exportar_glb" });
  const bruto = {
    v: 1, titulo: `Render 3D de ${forma}`, calidad: "normal", ambito: "personal", origen: "astraura", quien: "agente",
    escena: [
      { op: "primitiva", tipo: forma, nombre: "Objeto", tam: 1 },
      { op: "material", objeto: "Objeto", color, metalico: material.metalico, rugosidad: material.rugosidad, alfa: material.alfa },
      { op: "camara", nombre: "Camara", ubicacion: [3.4, 2.6, 4.4], mira_a: [0, 0, 0], lente_mm: 50 },
      { op: "luz", nombre: "Sol", tipo: "sol", energia: 3.5, rotacion: [45, 0, 30] },
      { op: "mundo", color: [0.05, 0.06, 0.1, 1], fuerza: 1 },
    ],
    salidas,
  };
  const r = validarTrabajo(bruto);
  return r.ok ? r : { ok: false, motivo: r.motivos.join("; ") };
}
