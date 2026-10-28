/**
 * Protomolécula · Átomo «Fondo con shaders» (FSH1018O · Ola 1018F · architecture/fondos-shaders.md §2 y §6).
 * Plan PURO que convierte los parámetros en un `SetFondo` (catálogo, reloj e id inyectados; sin GPU ni red).
 * `base: null` = el fondo actual (Spline) sigue de base. Cámara solo con permiso explícito y nunca compartida. */
import type { DefinicionAtomo, Parametro } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import type { BackgroundLayer, DifusionConfig } from "@/lib/appearance/background-layers";
import type { ShaderCatalog, ShaderCatalogEntry } from "@/lib/appearance/catalogo-shaders";
import { exportarSet, type OpcionesSet, type SetFondo } from "@/lib/appearance/sets-fondo";
export const EFECTOS_FONDO = ["Aurora", "MeshGradient", "Nebula", "Glass", "FilmGrain", "SolidColor", "LinearGradient"] as const;
export const MODOS_DIFUSION = ["ninguna", "transparente", "desenfoque", "blanco", "negro", "tono"] as const;
export const AMBITOS_FONDO = ["cuenta", "perfil", "app", "pagina", "seccion", "entidad"] as const;
export type ModoDifusion = Exclude<(typeof MODOS_DIFUSION)[number], "ninguna">;
export type AmbitoFondoAtomo = (typeof AMBITOS_FONDO)[number];
const EFECTOS_CAMARA = ["WebcamTexture", "ObjectTracker"];
const TRANSFORM = { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 };
export const FONDO_SHADER: DefinicionAtomo = {
  herramientaId: "shaders",
  nombre: "Fondo con shaders",
  categoria: "imagen", // un fondo es imagen; el catálogo de átomos no tiene categoría «fondos»
  integracion: "libreria-js", // el paquete MIT ya vive en el bundle y se carga en cliente con import dinámico
  control: "total",
  parametros: [
    { id: "efecto", nombre: "Efecto", tipo: "opcion", opciones: [...EFECTOS_FONDO], defecto: "Aurora", sinonimos: ["efecto shader", "fondo shader"] },
    { id: "props", nombre: "Propiedades del catálogo", tipo: "opcion", opciones: ["del catálogo", "personalizadas"], defecto: "del catálogo", sinonimos: ["propiedades", "ajustes del efecto"] },
    { id: "capas", nombre: "Capas", tipo: "entero", min: 1, max: 8, paso: 1, defecto: 1, sinonimos: ["número de capas", "cuántos shaders"] },
    { id: "difusion", nombre: "Difusión", tipo: "opcion", opciones: [...MODOS_DIFUSION], defecto: "ninguna", sinonimos: ["difuminado", "desenfoque", "velo"] },
    { id: "alcance", nombre: "Alcance", tipo: "opcion", opciones: [...AMBITOS_FONDO], defecto: "perfil", sinonimos: ["dónde se aplica", "ámbito"] },
  ],
  entradas: [],
  salidas: ["json"], // el `.starseed-fondo.json` que se guarda en la Biblioteca o se aplica
  ficha: { web: "https://github.com/shader-effects-inc/shaders", repo: "shader-effects-inc/shaders", licencia: "MIT" },
};
export interface EntradaFondo {
  catalogo: ShaderCatalog; // el de `cargarCatalogo` (versión instalada): fija efectos y props conocidos
  valores?: Record<string, ValorParametro | undefined>;
  props?: Record<string, unknown>; // props propias; mandan sobre las del catálogo
  nombre?: string;
  autor?: string;
  id?: string;
  base?: string | null; // motor base; null = el actual (Spline), nunca se pisa por defecto
  ahora?: () => Date;
  crearId?: () => string;
  biblioteca?: readonly string[];
  compartido?: boolean; // grupo, página, publicación: sin cámara ni archivos solo de este aparato
  permisoCamara?: boolean; // permiso explícito de la persona para WebcamTexture / ObjectTracker
}
export type PlanFondo =
  | { ok: true; set: SetFondo; json: string; archivo: string; alcance: AmbitoFondoAtomo; avisos: string[] }
  | { ok: false; motivos: string[]; avisos: string[] };
