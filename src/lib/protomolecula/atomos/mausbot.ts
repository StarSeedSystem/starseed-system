/**
 * Protomolécula · Átomo «Mausbot» (MBT1027L): diseñar el cuerpo, el degradado y la cara del
 * cursor con cara de Astraura, y guardar el resultado como propio en `starseed.mausbot.disenos.v1`.
 *
 * Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0):
 * src/components/MausBotCustomize.tsx (selector de cuerpo, degradado y cara).
 * Contrato: architecture/mausbot-astraura.md §6.
 */
import type { DefinicionAtomo } from "../registro-atomos";
import { IDS_CUERPO_MAUSBOT, type CuerpoId } from "@/lib/mausbot/cuerpos";
import { guardarDiseno, type AlmacenDisenos, type DisenoMausbot, type ResultadoDiseno } from "@/lib/mausbot/disenos";

/** Paleta Trinity · claro · base · oscuro, una por familia del OS. */
export const PALETAS_GRADIENTE: { id: string; uv: [string, string, string] }[] = [
  { id: "verde Ascendo", uv: ["#9FE6B5", "#3FAE6E", "#1C7A4C"] },
  { id: "azul Zenith", uv: ["#66A3FF", "#007FFF", "#0052B3"] },
  { id: "esmeralda Horizon", uv: ["#6EE7B7", "#10B981", "#047857"] },
  { id: "ámbar Logic", uv: ["#FFE066", "#FFBF00", "#BF8F00"] },
  { id: "carmesí Anchor", uv: ["#FF6B8A", "#DC143C", "#8A0D26"] },
];

export const MAUSBOT = definirMausbot();

/** Controles que acepta el átomo (los valores de sus parámetros + nombre e SVG propio). */
export interface ControlesMausbot {
  nombre: string;
  cuerpo: CuerpoId | "svg";
  svgCuerpo?: string;
  gradiente: string | [string, string, string];
  cara: { ojos: boolean; boca: boolean; mirada: boolean };
  tamano: number;
}

export function definirMausbot(): DefinicionAtomo {
  return {
    herramientaId: "mausbot",
    nombre: "Mausbot de Astraura",
    categoria: "ia",
    integracion: "iframe-aislado",
    control: "total",
    parametros: parametrosMausbot(),
    entradas: ["cuerpo de fábrica o SVG propio saneado", "degradado de 3 colores", "cara: ojos, boca y mirada"],
    salidas: ["DisenoMausbot guardado con origen «protomolecula» en starseed.mausbot.disenos.v1"],
    ficha: {
      web: "https://github.com/milind-soni/OpenMausBot",
      licencia: "Apache-2.0",
    },
  };
}

/** Parámetros del átomo: cuerpo, booleans de cara y tamaño. El SVG propio viaja como entrada. */
function parametrosMausbot(): DefinicionAtomo["parametros"] {
  const cuerpos = [...IDS_CUERPO_MAUSBOT, "svg"];
  return [
    {
      id: "cuerpo", nombre: "Cuerpo", tipo: "opcion", opciones: cuerpos, defecto: "cursor",
      sinonimos: ["forma del mausbot", "mascota"],
    },
    {
      id: "gradiente", nombre: "Degradado", tipo: "opcion",
      opciones: PALETAS_GRADIENTE.map((p) => p.id), defecto: "carmesí Anchor",
      sinonimos: ["colores", "paleta"],
    },
    { id: "ojos", nombre: "Ojos", tipo: "booleano", defecto: true, sinonimos: ["carita con ojos"] },
    { id: "boca", nombre: "Boca", tipo: "booleano", defecto: true, sinonimos: ["boca animada"] },
    { id: "mirada", nombre: "Mirada", tipo: "booleano", defecto: true, sinonimos: ["mirar al puntero"] },
    { id: "tamano", nombre: "Tamaño", tipo: "numero", min: 0.5, max: 10, paso: 0.1, defecto: 1, sinonimos: ["grande", "escala"] },
  ];
}

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

function esGradienteValido(g: unknown): g is [string, string, string] {
  return Array.isArray(g) && g.length === 3 && g.every((c) => typeof c === "string" && HEX_RE.test(c));
}

/** Un nombre de paleta o una terna hex directa: la terna directa se acepta si es válida. */
export function gradienteDeId(nombreOPaleta: string | [string, string, string]): [string, string, string] | null {
  if (Array.isArray(nombreOPaleta)) return esGradienteValido(nombreOPaleta) ? nombreOPaleta : null;
  const p = PALETAS_GRADIENTE.find((x) => x.id === nombreOPaleta);
  return p ? [...p.uv] : null;
}

function slug(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "sin-nombre";
}

/** Valida y compone un `DisenoMausbot` propio con origen «protomolecula». Puro, sin I/O. */
export function construirDiseno(c: ControlesMausbot): { ok: true; diseno: DisenoMausbot } | { ok: false; motivo: string } {
  const nombre = typeof c?.nombre === "string" ? c.nombre.trim() : "";
  if (!nombre) return { ok: false, motivo: "El diseño necesita un nombre" };
  if (c.cuerpo === "svg" && typeof c.svgCuerpo !== "string") {
    return { ok: false, motivo: "Un diseño de cuerpo svg necesita su SVG" };
  }
  if (c.cuerpo !== "svg" && !(IDS_CUERPO_MAUSBOT as readonly string[]).includes(c.cuerpo)) {
    return { ok: false, motivo: "El cuerpo del diseño no es ninguno de los conocidos" };
  }
  const gradiente = gradienteDeId(c.gradiente);
  if (!gradiente) return { ok: false, motivo: "El degradado no es una paleta ni una terna hex válida" };
  const cara = c.cara ?? { ojos: true, boca: true, mirada: true };
  if (typeof cara.ojos !== "boolean" || typeof cara.boca !== "boolean" || typeof cara.mirada !== "boolean") {
    return { ok: false, motivo: "La cara necesita ojos, boca y mirada como booleanos" };
  }
  const tamano = typeof c.tamano === "number" && Number.isFinite(c.tamano) && c.tamano > 0 ? c.tamano : 1;
  const diseno: DisenoMausbot = {
    id: `pm-${slug(c.cuerpo === "svg" ? "svg" : c.cuerpo)}-${slug(nombre)}`,
    nombre, cuerpo: c.cuerpo, svgCuerpo: c.cuerpo === "svg" ? c.svgCuerpo : undefined,
    gradiente, cara: { ojos: cara.ojos, boca: cara.boca, mirada: cara.mirada },
    tamano: Math.min(tamano, 10), origen: "protomolecula",
  };
  return { ok: true, diseno };
}

/** Compone y guarda en «protomolecula»: pasa por `guardarDiseno` (sanea el SVG antes de nada). */
export function guardarDisenoMausbot(c: ControlesMausbot, almacen?: AlmacenDisenos): ResultadoDiseno {
  const b = construirDiseno(c);
  if (!b.ok) return b;
  return guardarDiseno(b.diseno, almacen);
}
