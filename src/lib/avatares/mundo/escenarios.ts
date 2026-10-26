/**
 * Escenarios del mundo de los avatares (Ola 1025U · U1): tantos como quiera la persona, cada uno con
 * su visibilidad (privado, de un grupo o público), sus zonas y su camino previsto de sincronía.
 *
 * Lo que es real hoy: el escenario se guarda en ESTE aparato. «Camino previsto» (`transporteDeEscenario`)
 * es lo que decide `elegirTransporte` de las salas para cuando se comparta; hoy nadie más ve el mundo,
 * y la interfaz lo dice. Con sesión no se espeja a `os_spaces`: la única vía que existe (`kind 'escena'`,
 * `lib/vivo/espacial/persistencia.ts`) guarda objetos 3D de un `DocEscena` y descartaría las zonas y
 * la visibilidad al leer, así que no se inventa una tabla ni se fuerza ese formato.
 *
 * Módulo puro salvo `leerEscenarios`/`guardarEscenarios` (localStorage, con try/catch). Sin `node:*`.
 */
import { elegirTransporte, type Alcanzabilidad, type DecisionTransporte, type Sala } from "@/lib/salas/sala";
import { OCUPACIONES_MUNDO, type OcupacionMundo } from "./simulacion";

export const VISIBILIDADES_ESCENARIO = ["privada", "grupo", "publica"] as const;
export type VisibilidadEscenario = (typeof VISIBILIDADES_ESCENARIO)[number];

export const ETIQUETA_VISIBILIDAD: Record<VisibilidadEscenario, string> = {
  privada: "Privado",
  grupo: "De un grupo",
  publica: "Público",
};

/** Una zona del escenario: un lugar con carácter (ágora, taller…) que atrae a quien hace lo suyo. */
export interface ZonaEscenario {
  id: string;
  nombre: string;
  afinidad: OcupacionMundo | null;
}

export interface Escenario {
  id: string;
  nombre: string;
  visibilidad: VisibilidadEscenario;
  /** Grupo con el que se comparte (solo con visibilidad «grupo»). */
  grupoId?: string;
  /** Servidor privado donde vivirá, si se configura. */
  servidorUrl?: string;
  zonas: ZonaEscenario[];
  creadoEn: number;
  actualizadoEn: number;
}

export interface AlmacenEscenarios {
  version: 1;
  activoId: string;
  escenarios: Escenario[];
}

export type ResultadoEscenarios =
  | { ok: true; almacen: AlmacenEscenarios; escenario?: Escenario }
  | { ok: false; motivo: string };

export const CLAVE_ESCENARIOS = "starseed.mundo.escenarios.v1";
export const LARGO_NOMBRE_ESCENARIO = 60;
/** Tope de zonas dentro de UN escenario (los escenarios en sí no tienen tope). */
export const MAX_ZONAS = 12;

export const ZONAS_POR_DEFECTO: readonly ZonaEscenario[] = [
  { id: "agora", nombre: "Ágora", afinidad: "conversar" },
  { id: "taller", nombre: "Taller", afinidad: "crear" },
  { id: "biblioteca", nombre: "Biblioteca", afinidad: "explorar" },
  { id: "suenos", nombre: "Sueños", afinidad: "descansar" },
];

/** Para qué sirve cada afinidad, en palabras de la interfaz. */
export const ETIQUETA_AFINIDAD: Record<OcupacionMundo, string> = {
  conversar: "Conversar",
  crear: "Crear",
  explorar: "Explorar",
  descansar: "Descansar",
};

/* ───────────────────────────── Utilidades ───────────────────────────── */

export function limpiarNombre(texto: unknown, respaldo = ""): string {
  const t = typeof texto === "string" ? texto.replace(/\s+/g, " ").trim().slice(0, LARGO_NOMBRE_ESCENARIO) : "";
  return t || respaldo;
}

