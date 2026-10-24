/**
 * StarSeed XR · ACCIONES Y LECTURA DE FUENTES (XR1010L). Módulo PURO: no toca React, red ni WebGL.
 * `ejecutarAccion` traduce cada una de las 11 acciones del núcleo a su callback y nunca deja a
 * nadie atrapado: `salir` siempre llega y cualquier fallo se captura y se registra.
 * `leerFuentes` recorre `session.inputSources` por `targetRayMode`, sin índices fijos (Vision Pro
 * cambia el orden). El motor que consume estas lecturas vive en `use-entrada-xr.ts`.
 */
import type { Mano, Vec3 } from "../../../lib/xr/tipos";
import type { AccionXR } from "../../../lib/xr/vinculos-xr";

export interface ContextoAcciones {
  recentrar(): void; salir(): Promise<void>; abrirMenuMano(): void; abrirDock(): void;
  hablar(sube: boolean): void; atras(): void; seleccionar(): void; agarrar(sube: boolean): void;
  teletransporte(): void; girar(dir: -1 | 1): void;
}

export type ModoFuente = "tracked-pointer" | "gaze" | "screen" | "transient-pointer" | "desconocido";
export interface FuenteXR {
  handedness?: string;
  targetRayMode?: string;
  gamepad?: { buttons?: ReadonlyArray<{ pressed?: boolean; value?: number }>; axes?: ReadonlyArray<number> } | null;
  hand?: unknown;
}
export interface SesionXR { inputSources?: Iterable<FuenteXR> | ArrayLike<FuenteXR> }
export interface LecturaFuente {
  mano: Mano | "cualquiera"; modo: ModoFuente; botones: boolean[]; ejes: number[];
  esMano: boolean; articulaciones: Record<string, Vec3>;
}
export type ResolverJunta = (junta: unknown, nombre: string) => Vec3 | null;
export interface LecturaMandoXR { botones: boolean[]; ejes: number[] }

function registrarFallo(accion: AccionXR, error: unknown): void {
  console.warn(`[xr] «${accion}» no pudo ejecutarse; la persona sigue pudiendo salir.`, error);
}

function intentar(accion: AccionXR, fn: () => void | Promise<void>): void {
  try {
    const resultado = fn();
    if (resultado && typeof resultado.then === "function") {
      resultado.catch((error) => registrarFallo(accion, error));
    }
  } catch (error) {
    registrarFallo(accion, error);
  }
}

/** Una acción del núcleo → su callback. `activo` distingue pulsar de soltar en agarrar/hablar. */
export function ejecutarAccion(accion: AccionXR, ctx: ContextoAcciones, activo = true): void {
  switch (accion) {
    case "seleccionar": return intentar(accion, () => ctx.seleccionar());
    case "agarrar": return intentar(accion, () => ctx.agarrar(activo));
    case "menu-mano": return intentar(accion, () => ctx.abrirMenuMano());
    case "abrir-dock": return intentar(accion, () => ctx.abrirDock());
    case "recentrar": return intentar(accion, () => ctx.recentrar());
    case "salir": return intentar(accion, () => ctx.salir());
    case "hablar": return intentar(accion, () => ctx.hablar(activo));
    case "teletransporte": return intentar(accion, () => ctx.teletransporte());
    case "giro-izquierda": return intentar(accion, () => ctx.girar(-1));
    case "giro-derecha": return intentar(accion, () => ctx.girar(1));
    case "atras": return intentar(accion, () => ctx.atras());
  }
}

const MODOS_FUENTE: readonly ModoFuente[] = ["tracked-pointer", "gaze", "screen", "transient-pointer"];

function listaFuentes(fuentes: SesionXR["inputSources"]): FuenteXR[] {
  if (!fuentes) return [];
  try { return Array.from(fuentes as Iterable<FuenteXR>); } catch { return []; }
}

function manoDe(handedness: string | undefined): Mano | "cualquiera" {
  return handedness === "left" ? "izquierda" : handedness === "right" ? "derecha" : "cualquiera";
}

function puntoDe(valor: unknown, resolver?: ResolverJunta, nombre = ""): Vec3 | null {
  const resuelto = resolver?.(valor, nombre);
  if (resuelto) return resuelto;
  if (Array.isArray(valor) && valor.length >= 3 && valor.slice(0, 3).every((n) => typeof n === "number")) {
    return [valor[0], valor[1], valor[2]] as Vec3;
  }
  const p = valor as { x?: unknown; y?: unknown; z?: unknown } | null;
  return p && typeof p.x === "number" && typeof p.y === "number" && typeof p.z === "number" ? [p.x, p.y, p.z] : null;
}

function articulacionesDe(mano: unknown, resolver?: ResolverJunta): Record<string, Vec3> {
  const salida: Record<string, Vec3> = {};
  if (!mano || typeof mano !== "object") return salida;
  const visitar = (nombre: string, valor: unknown) => {
    const punto = puntoDe(valor, resolver, nombre);
    if (punto) salida[nombre] = punto;
  };
  const mapa = mano as Map<string, unknown>;
  if (typeof mapa.forEach === "function") mapa.forEach((valor, nombre) => visitar(String(nombre), valor));
  else for (const [nombre, valor] of Object.entries(mano as Record<string, unknown>)) visitar(nombre, valor);
  return salida;
}

/** Lecturas crudas y coherentes de cada `inputSource`, sin depender del orden ni de índices fijos. */
export function leerFuentes(sesion: SesionXR | null | undefined, resolver?: ResolverJunta): LecturaFuente[] {
  return listaFuentes(sesion?.inputSources).map((fuente) => {
    const modo = MODOS_FUENTE.includes(fuente.targetRayMode as ModoFuente)
      ? (fuente.targetRayMode as ModoFuente)
      : "desconocido";
    const botones = (fuente.gamepad?.buttons ?? []).map(
      (boton) => boton.pressed === true || (typeof boton.value === "number" && boton.value > 0.5),
    );
    const ejes = (fuente.gamepad?.axes ?? []).map((eje) => (Number.isFinite(eje) ? eje : 0));
    return {
      mano: manoDe(fuente.handedness), modo, botones, ejes,
      esMano: !!fuente.hand, articulaciones: articulacionesDe(fuente.hand, resolver),
    };
  });
}
