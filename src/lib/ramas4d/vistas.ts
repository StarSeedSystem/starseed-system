/**
 * vistas — personalización ilimitada de las vistas de Ramas 4D (MV1125J).
 * ---------------------------------------------------------------------------
 * Una Vista guarda plantilla, capas, perspectiva, formas e iconos por tipo,
 * colores (tokens del tema o personalizados), física, fondo, sonido espacial y
 * etiquetas, por persona y por grupo. Compartir lleva SOLO la configuración:
 * nunca el id, el dueño ni el grupo. Se exporta como variación pública con
 * `src/lib/variaciones` (clave `vista:<plantilla>`).
 *
 * Módulo PURO: sin red, sin disco, sin `node:*` y sin DOM. El almacén y el
 * reloj se inyectan para que guardar y migrar sean deterministas. La clave
 * sigue el patrón de `src/lib/settings-sync.ts`: JSON versionado, lectura
 * defensiva y valores de fábrica ante basura.
 */
import type { NuevaVariacion } from "@/lib/variaciones/datos";

export const VERSION_VISTA = 2;
export const CLAVE_VISTAS = "starseed.ramas4d.vistas.v1";
export const EVENTO_VISTAS = "starseed:ramas4d:vistas";

export const PLANTILLAS = ["general", "educacion", "cerebros", "politica", "cultura", "ia", "creacion", "metagenesis"] as const;
export const PERSPECTIVAS = ["yo", "grupo", "comunidad", "neurona"] as const;
export const ALCANCES = ["persona", "grupo"] as const;
export const FONDOS = ["noche", "vacio", "nieve", "claridad", "profundidad", "natural", "cristal"] as const;
export const FORMAS = ["estrella", "esfera", "planeta", "cubo", "tetraedro", "icosaedro"] as const;
export const TIPOS_VISUALES = ["neurona", "cerebro", "carpeta", "archivo", "memoria", "publicacion", "agente", "bot", "proyecto", "tarea"] as const;
export const TOKENS_COLOR = ["--primary", "--secondary", "--accent", "--foreground", "--muted-foreground", "--border", "--ring", "--background"] as const;

export type PlantillaVista = (typeof PLANTILLAS)[number];
export type PerspectivaVista = (typeof PERSPECTIVAS)[number];
export type AlcanceVista = (typeof ALCANCES)[number];
export type FondoVista = (typeof FONDOS)[number];
export type FormaNodo = (typeof FORMAS)[number];
export type ColorVista = { tipo: "token"; valor: string } | { tipo: "personalizado"; valor: string };

export interface FisicaVista { gravedad: number; distancia: number; velocidad: number }
export interface ColoresVista { acento: ColorVista; nodo: ColorVista; arista: ColorVista; texto: ColorVista }
export interface EtiquetasVista { tamano: number; siempre: boolean }

export interface Vista4D {
  v: number;
  id: string;
  nombre: string;
  plantilla: PlantillaVista;
  capas: string[];
  perspectiva: PerspectivaVista;
  formas: Record<string, FormaNodo>;
  iconos: Record<string, string>;
  colores: ColoresVista;
  fisica: FisicaVista;
  fondo: FondoVista;
  sonidoEspacial: boolean;
  etiquetas: EtiquetasVista;
  alcance: AlcanceVista;
  grupo?: string;
  dueno?: string;
  actualizado: number;
}

