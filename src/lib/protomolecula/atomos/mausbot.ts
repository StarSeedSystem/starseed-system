/**
 * Protomolécula · Átomo «Mausbot» (MBT1027L): diseña cuerpo, degradado de tres colores y cara
 * del cursor-mascota de Astraura, y entrega un `DisenoMausbot` que se guarda con `guardarDiseno`
 * (origen «protomolecula»). El SVG propio llega POR FUERA de los parámetros (el registro no tiene
 * tipo texto) y pasa por `sanearSvg` antes de guardarse. Datos puros, sin `node:*`: lo importa
 * el cliente (CLAUDE.md, trampa 11).
 * Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0):
 * shared/mascot-bodies.ts (cuerpos) y MausBotCustomize.tsx (selector de diseño).
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import { CUERPOS_MAUSBOT, IDS_CUERPO_MAUSBOT, type CuerpoId } from "@/lib/mausbot/cuerpos";
import { guardarDiseno, type AlmacenDisenos, type DisenoMausbot } from "@/lib/mausbot/disenos";
import { sanearSvg } from "@/lib/dock/iconos/sanear-svg";

/** Paletas de la casa (claro · base · oscuro): las mismas de los diseños de fábrica. */
export const PALETAS_MAUSBOT: Record<string, [string, string, string]> = {
  "verde menta": ["#9FE6B5", "#3FAE6E", "#1C7A4C"],
  "azul Trinity": ["#66A3FF", "#007FFF", "#0052B3"],
  esmeralda: ["#6EE7B7", "#10B981", "#047857"],
  "ámbar Logic": ["#FFE066", "#FFBF00", "#BF8F00"],
  "carmesí Anchor": ["#FF6B8A", "#DC143C", "#8A0D26"],
};

const PALETA_DEFECTO = "verde menta";

export const MAUSBOT: DefinicionAtomo = {
  herramientaId: "mausbot-astraura",
  nombre: "Mausbot de Astraura",
  categoria: "ia",
  integracion: "iframe-aislado",
  control: "total",
  parametros: [
    { id: "cuerpo", nombre: "Cuerpo", tipo: "opcion", opciones: [...IDS_CUERPO_MAUSBOT, "svg"], defecto: "cursor", sinonimos: ["forma", "silueta"] },
    { id: "paleta", nombre: "Paleta", tipo: "opcion", opciones: Object.keys(PALETAS_MAUSBOT), defecto: PALETA_DEFECTO, sinonimos: ["colores", "degradado"] },
    { id: "ojos", nombre: "Ojos", tipo: "booleano", defecto: true, sinonimos: ["ojos puestos"] },
    { id: "boca", nombre: "Boca", tipo: "booleano", defecto: true, sinonimos: ["boca puesta"] },
    { id: "mirada", nombre: "Mirada", tipo: "booleano", defecto: true, sinonimos: ["mirar al cursor"] },
    { id: "tamano", nombre: "Tamaño", tipo: "numero", min: 0.5, max: 3, paso: 0.1, unidad: "x", defecto: 1, sinonimos: ["escala", "tamaño del bot"] },
  ],
  entradas: ["svg"],
  salidas: ["diseno-mausbot"],
  ficha: {
    web: "https://github.com/milind-soni/OpenMausBot",
    repo: "https://github.com/milind-soni/OpenMausBot",
    licencia: "Apache-2.0",
  },
};

export interface EntradaDisenoMausbot {
  /** Valores vivos de los parámetros del átomo; falta lo que toque al defecto. */
  valores: Record<string, ValorParametro | undefined>;
  /** SVG propio del cuerpo: llega por fuera de los parámetros y se sanea antes de guardar. */
  svgCuerpo?: string;
  /** Id y nombre del diseño propio; si faltan se derivan del cuerpo. */
  id?: string;
  nombre?: string;
  /** Quién lo diseñó (perfil, cuenta o agente). */
  autor?: string;
}

/** La salida del átomo: un diseño listo para guardar, o el motivo por el que no. */
export type SalidaDiseno = { ok: true; diseno: DisenoMausbot } | { ok: false; motivo: string };

/** El cuerpo elegido, o el de fábrica si el valor no es ninguno conocido. */
export function cuerpoDe(valor: unknown): CuerpoId | "svg" {
  if (typeof valor === "string" && (valor === "svg" || (IDS_CUERPO_MAUSBOT as readonly string[]).includes(valor))) {
    return valor as CuerpoId | "svg";
  }
  return "cursor";
}

/** El degradado de la paleta elegida, o el defecto si el valor no es ninguna paleta. */
export function paletaDe(valor: unknown): [string, string, string] {
  const elegida = typeof valor === "string" ? valor : "";
  return PALETAS_MAUSBOT[elegida] ?? PALETAS_MAUSBOT[PALETA_DEFECTO];
}

/** Un booleano de parámetro con el defecto (puesto) cuando falta o no es booleano. */
function booleanoDe(valores: Record<string, ValorParametro | undefined>, id: string): boolean {
  const v = valores[id];
  return typeof v === "boolean" ? v : true;
}

/** Construye el diseño a partir de los parámetros; no guarda nada (puro). */
export function construirDiseno(e: EntradaDisenoMausbot): SalidaDiseno {
  const v = e.valores ?? {};
  const cuerpo = cuerpoDe(v["cuerpo"]);
  const diseno: DisenoMausbot = {
    id: e.id?.trim() || `protomolecula-${cuerpo}`,
    nombre: e.nombre?.trim() || `Mausbot ${cuerpo === "svg" ? "propio" : CUERPOS_MAUSBOT[cuerpo].nombre}`,
    cuerpo,
    gradiente: paletaDe(v["paleta"]),
    cara: { ojos: booleanoDe(v, "ojos"), boca: booleanoDe(v, "boca"), mirada: booleanoDe(v, "mirada") },
    tamano: typeof v["tamano"] === "number" && Number.isFinite(v["tamano"]) ? Math.max(0.5, Math.min(3, v["tamano"])) : 1,
    origen: "protomolecula",
    ...(e.autor?.trim() ? { autor: e.autor.trim() } : {}),
  };
  if (cuerpo === "svg") {
    const r = sanearSvg(e.svgCuerpo);
    if (!r.ok || r.quitados > 0) {
      return { ok: false, motivo: r.motivos[0] ?? "El SVG propio no se pudo sanear" };
    }
    diseno.svgCuerpo = r.svg;
  }
  return { ok: true, diseno };
}

/** Construye y guarda con `guardarDiseno` (origen «protomolecula»). */
export function guardarDisenoMausbot(e: EntradaDisenoMausbot, almacen?: AlmacenDisenos): SalidaDiseno {
  const r = construirDiseno(e);
  if (!r.ok) return r;
  const g = guardarDiseno(r.diseno, almacen);
  return g.ok ? r : { ok: false, motivo: g.motivo };
}
