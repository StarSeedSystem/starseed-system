/**
 * Diseños del Mausbot de Astraura: los de fábrica (uno por cuerpo) y los propios, en la clave
 * `starseed.mausbot.disenos.v1`. Un SVG propio pasa por `sanearSvg` antes de guardarse. Datos
 * puros, sin `node:*`: los importa el cliente (CLAUDE.md, trampa 11).
 * Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0):
 * src/components/CursorAvatar.tsx (degradado por defecto) y MausBotCustomize.tsx (selector).
 */
import { CUERPOS_MAUSBOT, IDS_CUERPO_MAUSBOT, type CuerpoId } from "./cuerpos";
import { sanearSvg } from "@/lib/dock/iconos/sanear-svg";

export type OrigenDiseno = "fabrica" | "protomolecula" | "biblioteca" | "variacion";

export interface DisenoMausbot {
  id: string; nombre: string; cuerpo: CuerpoId | "svg"; svgCuerpo?: string;
  gradiente: [string, string, string];
  cara: { ojos: boolean; boca: boolean; mirada: boolean };
  tamano: number; rastro?: string; origen: OrigenDiseno; autor?: string;
}

/** Almacenamiento inyectable (localStorage del navegador o un doble de prueba). */
export interface AlmacenDisenos {
  getItem(clave: string): string | null; setItem(clave: string, valor: string): void; removeItem(clave: string): void;
}

export const CLAVE_DISENOS = "starseed.mausbot.disenos.v1";

/** Resultado de guardar o borrar un diseño propio. */
export type ResultadoDiseno = { ok: true } | { ok: false; motivo: string };

const mal = (motivo: string): ResultadoDiseno => ({ ok: false, motivo });

/** El degradado por defecto de OpenMausBot y la paleta Trinity (claro · base · oscuro). */
const GRADIENTES: [string, string, string][] = [
  ["#9FE6B5", "#3FAE6E", "#1C7A4C"], ["#66A3FF", "#007FFF", "#0052B3"], ["#6EE7B7", "#10B981", "#047857"],
  ["#FFE066", "#FFBF00", "#BF8F00"], ["#FF6B8A", "#DC143C", "#8A0D26"],
];

const CARA_COMPLETA = { ojos: true, boca: true, mirada: true };

const DE_FABRICA: DisenoMausbot[] = IDS_CUERPO_MAUSBOT.map((id, i) => ({
  id: `fabrica-${id}`, nombre: CUERPOS_MAUSBOT[id].nombre, cuerpo: id,
  gradiente: GRADIENTES[i % GRADIENTES.length], cara: { ...CARA_COMPLETA },
  tamano: 1, origen: "fabrica" as const,
}));

/** Uno por cuerpo de `CUERPOS_MAUSBOT`, con degradados de la paleta Trinity. */
export const DISENOS_FABRICA: DisenoMausbot[] = DE_FABRICA;

/** El diseño que se usa ante cualquier id desconocido: el cursor verde de fábrica. */
export const DISENO_POR_DEFECTO: DisenoMausbot = DE_FABRICA.find((d) => d.id === "fabrica-cursor") ?? DE_FABRICA[0];

function almacenNavegador(): AlmacenDisenos | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

function esGradienteValido(g: unknown): g is [string, string, string] {
  return Array.isArray(g) && g.length === 3 && g.every((c) => typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c));
}

function esPropioValido(x: unknown): x is DisenoMausbot {
  const d = x as Partial<DisenoMausbot> | null; const cara = d?.cara;
  return (
    !!d && typeof d.id === "string" && !!d.id && !d.id.startsWith("fabrica-") &&
    typeof d.nombre === "string" && !!d.nombre &&
    (d.cuerpo === "svg" ? typeof d.svgCuerpo === "string" : (IDS_CUERPO_MAUSBOT as readonly string[]).includes(d.cuerpo as string)) &&
    esGradienteValido(d.gradiente) &&
    !!cara && typeof cara.ojos === "boolean" && typeof cara.boca === "boolean" && typeof cara.mirada === "boolean" &&
    typeof d.tamano === "number" && Number.isFinite(d.tamano) && d.tamano > 0 && d.tamano <= 10 &&
    (d.origen === "protomolecula" || d.origen === "biblioteca" || d.origen === "variacion")
  );
}

function leerPropios(almacen: AlmacenDisenos | null): DisenoMausbot[] {
  if (!almacen) return [];
  try {
    const bruto = JSON.parse(almacen.getItem(CLAVE_DISENOS) ?? "[]") as unknown;
    return Array.isArray(bruto) ? bruto.filter((d) => esPropioValido(d)) : [];
  } catch { return []; }
}

export function listarDisenos(almacen?: AlmacenDisenos): DisenoMausbot[] {
  return [...DISENOS_FABRICA, ...leerPropios(almacen ?? almacenNavegador())];
}

export function guardarDiseno(diseno: DisenoMausbot, almacen?: AlmacenDisenos): ResultadoDiseno {
  const al = almacen ?? almacenNavegador();
  if (!al) return mal("No hay almacenamiento disponible para los diseños");
  if (typeof diseno?.id !== "string" || !diseno.id.trim()) return mal("El diseño necesita un id");
  if (diseno.id.startsWith("fabrica-")) return mal("Un diseño propio no puede usar un id de fábrica");
  if (typeof diseno.nombre !== "string" || !diseno.nombre.trim()) return mal("El diseño necesita un nombre");
  if (!esGradienteValido(diseno.gradiente)) return mal("El degradado necesita tres colores hex");
  const limpio: DisenoMausbot = { ...diseno };
  if (diseno.cuerpo === "svg") {
    const r = sanearSvg(diseno.svgCuerpo);
    if (!r.ok || r.quitados > 0) return mal(r.motivos[0] ?? "El SVG no se pudo sanear");
    limpio.svgCuerpo = r.svg;
  } else if (!(IDS_CUERPO_MAUSBOT as readonly string[]).includes(diseno.cuerpo)) {
    return mal("El cuerpo del diseño no es ninguno de los conocidos");
  }
  const propios = leerPropios(al).filter((d) => d.id !== limpio.id);
  al.setItem(CLAVE_DISENOS, JSON.stringify([...propios, limpio]));
  return { ok: true };
}

export function borrarDiseno(id: string, almacen?: AlmacenDisenos): ResultadoDiseno {
  const al = almacen ?? almacenNavegador();
  if (!al) return mal("No hay almacenamiento disponible para los diseños");
  if (id.startsWith("fabrica-")) return mal("Los diseños de fábrica no se pueden borrar");
  const propios = leerPropios(al);
  const restantes = propios.filter((d) => d.id !== id);
  if (restantes.length === propios.length) return mal("No hay ningún diseño propio con ese id");
  al.setItem(CLAVE_DISENOS, JSON.stringify(restantes));
  return { ok: true };
}

export function disenoPorId(id: string, almacen?: AlmacenDisenos): DisenoMausbot {
  const propios = leerPropios(almacen ?? almacenNavegador());
  return DISENOS_FABRICA.find((d) => d.id === id) ?? propios.find((d) => d.id === id) ?? DISENO_POR_DEFECTO;
}
