// Personalización ilimitada de vistas de Ramas 4D (MV1125J · multiverso-1125).
// Núcleo PURO: modelo versionado, migración, guardado en el almacén de ajustes del OS
// y exportación como variación pública. Sin red ni disco: el almacén se inyecta y las
// pruebas usan uno en memoria. La clave vive en `starseed.*`, el espacio de cuenta que
// `src/lib/settings-sync.ts` sincroniza (CLAVE_VISTAS se declara aquí para cablearla).

import type { NuevaVariacion } from "@/lib/variaciones/datos";
import { validarVariacion } from "@/lib/variaciones/validar";

export const VERSION_VISTA = 2;
export const CLAVE_VISTAS = "starseed.multiverso.vistas.v1";

export const PLANTILLAS = [
  "general", "educacion", "cerebros", "politica", "cultura", "ia", "creacion", "metagenesis",
] as const;
export const PERSPECTIVAS = ["yo", "mi-grupo", "mi-comunidad", "una-neurona", "universal"] as const;
export const CAPAS_VISTA = [
  "conciencia", "capacidades", "senales", "alcance", "sistema", "universosParalelos",
] as const;
export const TIPOS_VISTA = [
  "neurona", "cerebro", "carpeta", "archivo", "memoria", "publicacion", "entidad", "agente", "bot", "obra",
] as const;
export const FORMAS_VISTA = [
  "estrella", "galaxia", "sistema", "planeta", "luna", "cometa", "constelacion", "nucleo", "cristal",
] as const;
export const ICONOS_VISTA = ["punto", "orbe", "anillo", "rombo", "triangulo", "hexagono", "espiral", "flor"] as const;
export const COLORES_TOKEN = ["primary", "accent", "border", "muted", "background", "chart-1"] as const;