export const VISTA_FABRICA: Vista4D = {
  v: VERSION_VISTA,
  id: "vista-general",
  nombre: "Mi universo",
  plantilla: "general",
  capas: [],
  perspectiva: "yo",
  formas: { neurona: "estrella", cerebro: "esfera", carpeta: "cubo", archivo: "planeta", memoria: "esfera", publicacion: "icosaedro", agente: "tetraedro", bot: "tetraedro", proyecto: "cubo", tarea: "esfera" },
  iconos: {},
  colores: {
    acento: { tipo: "token", valor: "--primary" },
    nodo: { tipo: "token", valor: "--accent" },
    arista: { tipo: "token", valor: "--border" },
    texto: { tipo: "token", valor: "--foreground" },
  },
  fisica: { gravedad: 1, distancia: 2.5, velocidad: 1 },
  fondo: "noche",
  sonidoEspacial: false,
  etiquetas: { tamano: 1, siempre: false },
  alcance: "persona",
  actualizado: 0,
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const listaTextos = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((e): e is string => typeof e === "string" && e.trim() !== "").map((e) => e.trim()).slice(0, 32) : [];
const unoDe = <T extends string>(v: unknown, permitidos: readonly T[], def: T): T =>
  typeof v === "string" && (permitidos as readonly string[]).includes(v) ? (v as T) : def;
const numero = (v: unknown, def: number, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;

/** Token (`--primary`) o color personalizado (hex); una cadena suelta de la v1 se migra. */
export function normalizarColor(valor: unknown, porDefecto: ColorVista): ColorVista {
  if (typeof valor === "string" && valor.trim()) {
    const bruto = valor.trim();
    return bruto.startsWith("#")
      ? { tipo: "personalizado", valor: HEX.test(bruto) ? bruto.toLowerCase() : porDefecto.valor }
      : { tipo: "token", valor: bruto.startsWith("--") ? bruto : `--${bruto}` };
  }
  if (!esObjeto(valor)) return porDefecto;
  const bruto = texto(valor.valor);
  if (valor.tipo === "personalizado") return HEX.test(bruto) ? { tipo: "personalizado", valor: bruto.toLowerCase() } : porDefecto;
  if (valor.tipo === "token" && bruto) return { tipo: "token", valor: bruto.startsWith("--") ? bruto : `--${bruto}` };
  return porDefecto;
}

export function normalizarFormas(valor: unknown): Record<string, FormaNodo> {
  const salida: Record<string, FormaNodo> = { ...VISTA_FABRICA.formas };
  if (!esObjeto(valor)) return salida;
  for (const tipo of TIPOS_VISUALES) {
    const forma = valor[tipo];
    if (typeof forma === "string" && (FORMAS as readonly string[]).includes(forma)) salida[tipo] = forma as FormaNodo;
  }
  return salida;
}

export function normalizarIconos(valor: unknown): Record<string, string> {
  if (!esObjeto(valor)) return {};
  const salida: Record<string, string> = {};
  for (const [tipo, icono] of Object.entries(valor)) {
    if (typeof icono === "string" && /^[A-Za-z][A-Za-z0-9]*$/.test(icono.trim())) salida[tipo] = icono.trim();
  }
  return salida;
}

/**
 * Sanea una vista de cualquier versión. La v1 solo tenía `color` (una cadena)
 * y no tenía fondo, sonido espacial ni etiquetas: se migra a la v2 sin perder
 * lo que sí traía. Basura, versión desconocida o campos rotos → valores de
 * fábrica, nunca una excepción.
 */
export function normalizarVista(valor: unknown, ahora = 0): Vista4D {
  if (!esObjeto(valor)) return { ...VISTA_FABRICA, actualizado: ahora };
  const colores = esObjeto(valor.colores) ? valor.colores : {};
  const fisica = esObjeto(valor.fisica) ? valor.fisica : {};
  const etiquetas = esObjeto(valor.etiquetas) ? valor.etiquetas : {};
  const alcance = unoDe(valor.alcance, ALCANCES, "persona");
  const grupo = alcance === "grupo" ? texto(valor.grupo) : "";
  const dueno = texto(valor.dueno);
  const colorV1 = typeof valor.color === "string" ? valor.color : null;
  return {
    v: VERSION_VISTA,
    id: texto(valor.id) || VISTA_FABRICA.id,
    nombre: texto(valor.nombre) || VISTA_FABRICA.nombre,
    plantilla: unoDe(valor.plantilla, PLANTILLAS, "general"),
    capas: listaTextos(valor.capas),
    perspectiva: unoDe(valor.perspectiva, PERSPECTIVAS, "yo"),
    formas: normalizarFormas(valor.formas),
    iconos: normalizarIconos(valor.iconos),
    colores: {
      acento: normalizarColor(colores.acento ?? colorV1, VISTA_FABRICA.colores.acento),
      nodo: normalizarColor(colores.nodo, VISTA_FABRICA.colores.nodo),
      arista: normalizarColor(colores.arista, VISTA_FABRICA.colores.arista),
      texto: normalizarColor(colores.texto, VISTA_FABRICA.colores.texto),
    },
    fisica: {
      gravedad: numero(fisica.gravedad, VISTA_FABRICA.fisica.gravedad, 0, 5),
      distancia: numero(fisica.distancia, VISTA_FABRICA.fisica.distancia, 0.5, 20),
      velocidad: numero(fisica.velocidad, VISTA_FABRICA.fisica.velocidad, 0.1, 5),
    },
    fondo: unoDe(valor.fondo, FONDOS, "noche"),
    sonidoEspacial: valor.sonidoEspacial === true,
    etiquetas: {
      tamano: numero(etiquetas.tamano, VISTA_FABRICA.etiquetas.tamano, 0.5, 3),
      siempre: etiquetas.siempre === true,
    },
    alcance,
    ...(grupo ? { grupo } : {}),
    ...(dueno ? { dueno } : {}),
    actualizado: numero(valor.actualizado, ahora, 0, Number.MAX_SAFE_INTEGER),
  };
}

/** Versión que declara un dato guardado (0 si no se puede leer). */
export function versionDeVista(valor: unknown): number {
  return esObjeto(valor) && typeof valor.v === "number" ? valor.v : 0;
}

export interface ColeccionVistas { v: number; vistas: Vista4D[] }

export function normalizarColeccion(valor: unknown, ahora = 0): ColeccionVistas {
  const bruto = Array.isArray(valor) ? valor : esObjeto(valor) && Array.isArray(valor.vistas) ? valor.vistas : [];
  const porId = new Map<string, Vista4D>();
  for (const item of bruto) {
    const vista = normalizarVista(item, ahora);
    porId.set(vista.id, vista);
  }
  return { v: VERSION_VISTA, vistas: Array.from(porId.values()) };
}

/** Lo mínimo de localStorage; se inyecta para probar guardar sin DOM ni disco. */
export interface AlmacenVistas {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem?(clave: string): void;
}

export interface ResultadoVistas { ok: boolean; coleccion: ColeccionVistas }

export function leerColeccion(almacen: AlmacenVistas, ahora = 0): ColeccionVistas {
  try {
    const bruto = almacen.getItem(CLAVE_VISTAS);
    return bruto ? normalizarColeccion(JSON.parse(bruto) as unknown, ahora) : { v: VERSION_VISTA, vistas: [] };
  } catch {
    return { v: VERSION_VISTA, vistas: [] };
  }
}

export function guardarColeccion(almacen: AlmacenVistas, coleccion: ColeccionVistas): boolean {
  try {
    almacen.setItem(CLAVE_VISTAS, JSON.stringify({ v: VERSION_VISTA, vistas: normalizarColeccion(coleccion).vistas }));
    return true;
  } catch {
    return false;
  }
}

/** Alta o actualización por id; el reloj fija `actualizado` (la última gana). */
export function guardarVista(almacen: AlmacenVistas, vista: Vista4D, ahora = Date.now()): ResultadoVistas {
  const actual = leerColeccion(almacen, ahora);
  const nueva = normalizarVista({ ...vista, v: VERSION_VISTA, actualizado: ahora }, ahora);
  const coleccion: ColeccionVistas = { v: VERSION_VISTA, vistas: [...actual.vistas.filter((v) => v.id !== nueva.id), nueva] };
  return { ok: guardarColeccion(almacen, coleccion), coleccion };
}

export function eliminarVista(almacen: AlmacenVistas, id: string, ahora = Date.now()): ResultadoVistas {
  const actual = leerColeccion(almacen, ahora);
  const coleccion: ColeccionVistas = { v: VERSION_VISTA, vistas: actual.vistas.filter((v) => v.id !== id) };
  return { ok: guardarColeccion(almacen, coleccion), coleccion };
}

/** Vistas de una persona o de un grupo concreto (el grupo solo filtra en alcance «grupo»). */
export function vistasDe(coleccion: ColeccionVistas, alcance: AlcanceVista, grupo?: string): Vista4D[] {
  return coleccion.vistas.filter((v) => v.alcance === alcance && (alcance === "persona" || v.grupo === grupo));
}

/** Configuración que viaja al compartir: sin id, dueño, grupo ni marca de tiempo. */
export type ConfiguracionVista = Pick<Vista4D, "plantilla" | "capas" | "perspectiva" | "formas" | "iconos" | "colores" | "fisica" | "fondo" | "sonidoEspacial" | "etiquetas" | "alcance">;

export function configuracionCompartible(vista: Vista4D): ConfiguracionVista {
  const n = normalizarVista(vista);
  return {
    plantilla: n.plantilla,
    capas: [...n.capas],
    perspectiva: n.perspectiva,
    formas: { ...n.formas },
    iconos: { ...n.iconos },
    colores: { acento: { ...n.colores.acento }, nodo: { ...n.colores.nodo }, arista: { ...n.colores.arista }, texto: { ...n.colores.texto } },
    fisica: { ...n.fisica },
    fondo: n.fondo,
    sonidoEspacial: n.sonidoEspacial,
    etiquetas: { ...n.etiquetas },
    alcance: n.alcance,
  };
}

export interface OpcionesVariacionVista { titulo?: string; descripcion?: string; licencia?: string; etiquetas?: string[]; deVariacion?: string | null }

/** Clave pública por plantilla: todas las personas comparten `vista:<plantilla>`. */
export function claveDeVista(vista: Vista4D): string {
  return `vista:${normalizarVista(vista).plantilla}`;
}

/** Variación pública lista para `publicarVariacion`: solo configuración, nunca identidad. */
export function aVariacionPublica(vista: Vista4D, opciones: OpcionesVariacionVista = {}): NuevaVariacion {
  const n = normalizarVista(vista);
  return {
    clave: claveDeVista(n),
    titulo: texto(opciones.titulo) || n.nombre,
    descripcion: texto(opciones.descripcion) || `Vista ${n.plantilla} con ${n.capas.length} capas y perspectiva ${n.perspectiva}.`,
    payload: configuracionCompartible(n),
    licencia: texto(opciones.licencia) || "CC-BY-4.0",
    etiquetas: [...new Set((opciones.etiquetas ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, 12),
    deVariacion: opciones.deVariacion ?? null,
  };
}

/** Aplica una configuración compartida a una vista propia (id, dueño y destino son locales). */
export function vistaDesdeConfiguracion(payload: unknown, meta: { id?: string; nombre?: string; dueno?: string; alcance?: AlcanceVista; grupo?: string } = {}, ahora = 0): Vista4D {
  return normalizarVista({ ...(esObjeto(payload) ? payload : {}), id: meta.id, nombre: meta.nombre, dueno: meta.dueno, alcance: meta.alcance ?? "persona", grupo: meta.grupo, actualizado: ahora }, ahora);
}