const parametro = (id: string): Parametro | undefined => FONDO_SHADER.parametros.find((p) => p.id === id);
const opcionDe = (valores: EntradaFondo["valores"], id: string): string => {
  const p = parametro(id), v = valores?.[id];
  return typeof v === "string" && p?.opciones?.includes(v) ? v : String(p?.defecto ?? "");
};
const efectoDe = (valores: EntradaFondo["valores"]): string => (typeof valores?.efecto === "string" && valores.efecto.trim() ? valores.efecto.trim() : "Aurora");
const enteroDe = (valores: EntradaFondo["valores"], id: string): number => {
  const v = valores?.[id];
  return typeof v === "number" && Number.isFinite(v) ? Math.min(8, Math.max(1, Math.round(v))) : Number(parametro(id)?.defecto ?? 1);
};
/** Entrada del catálogo por nombre, recorriendo todas sus categorías. */
export function efectoDelCatalogo(catalogo: ShaderCatalog, efecto: string): ShaderCatalogEntry | undefined {
  for (const lista of Object.values(catalogo)) {
    const encontrado = lista.find((e) => e.name === efecto);
    if (encontrado) return encontrado;
  }
  return undefined;
}
/** Props por defecto que declara el catálogo instalado (solo las que traen `default`). */
export function propsDelCatalogo(entrada: ShaderCatalogEntry): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [clave, meta] of Object.entries(entrada.props ?? {})) {
    if (meta && typeof meta === "object" && "default" in meta) {
      const valor = (meta as { default?: unknown }).default;
      if (valor !== undefined) salida[clave] = valor;
    }
  }
  return salida;
}
function capaShader(indice: number, efecto: string, props: Record<string, unknown>): BackgroundLayer {
  return { id: `shader-${indice}`, kind: "shader", name: `Shader ${indice}`, visible: true, opacity: 1, blend: "normal",
    preset: { components: [{ type: efecto, id: `efecto-${indice}`, props, children: [] }], structureVersion: 1 },
    transform: { ...TRANSFORM }, mascara: "ninguna" };
}
function capaDifusion(modo: ModoDifusion): BackgroundLayer {
  const difusion: DifusionConfig = { modo, desenfoquePx: modo === "desenfoque" ? 24 : 0, opacidad: 1, textura: "ninguna",
    ...(modo === "tono" ? { tono: "#ffffff" } : {}) };
  return { id: "difusion-1", kind: "difusion", name: "Difusión", visible: true, opacity: 1, blend: "normal", difusion,
    transform: { ...TRANSFORM }, mascara: "ninguna" };
}
/** El plan PURO: misma entrada, mismo set; no pinta ni ejecuta nada. */
export function planFondo(entrada: EntradaFondo): PlanFondo {
  const avisos: string[] = [], motivos: string[] = [];
  const efecto = efectoDe(entrada.valores); // cualquier efecto del catálogo instalado, no solo los del panel
  const entradaEfecto = efectoDelCatalogo(entrada.catalogo, efecto);
  if (!entradaEfecto) motivos.push(`El catálogo instalado no trae «${efecto}»: actualiza Shaders o elige otro efecto.`);
  if (EFECTOS_CAMARA.includes(efecto)) {
    if (entrada.compartido) motivos.push(`«${efecto}» usa la cámara y un set compartido no puede usarla.`);
    else if (entrada.permisoCamara !== true) motivos.push(`«${efecto}» necesita permiso explícito de la cámara.`);
  }
  const difusion = opcionDe(entrada.valores, "difusion");
  const pedidas = enteroDe(entrada.valores, "capas"), capas = difusion === "ninguna" ? pedidas : Math.min(pedidas, 7);
  if (capas < pedidas) avisos.push("Con difusión entran 7 capas shader como mucho: el set admite 8 en total.");
  const props = opcionDe(entrada.valores, "props") === "personalizadas"
    ? { ...(entrada.props ?? {}) }
    : { ...(entradaEfecto ? propsDelCatalogo(entradaEfecto) : {}), ...(entrada.props ?? {}) };
  const pila: BackgroundLayer[] = Array.from({ length: capas }, (_, i) => capaShader(i + 1, efecto, props));
  if (difusion !== "ninguna") pila.push(capaDifusion(difusion as ModoDifusion));
  if (motivos.length) return { ok: false, motivos, avisos };
  const opciones: OpcionesSet & { ahora?: () => Date; crearId?: () => string } = {
    catalogo: entrada.catalogo, biblioteca: entrada.biblioteca, compartido: entrada.compartido,
    ahora: entrada.ahora, crearId: entrada.crearId ?? (entrada.id ? () => entrada.id as string : undefined),
  };
  const resultado = exportarSet({ nombre: entrada.nombre ?? `Fondo ${efecto}`, autor: entrada.autor ?? "StarSeed",
    base: entrada.base ?? null, capas: pila }, opciones);
  if (!resultado.ok) return { ok: false, motivos: resultado.motivos, avisos };
  if ((entrada.base ?? null) === null) avisos.push("La capa de abajo sigue siendo el fondo actual (Spline): el set añade las suyas encima.");
  return { ok: true, set: resultado.set, json: resultado.json, archivo: resultado.archivo,
    alcance: opcionDe(entrada.valores, "alcance") as AmbitoFondoAtomo, avisos };
}