function idLibre(base: string, usados: ReadonlySet<string>): string {
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function nombreLibre(base: string, existentes: readonly string[]): string {
  const minusculas = new Set(existentes.map((n) => n.toLowerCase()));
  if (!minusculas.has(base.toLowerCase())) return base;
  let n = 2;
  while (minusculas.has(`${base} (${n})`.toLowerCase())) n += 1;
  return `${base} (${n})`;
}

const copiaZonas = (zonas: readonly ZonaEscenario[]): ZonaEscenario[] => zonas.map((z) => ({ ...z }));

/* ───────────────────────────── Estado de partida ───────────────────────────── */

export function escenarioPorDefecto(ahora: number): Escenario {
  return {
    id: "mi-mundo",
    nombre: "Mi mundo",
    visibilidad: "privada",
    zonas: copiaZonas(ZONAS_POR_DEFECTO),
    creadoEn: ahora,
    actualizadoEn: ahora,
  };
}

export function almacenInicial(ahora: number): AlmacenEscenarios {
  const e = escenarioPorDefecto(ahora);
  return { version: 1, activoId: e.id, escenarios: [e] };
}

export function escenarioActivo(almacen: AlmacenEscenarios): Escenario {
  return almacen.escenarios.find((e) => e.id === almacen.activoId) ?? almacen.escenarios[0];
}

function conCambio(almacen: AlmacenEscenarios, id: string, cambio: (e: Escenario) => Escenario): ResultadoEscenarios {
  const previo = almacen.escenarios.find((e) => e.id === id);
  if (!previo) return { ok: false, motivo: "Ese escenario ya no existe." };
  const nuevo = cambio(previo);
  return {
    ok: true,
    escenario: nuevo,
    almacen: { ...almacen, escenarios: almacen.escenarios.map((e) => (e.id === id ? nuevo : e)) },
  };
}

/* ───────────────────────────── Operaciones ───────────────────────────── */

export interface DatosEscenario {
  nombre: string;
  visibilidad?: VisibilidadEscenario;
  grupoId?: string;
  zonas?: readonly ZonaEscenario[];
}

/** Crea un escenario y lo deja activo. Sin tope de cantidad. */
export function crearEscenario(almacen: AlmacenEscenarios, datos: DatosEscenario, ahora: number): ResultadoEscenarios {
  const nombre = limpiarNombre(datos.nombre);
  if (!nombre) return { ok: false, motivo: "Ponle un nombre al escenario." };
  const visibilidad = datos.visibilidad ?? "privada";
  const grupoId = datos.grupoId?.trim();
  if (visibilidad === "grupo" && !grupoId) return { ok: false, motivo: "Elige el grupo con el que se comparte." };
  const zonas = copiaZonas(datos.zonas && datos.zonas.length > 0 ? datos.zonas : ZONAS_POR_DEFECTO).slice(0, MAX_ZONAS);
  const id = idLibre(`esc-${ahora.toString(36)}`, new Set(almacen.escenarios.map((e) => e.id)));
  const escenario: Escenario = {
    id,
    nombre: nombreLibre(nombre, almacen.escenarios.map((e) => e.nombre)),
    visibilidad,
    ...(visibilidad === "grupo" && grupoId ? { grupoId } : {}),
    zonas,
    creadoEn: ahora,
    actualizadoEn: ahora,
  };
  return { ok: true, escenario, almacen: { ...almacen, activoId: id, escenarios: [...almacen.escenarios, escenario] } };
}

export function renombrarEscenario(almacen: AlmacenEscenarios, id: string, nombre: string, ahora: number): ResultadoEscenarios {
  const limpio = limpiarNombre(nombre);
  if (!limpio) return { ok: false, motivo: "El nombre no puede estar vacío." };
  const otros = almacen.escenarios.filter((e) => e.id !== id).map((e) => e.nombre);
  return conCambio(almacen, id, (e) => ({ ...e, nombre: nombreLibre(limpio, otros), actualizadoEn: ahora }));
}

/**
 * Duplica un escenario con sus zonas. La copia nace PRIVADA aunque el original sea público: copiar no
 * debe publicar nada sin querer.
 */
export function duplicarEscenario(almacen: AlmacenEscenarios, id: string, ahora: number): ResultadoEscenarios {
  const original = almacen.escenarios.find((e) => e.id === id);
  if (!original) return { ok: false, motivo: "Ese escenario ya no existe." };
  const nombres = almacen.escenarios.map((e) => e.nombre);
  const nombre = nombreLibre(limpiarNombre(`${original.nombre} (copia)`), nombres);
  const nuevoId = idLibre(`esc-${ahora.toString(36)}`, new Set(almacen.escenarios.map((e) => e.id)));
  const copia: Escenario = {
    id: nuevoId,
    nombre,
    visibilidad: "privada",
    zonas: copiaZonas(original.zonas),
    creadoEn: ahora,
    actualizadoEn: ahora,
  };
  return { ok: true, escenario: copia, almacen: { ...almacen, activoId: nuevoId, escenarios: [...almacen.escenarios, copia] } };
}

/**
 * Borra un escenario. Sin `confirmado === true` no borra nada: la confirmación es parte de la
 * operación, no un adorno de la interfaz. Siempre queda al menos uno.
 */
export function borrarEscenario(almacen: AlmacenEscenarios, id: string, confirmado: boolean): ResultadoEscenarios {
  const indice = almacen.escenarios.findIndex((e) => e.id === id);
  if (indice < 0) return { ok: false, motivo: "Ese escenario ya no existe." };
  if (confirmado !== true) return { ok: false, motivo: "Borrar un escenario necesita tu confirmación." };
  if (almacen.escenarios.length <= 1) return { ok: false, motivo: "Debe quedar al menos un escenario." };
  const escenarios = almacen.escenarios.filter((e) => e.id !== id);
  // Si se borra el activo, pasa a ser el vecino anterior (o el primero).
  const activoId = almacen.activoId === id ? escenarios[Math.max(0, indice - 1)].id : almacen.activoId;
  return { ok: true, almacen: { ...almacen, activoId, escenarios } };
}

export function elegirEscenario(almacen: AlmacenEscenarios, id: string): ResultadoEscenarios {
  const e = almacen.escenarios.find((x) => x.id === id);
  if (!e) return { ok: false, motivo: "Ese escenario ya no existe." };
  return { ok: true, escenario: e, almacen: { ...almacen, activoId: id } };
}

export function cambiarVisibilidad(
  almacen: AlmacenEscenarios,
  id: string,
  visibilidad: VisibilidadEscenario,
  ahora: number,
  grupoId?: string,
): ResultadoEscenarios {
  if (!VISIBILIDADES_ESCENARIO.includes(visibilidad)) return { ok: false, motivo: "Esa visibilidad no existe." };
  const grupo = grupoId?.trim();
  if (visibilidad === "grupo" && !grupo) return { ok: false, motivo: "Elige el grupo con el que se comparte." };
  return conCambio(almacen, id, (e) => {
    const { grupoId: _quitado, ...resto } = e;
    void _quitado;
    return { ...resto, visibilidad, ...(visibilidad === "grupo" && grupo ? { grupoId: grupo } : {}), actualizadoEn: ahora };
  });
}

export function agregarZona(
  almacen: AlmacenEscenarios,
  id: string,
  nombre: string,
  afinidad: OcupacionMundo | null,
  ahora: number,
): ResultadoEscenarios {
  const limpio = limpiarNombre(nombre);
  if (!limpio) return { ok: false, motivo: "Ponle un nombre a la zona." };
  const actual = almacen.escenarios.find((e) => e.id === id);
  if (actual && actual.zonas.length >= MAX_ZONAS) {
    return { ok: false, motivo: `Un escenario admite hasta ${MAX_ZONAS} zonas.` };
  }
  return conCambio(almacen, id, (e) => {
    const usados = new Set(e.zonas.map((z) => z.id));
    const base = limpio.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "zona";
    const zona: ZonaEscenario = { id: idLibre(base, usados), nombre: nombreLibre(limpio, e.zonas.map((z) => z.nombre)), afinidad };
    return { ...e, zonas: [...e.zonas, zona], actualizadoEn: ahora };
  });
}

export function quitarZona(almacen: AlmacenEscenarios, id: string, zonaId: string, ahora: number): ResultadoEscenarios {
  const actual = almacen.escenarios.find((e) => e.id === id);
  if (actual && !actual.zonas.some((z) => z.id === zonaId)) return { ok: false, motivo: "Esa zona ya no existe." };
  if (actual && actual.zonas.length <= 1) return { ok: false, motivo: "Debe quedar al menos una zona." };
  return conCambio(almacen, id, (e) => ({ ...e, zonas: e.zonas.filter((z) => z.id !== zonaId), actualizadoEn: ahora }));
}

export function renombrarZona(almacen: AlmacenEscenarios, id: string, zonaId: string, nombre: string, ahora: number): ResultadoEscenarios {
  const limpio = limpiarNombre(nombre);
  if (!limpio) return { ok: false, motivo: "El nombre de la zona no puede estar vacío." };
  return conCambio(almacen, id, (e) => ({
    ...e,
    zonas: e.zonas.map((z) => (z.id === zonaId ? { ...z, nombre: nombreLibre(limpio, e.zonas.filter((q) => q.id !== zonaId).map((q) => q.nombre)) } : z)),
    actualizadoEn: ahora,
  }));
}

/* ───────────────────────────── Camino de sincronía ───────────────────────────── */

/** El escenario como sala del OS (tipo `escena3d`), para que `elegirTransporte` decida con el contrato único. */
export function salaDeEscenario(e: Escenario): Sala {
  return {
    id: e.id,
    tipo: "escena3d",
    titulo: e.nombre,
    visibilidad: e.visibilidad,
    ...(e.grupoId ? { grupoId: e.grupoId } : {}),
    transporte: "local",
    ...(e.servidorUrl ? { servidorUrl: e.servidorUrl } : {}),
    miembros: {},
    creadaEn: e.creadoEn,
  };
}

/** Por dónde viajaría el escenario al compartirse AHORA, con su motivo. Hoy el mundo solo vive en este aparato. */
export function transporteDeEscenario(e: Escenario, alcance: Alcanzabilidad): DecisionTransporte {
  return elegirTransporte(salaDeEscenario(e), alcance);
}

/* ───────────────────────────── Disco ───────────────────────────── */

const esRegistro = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function sanearZona(v: unknown): ZonaEscenario | null {
  if (!esRegistro(v) || typeof v.id !== "string" || !v.id) return null;
  const nombre = limpiarNombre(v.nombre);
  if (!nombre) return null;
  const afinidad = OCUPACIONES_MUNDO.find((o) => o === v.afinidad) ?? null;
  return { id: v.id.slice(0, 60), nombre, afinidad };
}

function sanearEscenario(v: unknown): Escenario | null {
  if (!esRegistro(v) || typeof v.id !== "string" || !v.id) return null;
  const nombre = limpiarNombre(v.nombre);
  if (!nombre) return null;
  const zonas: ZonaEscenario[] = [];
  for (const z of Array.isArray(v.zonas) ? v.zonas : []) {
    const zona = sanearZona(z);
    if (zona && !zonas.some((q) => q.id === zona.id)) zonas.push(zona);
  }
  const visibilidad = VISIBILIDADES_ESCENARIO.find((x) => x === v.visibilidad) ?? "privada";
  const grupoId = typeof v.grupoId === "string" && v.grupoId.trim() ? v.grupoId.trim().slice(0, 80) : undefined;
  const servidorUrl = typeof v.servidorUrl === "string" && /^https:\/\//i.test(v.servidorUrl) ? v.servidorUrl.slice(0, 300) : undefined;
  return {
    id: v.id.slice(0, 80),
    nombre,
    // Un escenario «de un grupo» sin grupo no se puede compartir con nadie: vuelve a privado.
    visibilidad: visibilidad === "grupo" && !grupoId ? "privada" : visibilidad,
    ...(grupoId && visibilidad === "grupo" ? { grupoId } : {}),
    ...(servidorUrl ? { servidorUrl } : {}),
    zonas: (zonas.length > 0 ? zonas : copiaZonas(ZONAS_POR_DEFECTO)).slice(0, MAX_ZONAS),
    creadoEn: esNumero(v.creadoEn) ? v.creadoEn : 0,
    actualizadoEn: esNumero(v.actualizadoEn) ? v.actualizadoEn : 0,
  };
}

/** Lo leído del disco → almacén válido (siempre con al menos un escenario y uno activo). */
export function sanearAlmacen(v: unknown, ahora: number): AlmacenEscenarios {
  const escenarios: Escenario[] = [];
  const lista = esRegistro(v) && Array.isArray(v.escenarios) ? v.escenarios : [];
  for (const crudo of lista) {
    const e = sanearEscenario(crudo);
    if (e && !escenarios.some((x) => x.id === e.id)) escenarios.push(e);
  }
  if (escenarios.length === 0) return almacenInicial(ahora);
  const pedido = esRegistro(v) && typeof v.activoId === "string" ? v.activoId : "";
  return { version: 1, activoId: escenarios.some((e) => e.id === pedido) ? pedido : escenarios[0].id, escenarios };
}

export function leerEscenarios(ahora: number = Date.now()): AlmacenEscenarios {
  try {
    if (typeof localStorage === "undefined" || localStorage === null) return almacenInicial(ahora);
    const bruto = localStorage.getItem(CLAVE_ESCENARIOS);
    return sanearAlmacen(bruto ? JSON.parse(bruto) : null, ahora);
  } catch {
    return almacenInicial(ahora);
  }
}

/** Guarda los escenarios en este aparato. `false` si no cabe o no hay almacenamiento. */
export function guardarEscenarios(almacen: AlmacenEscenarios): boolean {
  try {
    if (typeof localStorage === "undefined" || localStorage === null) return false;
    localStorage.setItem(CLAVE_ESCENARIOS, JSON.stringify(almacen));
    return true;
  } catch {
    return false;
  }
}
