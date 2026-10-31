/**
 * Acción render_3d de Astraura — `architecture/blender-3d.md` §8 y §4.4. Módulo PURO:
 * sin Node, red ni procesos. La IA PROPONE un trabajo 3D como DATO (nunca código) y
 * el validador `validarTrabajo` decide; el guion de Blender lo genera la cola desde
 * el vocabulario, jamás desde texto libre.
 */
import { validarTrabajo, type Operacion, type Salida, type Trabajo3D } from "./trabajo";

export type RespuestaTrabajo = { ok: true; trabajo: Trabajo3D } | { ok: false; motivo: string };
export type RespuestaNeurona = { ok: true; neurona: string } | { ok: false; motivo: string };
export type NeuronaConCaps = { nombre: string; capabilities?: Record<string, unknown> };

const FORMAS: string[] = ["cubo", "esfera", "icosfera", "cilindro", "cono", "toro"];
const MATERIALES: Record<string, { metalico: number; rugosidad: number; alfa: number }> = {
  cristal: { metalico: 0, rugosidad: 0, alfa: 0.4 },
  metal: { metalico: 1, rugosidad: 0.25, alfa: 1 },
  mate: { metalico: 0, rugosidad: 0.9, alfa: 1 },
  brillante: { metalico: 0.2, rugosidad: 0.05, alfa: 1 },
};
const COLORES: Record<string, [number, number, number]> = {
  rojo: [0.87, 0.17, 0.15], naranja: [0.95, 0.5, 0.15], amarillo: [0.94, 0.8, 0.2], verde: [0.35, 0.7, 0.3],
  turquesa: [0.2, 0.72, 0.66], cian: [0.24, 0.75, 0.85], azul: [0.33, 0.45, 0.75], violeta: [0.55, 0.35, 0.8],
  morado: [0.45, 0.25, 0.7], rosa: [0.93, 0.5, 0.65], marron: [0.5, 0.33, 0.2], negro: [0.04, 0.04, 0.06],
  blanco: [0.94, 0.94, 0.95], gris: [0.55, 0.55, 0.58], dorado: [0.83, 0.68, 0.22], plateado: [0.75, 0.77, 0.8],
};
const MOTIVO_NEURONAS = "Próximamente: ninguna de tus neuronas tiene Blender.";

function sinTildes(s: string): string { return s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function colorDe(v: unknown): [number, number, number, number] | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) {
    const n = Number.parseInt(t.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  const c = COLORES[sinTildes(t)];
  return c ? [c[0], c[1], c[2], 1] : null;
}
function enteroDe(v: unknown): number | null {
  if (v === undefined) return null;
  return typeof v === "number" && Number.isInteger(v) && v >= 16 && v <= 4096 ? v : NaN;
}
export function elegirNeurona(neuronas: NeuronaConCaps[]): RespuestaNeurona {
  for (const n of neuronas) {
    const caps = n.capabilities?.blender;
    if (!caps || typeof caps !== "object" || Array.isArray(caps)) continue;
    const b = caps as { instalado?: unknown; perfil?: unknown };
    if (b.instalado !== true || b.perfil === "ninguno") continue;
    return { ok: true, neurona: String(n.nombre) };
  }
  return { ok: false, motivo: MOTIVO_NEURONAS };
}

export function trabajoDeAccion(args: Record<string, unknown>): RespuestaTrabajo {
  if (args?.trabajo !== undefined && args?.trabajo !== null) {
    if (typeof args.trabajo !== "object" || Array.isArray(args.trabajo)) return { ok: false, motivo: "El campo «trabajo» debe ser un objeto (un Trabajo3D del contrato blender-3d)." };
    const r = validarTrabajo(args.trabajo);
    return r.ok ? { ok: true, trabajo: r.trabajo } : { ok: false, motivo: `No acepté ese trabajo 3D: ${r.motivos.join("; ")}.` };
  }
  const forma = typeof args?.forma === "string" ? sinTildes(args.forma) : "";
  if (!FORMAS.includes(forma)) return { ok: false, motivo: `Forma desconocida «${String(args?.forma ?? "")}»: usa cubo, esfera, icosfera, cilindro, cono o toro.` };
  const color = args?.color === undefined ? [0.8, 0.8, 0.8, 1] : colorDe(args.color);
  if (!color) return { ok: false, motivo: `Color no válido «${String(args?.color ?? "")}»: usa #rrggbb (p. ej. #7aa2ff) o un nombre en español (rojo, azul, marrón…).` };
  const material = args?.material === undefined ? MATERIALES.mate : MATERIALES[sinTildes(String(args.material))];
  if (!material) return { ok: false, motivo: `Material desconocido «${String(args?.material ?? "")}»: usa cristal, metal, mate o brillante.` };
  const ancho = enteroDe(args?.ancho) ?? 1280, alto = enteroDe(args?.alto) ?? 720;
  if (Number.isNaN(ancho)) return { ok: false, motivo: `ancho no válido (${String(args?.ancho ?? "")}): debe ser un número entero entre 16 y 4096.` };
  if (Number.isNaN(alto)) return { ok: false, motivo: `alto no válido (${String(args?.alto ?? "")}): debe ser un número entero entre 16 y 4096.` };
  const salida = args?.salida === undefined ? "png" : sinTildes(String(args.salida));
  if (salida !== "png" && salida !== "glb" && salida !== "ambos") return { ok: false, motivo: `salida no válida «${String(args?.salida ?? "")}»: usa png, glb o ambos.` };
  const motor = args?.motor === undefined ? "cycles-cpu" : sinTildes(String(args.motor));
  if (!["workbench", "cycles-cpu", "cycles-gpu", "eevee"].includes(motor)) return { ok: false, motivo: `motor no válido «${String(args?.motor ?? "")}»: usa workbench, cycles-cpu, cycles-gpu o eevee.` };
  const escena: Operacion[] = [
    { op: "primitiva", tipo: forma, nombre: "objeto", tam: 1 },
    { op: "material", objeto: "objeto", color, metalico: material.metalico, rugosidad: material.rugosidad, alfa: material.alfa },
    { op: "camara", nombre: "camara", ubicacion: [0, -3.4, 1.8], mira_a: [0, 0, 0] },
    { op: "luz", nombre: "sol", tipo: "sol", energia: 4 },
    { op: "mundo", color: [0.04, 0.04, 0.07, 1], fuerza: 1 },
  ];
  const salidas: Salida[] = [];
  if (salida !== "glb") salidas.push({ tipo: "render_png", ancho, alto, muestras: 32, motor });
  if (salida !== "png") salidas.push({ tipo: "exportar_glb" });
  const r = validarTrabajo({ v: 1, titulo: `Render 3D · ${forma}`, calidad: "normal", ambito: "personal", origen: "astraura", quien: "agente", escena, salidas });
  return r.ok ? { ok: true, trabajo: r.trabajo } : { ok: false, motivo: r.motivos.join("; ") };
}