export interface AlmacenVistas {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

export interface FormaTipoVista { forma: string; icono: string }
export interface ColoresVista { base: string; nodo: string; arista: string; senal: string; personalizados: string[] }
export interface FisicaVista { gravedad: number; distancia: number; velocidad: number }
export interface FondoVista { tipo: "tema" | "color" | "degradado"; valor: string; opacidad: number }
export interface SonidoVista { activo: boolean; intensidad: number }
export interface EtiquetasVista { diseno: "minimo" | "compacto" | "detallado"; tamano: number; siempre: boolean }

export interface VistaGuardada {
  id: string;
  version: number;
  nombre: string;
  plantilla: string;
  capas: string[];
  perspectiva: string;
  formas: Record<string, FormaTipoVista>;
  colores: ColoresVista;
  fisica: FisicaVista;
  fondo: FondoVista;
  sonido: SonidoVista;
  etiquetas: EtiquetasVista;
  dueno: string;
  grupo: string | null;
  publica: boolean;
  creada: number;
  actualizada: number;
}

export const COLORES_POR_DEFECTO: ColoresVista = {
  base: "var(--background)", nodo: "var(--primary)", arista: "var(--border)",
  senal: "var(--accent)", personalizados: [],
};
export const FISICA_POR_DEFECTO: FisicaVista = { gravedad: 0.4, distancia: 1, velocidad: 1 };
export const FONDO_POR_DEFECTO: FondoVista = { tipo: "tema", valor: "var(--background)", opacidad: 1 };
export const SONIDO_POR_DEFECTO: SonidoVista = { activo: true, intensidad: 0.5 };
export const ETIQUETAS_POR_DEFECTO: EtiquetasVista = { diseno: "compacto", tamano: 1, siempre: false };

export function crearVista(dueno: string, ahora: number, nuevoId: () => string, parcial: Partial<VistaGuardada> = {}): VistaGuardada {
  return {
    id: parcial.id ?? nuevoId(), version: VERSION_VISTA, nombre: parcial.nombre ?? "Mi vista",
    plantilla: parcial.plantilla ?? PLANTILLAS[0], capas: parcial.capas ?? [...CAPAS_VISTA],
    perspectiva: parcial.perspectiva ?? PERSPECTIVAS[0], formas: parcial.formas ?? {},
    colores: parcial.colores ?? { ...COLORES_POR_DEFECTO }, fisica: parcial.fisica ?? { ...FISICA_POR_DEFECTO },
    fondo: parcial.fondo ?? { ...FONDO_POR_DEFECTO }, sonido: parcial.sonido ?? { ...SONIDO_POR_DEFECTO },
    etiquetas: parcial.etiquetas ?? { ...ETIQUETAS_POR_DEFECTO }, dueno, grupo: parcial.grupo ?? null,
    publica: parcial.publica ?? false, creada: parcial.creada ?? ahora, actualizada: ahora,
  };
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function texto(v: unknown, def: string): string {
  return typeof v === "string" && v.trim() !== "" ? v : def;
}
function numero(v: unknown, def: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
}
function booleano(v: unknown, def: boolean): boolean {
  return typeof v === "boolean" ? v : def;
}
function listaTextos(v: unknown, def: string[]): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : def;
}
function esHex(v: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(v);
}
function color(v: unknown, def: string): string {
  if (typeof v !== "string") return def;
  if (v.startsWith("var(--") || esHex(v)) return v;
  return (COLORES_TOKEN as readonly string[]).includes(v) ? `var(--${v})` : def;
}
function leerFormas(v: unknown): Record<string, FormaTipoVista> {
  const salida: Record<string, FormaTipoVista> = {};
  if (!esObjeto(v)) return salida;
  for (const [tipo, crudo] of Object.entries(v)) {
    if (typeof crudo === "string") salida[tipo] = { forma: crudo, icono: "punto" };
    else if (esObjeto(crudo)) salida[tipo] = { forma: texto(crudo.forma, "planeta"), icono: texto(crudo.icono, "punto") };
  }
  return salida;
}

/** Acepta una vista v1 (colores/fondo como texto, sonido booleano) y la lleva a la versión actual. */
export function migrarVista(crudo: unknown, ahora: number = Date.now()): VistaGuardada | null {
  if (!esObjeto(crudo) || typeof crudo.id !== "string" || crudo.id === "") return null;
  const coloresV1 = typeof crudo.colores === "string" ? crudo.colores : null;
  const coloresCrudo = esObjeto(crudo.colores) ? crudo.colores : {};
  const fondoV1 = typeof crudo.fondo === "string" ? crudo.fondo : null;
  const fondoCrudo = esObjeto(crudo.fondo) ? crudo.fondo : {};
  const sonidoV1 = typeof crudo.sonido === "boolean" ? crudo.sonido : null;
  const sonidoCrudo = esObjeto(crudo.sonido) ? crudo.sonido : {};
  const etiquetasCrudo = esObjeto(crudo.etiquetas) ? crudo.etiquetas : {};
  const fisicaCrudo = esObjeto(crudo.fisica) ? crudo.fisica : {};
  const disenos = ["minimo", "compacto", "detallado"] as const;
  const diseno = disenos.find((d) => d === etiquetasCrudo.diseno) ?? "compacto";
  return {
    id: crudo.id, version: VERSION_VISTA, nombre: texto(crudo.nombre, "Vista sin nombre"),
    plantilla: texto(crudo.plantilla, PLANTILLAS[0]), capas: listaTextos(crudo.capas, [...CAPAS_VISTA]),
    perspectiva: texto(crudo.perspectiva, PERSPECTIVAS[0]), formas: leerFormas(crudo.formas),
    colores: {
      base: color(coloresCrudo.base, coloresV1 ?? COLORES_POR_DEFECTO.base),
      nodo: color(coloresCrudo.nodo, COLORES_POR_DEFECTO.nodo), arista: color(coloresCrudo.arista, COLORES_POR_DEFECTO.arista),
      senal: color(coloresCrudo.senal, COLORES_POR_DEFECTO.senal),
      personalizados: listaTextos(coloresCrudo.personalizados, []).filter(esHex).slice(0, 12),
    },
    fisica: {
      gravedad: numero(fisicaCrudo.gravedad, FISICA_POR_DEFECTO.gravedad, 0, 2),
      distancia: numero(fisicaCrudo.distancia, FISICA_POR_DEFECTO.distancia, 0.2, 4),
      velocidad: numero(fisicaCrudo.velocidad, FISICA_POR_DEFECTO.velocidad, 0.1, 4),
    },
    fondo: {
      tipo: fondoCrudo.tipo === "color" || fondoCrudo.tipo === "degradado" ? fondoCrudo.tipo : "tema",
      valor: color(fondoCrudo.valor, fondoV1 ?? FONDO_POR_DEFECTO.valor),
      opacidad: numero(fondoCrudo.opacidad, FONDO_POR_DEFECTO.opacidad, 0, 1),
    },
    sonido: { activo: booleano(sonidoCrudo.activo, sonidoV1 ?? SONIDO_POR_DEFECTO.activo),
      intensidad: numero(sonidoCrudo.intensidad, SONIDO_POR_DEFECTO.intensidad, 0, 1) },
    etiquetas: { diseno, tamano: numero(etiquetasCrudo.tamano, 1, 0.75, 2), siempre: booleano(etiquetasCrudo.siempre, false) },
    dueno: texto(crudo.dueno, ""), grupo: typeof crudo.grupo === "string" && crudo.grupo !== "" ? crudo.grupo : null,
    publica: booleano(crudo.publica, false), creada: numero(crudo.creada, ahora, 0, ahora),
    actualizada: numero(crudo.actualizada, ahora, 0, ahora),
  };
}

export function crearAlmacenNavegador(): AlmacenVistas | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Lee y migra las vistas guardadas. Nunca lanza: sin almacén, JSON roto o versión vieja devuelve lo que se pueda. */
export function leerVistas(almacen: AlmacenVistas | null, dueno?: string, ahora: number = Date.now()): VistaGuardada[] {
  if (!almacen) return [];
  try {
    const crudo = almacen.getItem(CLAVE_VISTAS);
    if (!crudo) return [];
    const dato: unknown = JSON.parse(crudo);
    const lista = Array.isArray(dato) ? dato : esObjeto(dato) && Array.isArray(dato.vistas) ? dato.vistas : [];
    const vistas = lista.map((v) => migrarVista(v, ahora)).filter((v): v is VistaGuardada => v !== null);
    return dueno ? vistas.filter((v) => v.dueno === dueno) : vistas;
  } catch {
    return [];
  }
}

export function guardarVistas(almacen: AlmacenVistas | null, vistas: VistaGuardada[]): boolean {
  if (!almacen) return false;
  try {
    almacen.setItem(CLAVE_VISTAS, JSON.stringify({ version: VERSION_VISTA, vistas }));
    return true;
  } catch {
    return false;
  }
}

/** Crea o actualiza una vista por id (por persona y por grupo). Devuelve la guardada o null si el almacén falla. */
export function guardarVista(almacen: AlmacenVistas | null, vista: VistaGuardada, ahora: number = Date.now()): VistaGuardada | null {
  const todas = leerVistas(almacen, undefined, ahora);
  const guardada: VistaGuardada = { ...vista, version: VERSION_VISTA, actualizada: ahora };
  const indice = todas.findIndex((v) => v.id === guardada.id);
  if (indice >= 0) todas[indice] = guardada;
  else todas.push(guardada);
  return guardarVistas(almacen, todas) ? guardada : null;
}

export function borrarVista(almacen: AlmacenVistas | null, id: string, ahora: number = Date.now()): boolean {
  return guardarVistas(almacen, leerVistas(almacen, undefined, ahora).filter((v) => v.id !== id));
}

export type AlcanceCompartir = "privado" | "contactos" | "grupo" | "publico";

export interface ConfiguracionCompartida {
  version: number; nombre: string; plantilla: string; capas: string[]; perspectiva: string;
  formas: Record<string, FormaTipoVista>; colores: ColoresVista; fisica: FisicaVista;
  fondo: FondoVista; sonido: SonidoVista; etiquetas: EtiquetasVista;
}

/** Compartir guarda SOLO la configuración de la vista: nunca dueño, grupo ni contenido privado. */
export function configuracionCompartible(vista: VistaGuardada): ConfiguracionCompartida {
  return {
    version: vista.version, nombre: vista.nombre, plantilla: vista.plantilla, capas: [...vista.capas],
    perspectiva: vista.perspectiva, formas: { ...vista.formas },
    colores: { ...vista.colores, personalizados: [...vista.colores.personalizados] },
    fisica: { ...vista.fisica }, fondo: { ...vista.fondo }, sonido: { ...vista.sonido },
    etiquetas: { ...vista.etiquetas },
  };
}

export function motivosCompartir(vista: VistaGuardada, alcance: AlcanceCompartir): string[] {
  const motivos: string[] = [];
  if (!vista.nombre.trim()) motivos.push("La vista necesita un nombre para compartirse");
  if (alcance === "publico" && !vista.publica) motivos.push("Marca la vista como pública antes de exportarla como variación pública");
  if (alcance === "grupo" && !vista.grupo) motivos.push("Elige un grupo antes de compartir con el grupo");
  return motivos;
}

export function compartirVista(vista: VistaGuardada, alcance: AlcanceCompartir) {
  const motivos = motivosCompartir(vista, alcance);
  return { ok: motivos.length === 0, configuracion: configuracionCompartible(vista), motivos };
}

/** Variación pública lista para `src/lib/variaciones`; null si la vista no es pública o no pasa privacidad. */
export function comoVariacionPublica(vista: VistaGuardada, licencia = "CC0-1.0"): NuevaVariacion | null {
  if (!vista.publica || motivosCompartir(vista, "publico").length > 0) return null;
  const payload = configuracionCompartible(vista);
  if (!validarVariacion(payload).ok) return null;
  return {
    clave: `vista:${vista.id}`, tipo: "variacion", titulo: vista.nombre,
    descripcion: `Vista de Ramas 4D · plantilla ${vista.plantilla}`, payload,
    version: String(vista.version), licencia, etiquetas: [vista.plantilla, vista.perspectiva],
    tema: vista.plantilla,
  };
}
