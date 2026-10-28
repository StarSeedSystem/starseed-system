/**
 * Protomolécula · Átomo «Mausbot» (1027L): diseña el cuerpo, el degradado y la cara del
 * cursor de la personalidad activa. La salida es un `DisenoMausbot` que se guarda con
 * `guardarDiseno` (origen «protomolecula»), así que viaja como molécula y se comparte.
 *
 * Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0):
 * shared/mascot-bodies.ts (cuerpos) y src/components/MausBotCustomize.tsx (selector).
 * Datos puros, sin `node:*`: los importa el cliente (CLAUDE.md, trampa 11).
 */
import type { DefinicionAtomo, Parametro } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import { CUERPOS_MAUSBOT, IDS_CUERPO_MAUSBOT, type CuerpoId } from "@/lib/mausbot/cuerpos";
import {
  guardarDiseno,
  type AlmacenDisenos,
  type DisenoMausbot,
  type ResultadoDiseno,
} from "@/lib/mausbot/disenos";

/** Degradados de la paleta Trinity: [claro, base, oscuro]. */
export const PALETAS_MAUSBOT: Record<string, [string, string, string]> = {
  menta: ["#9FE6B5", "#3FAE6E", "#1C7A4C"],
  azul: ["#66A3FF", "#007FFF", "#0052B3"],
  ambar: ["#FFE066", "#FFBF00", "#BF8F00"],
  coral: ["#FF6B8A", "#DC143C", "#8A0D26"],
  violeta: ["#C4B5FD", "#8B5CF6", "#5B21B6"],
};

/** Lo que llega para construir un diseño; todo es opcional y cae en un valor sensato. */
export interface EntradaMausbot {
  id?: string;
  nombre?: string;
  cuerpo?: CuerpoId | "svg";
  svgCuerpo?: string;
  gradiente?: [string, string, string];
  paleta?: string;
  cara?: { ojos?: boolean; boca?: boolean; mirada?: boolean };
  tamano?: number;
}

const PARAMETRO_CUERPO: Parametro = {
  id: "cuerpo",
  nombre: "Cuerpo",
  tipo: "opcion",
  opciones: [...IDS_CUERPO_MAUSBOT, "svg"],
  defecto: "cursor",
  sinonimos: ["forma", "figura", "silueta"],
};

export const MAUSBOT: DefinicionAtomo = {
  herramientaId: "mausbot",
  nombre: "Mausbot",
  categoria: "imagen",
  integracion: "libreria-js",
  control: "total",
  parametros: [
    PARAMETRO_CUERPO,
    {
      id: "paleta",
      nombre: "Paleta del degradado",
      tipo: "opcion",
      opciones: Object.keys(PALETAS_MAUSBOT),
      defecto: "menta",
      sinonimos: ["degradado", "colores", "tono"],
    },
    { id: "ojos", nombre: "Ojos", tipo: "booleano", defecto: true, sinonimos: ["mirada visible"] },
    { id: "boca", nombre: "Boca", tipo: "booleano", defecto: true, sinonimos: ["sonrisa"] },
    { id: "mirada", nombre: "Mirada", tipo: "booleano", defecto: true, sinonimos: ["seguir el cursor"] },
    {
      id: "tamano",
      nombre: "Tamaño",
      tipo: "numero",
      min: 0.5,
      max: 4,
      paso: 0.1,
      unidad: "x",
      defecto: 1,
      sinonimos: ["escala", "grosor"],
    },
  ],
  entradas: [
    "cuerpo (de fábrica o SVG propio)",
    "degradado de 3 colores",
    "cara: ojos, boca y mirada",
    "tamaño",
  ],
  salidas: ["diseño de Mausbot"],
  ficha: {
    repo: "https://github.com/milind-soni/OpenMausBot",
    licencia: "Apache-2.0 (piezas de referencia; no se compila)",
  },
};

const booleano = (valor: ValorParametro | undefined, porDefecto: boolean): boolean =>
  typeof valor === "boolean" ? valor : porDefecto;

export function entradaDesdeValores(
  valores: Record<string, ValorParametro | undefined>,
): EntradaMausbot {
  const paleta = typeof valores.paleta === "string" && PALETAS_MAUSBOT[valores.paleta]
    ? valores.paleta
    : "menta";
  return {
    cuerpo: (typeof valores.cuerpo === "string" ? valores.cuerpo : "cursor") as EntradaMausbot["cuerpo"],
    paleta,
    cara: {
      ojos: booleano(valores.ojos, true),
      boca: booleano(valores.boca, true),
      mirada: booleano(valores.mirada, true),
    },
    tamano: typeof valores.tamano === "number" && Number.isFinite(valores.tamano) ? valores.tamano : 1,
  };
}

const esCuerpo = (valor: unknown): valor is CuerpoId =>
  typeof valor === "string" && (IDS_CUERPO_MAUSBOT as readonly string[]).includes(valor);

const acotarTamano = (valor: number | undefined): number => {
  const n = typeof valor === "number" && Number.isFinite(valor) ? valor : 1;
  return Math.min(4, Math.max(0.5, n));
};

const gradienteDe = (entrada: EntradaMausbot): [string, string, string] =>
  entrada.gradiente ?? PALETAS_MAUSBOT[entrada.paleta ?? ""] ?? PALETAS_MAUSBOT.menta;

export function construirDisenoMausbot(entrada: EntradaMausbot): DisenoMausbot {
  const cuerpo: CuerpoId | "svg" = entrada.cuerpo === "svg"
    ? "svg"
    : esCuerpo(entrada.cuerpo) ? entrada.cuerpo : "cursor";
  const diseno: DisenoMausbot = {
    id: entrada.id?.trim() || `pm-mausbot-${cuerpo}`,
    nombre: entrada.nombre?.trim()
      || (cuerpo === "svg" ? "Mausbot propio" : `Mausbot ${CUERPOS_MAUSBOT[cuerpo].nombre}`),
    cuerpo,
    gradiente: gradienteDe(entrada),
    cara: {
      ojos: entrada.cara?.ojos ?? true,
      boca: entrada.cara?.boca ?? true,
      mirada: entrada.cara?.mirada ?? true,
    },
    tamano: acotarTamano(entrada.tamano),
    origen: "protomolecula",
  };
  if (cuerpo === "svg") diseno.svgCuerpo = entrada.svgCuerpo ?? "";
  return diseno;
}

export function guardarDisenoMausbot(
  entrada: EntradaMausbot,
  almacen?: AlmacenDisenos,
): ResultadoDiseno {
  return guardarDiseno(construirDisenoMausbot(entrada), almacen);
}
